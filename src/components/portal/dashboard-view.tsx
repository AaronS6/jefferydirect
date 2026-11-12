"use client";

// Dashboard — personalized greeting, quick actions, KPIs, recent orders,
// quick reorder strip and an activity rail.

import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  FileText,
  Package,
  PackagePlus,
  RefreshCcw,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCell, KpiStrip } from "@/components/shared/kpi-card";
import { Money } from "@/components/shared/money";
import { StockBadge, StatusBadge, statusDotTone } from "@/components/shared/status-badge";
import { ProductArtwork } from "@/components/shared/product-artwork";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { CustomerDashboard, OrderListItem } from "@/types";
import { formatDate, greetingForNow, timeAgo } from "@/lib/date";
import { ORDER_TERMINAL_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AnnouncementsStrip } from "./announcements-strip";
import { ErrorAlert, KpiSkeletonRow, Mono, RowsSkeleton, SectionCard } from "./portal-bits";
import { ProductRequestSheet } from "./product-request-sheet";

// Activity rail — typed dots instead of icon circles. Tone families follow the
// shared --status-* token system so both themes stay coherent.
const ACTIVITY_TONES: Record<string, string> = {
  ORDER: "done",
  QUOTATION: "pending",
  DOCUMENT: "neutral",
  MESSAGE: "active",
  SYSTEM: "neutral",
};

const EASE = [0.22, 1, 0.36, 1] as const;

// Day label for the activity rail grouping — Today / Yesterday / date.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return formatDate(d);
}

type Activity = CustomerDashboard["activity"][number];
type FrequentlyOrdered = CustomerDashboard["frequentlyOrdered"][number];

export function DashboardView() {
  const session = useAppStore((s) => s.session);
  const navigate = useAppStore((s) => s.navigate);
  const reduce = useReducedMotion();
  const firstName = session?.user.name.split(" ")[0] ?? "there";

  // Product requests are a write action — hidden for read-only users.
  const canRequestProduct =
    session?.user.orgRole === "ORG_ADMIN" || session?.user.orgRole === "PURCHASING";
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);

  // Quiet enter motion — fade-only under prefers-reduced-motion.
  const rise: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
  };
  const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customer-dashboard"],
    queryFn: () => api.get<CustomerDashboard>("/api/customer/dashboard"),
  });

  // Fetched in parallel so the reorder strip can deep-link to the exact order.
  const { data: orders } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<OrderListItem[]>("/api/customer/orders"),
  });

  if (error) {
    return (
      <motion.div {...enter}>
        <PageHeader title={`${greetingForNow()}, ${firstName}.`} />
        <ErrorAlert message="We could not load your dashboard." onRetry={() => refetch()} />
      </motion.div>
    );
  }

  if (isLoading || !data) {
    return (
      <motion.div {...enter}>
        <PageHeader title={`${greetingForNow()}, ${firstName}.`} />
        <div className="space-y-8">
          <KpiSkeletonRow />
          <div className="rounded-[14px] border bg-card p-5 shadow-xs">
            <Skeleton className="h-4 w-40" />
            <RowsSkeleton rows={3} className="mt-4" />
          </div>
        </div>
      </motion.div>
    );
  }

  function openLastOrder(item: FrequentlyOrdered) {
    const order = (orders ?? []).find((o) => o.orderNumber === item.lastOrderNumber);
    if (order) {
      navigate("order-detail", { id: order.id });
    } else {
      navigate("orders");
    }
  }

  // Presentation-only grouping of the activity feed into day buckets.
  const activityGroups: { day: string; items: Activity[] }[] = [];
  for (const a of data.activity) {
    const day = dayLabel(a.createdAt);
    const lastGroup = activityGroups[activityGroups.length - 1];
    if (lastGroup && lastGroup.day === day) lastGroup.items.push(a);
    else activityGroups.push({ day, items: [a] });
  }

  // Upcoming deliveries — the next five open orders with an estimated
  // delivery date, grouped by week (presentation only).
  const upcomingDeliveries: { order: OrderListItem; date: Date }[] = (orders ?? [])
    .filter((o) => o.estimatedDelivery && !ORDER_TERMINAL_STATUSES.includes(o.status))
    .map((o) => ({ order: o, date: new Date(o.estimatedDelivery as string) }))
    .filter((x) => !Number.isNaN(x.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);

  const deliveryWeekGroups: { label: string; items: typeof upcomingDeliveries }[] = [];
  if (upcomingDeliveries.length > 0) {
    const startOfWeek = (d: Date) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
      return x.getTime();
    };
    const thisWeekStart = startOfWeek(new Date());
    for (const entry of upcomingDeliveries) {
      const t = entry.date.getTime();
      const label =
        t < thisWeekStart + 7 * 86_400_000
          ? "This week"
          : t < thisWeekStart + 14 * 86_400_000
            ? "Next week"
            : "Later";
      const lastGroup = deliveryWeekGroups[deliveryWeekGroups.length - 1];
      if (lastGroup && lastGroup.label === label) lastGroup.items.push(entry);
      else deliveryWeekGroups.push({ label, items: [entry] });
    }
  }

  return (
    <motion.div {...enter}>
      {/* ── Hero ── */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-display text-display-sm font-normal text-balance text-foreground">
            {greetingForNow()}, {firstName}.
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">
          <Button size="lg" onClick={() => navigate("catalog")}>
            <Package className="size-4" aria-hidden /> Browse products
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate("quotations", { aux: "new" })}>
            <FileText className="size-4" aria-hidden /> Request a quote
          </Button>
          {canRequestProduct && (
            <Button variant="outline" size="lg" onClick={() => setRequestSheetOpen(true)}>
              <PackagePlus className="size-4" aria-hidden /> Request a product
            </Button>
          )}
        </div>
      </div>

      {/* ── Announcements — unread notifications first, so nothing is missed ── */}
      <AnnouncementsStrip />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-8">
          {/* KPIs — one connected panel of plain localized numerals */}
          <motion.div variants={stagger} initial="hidden" animate="visible">
            <KpiStrip>
              <motion.div variants={rise}>
                <KpiCell
                  label="Active orders"
                  value={data.activeOrders.toLocaleString("en-CA")}
                  onClick={() => navigate("orders")}
                  className="h-full w-full"
                />
              </motion.div>
              <motion.div variants={rise}>
                <KpiCell
                  label="Open quotes"
                  value={data.pendingQuotes.toLocaleString("en-CA")}
                  onClick={() => navigate("quotations")}
                  className="h-full w-full"
                />
              </motion.div>
              <motion.div variants={rise}>
                <KpiCell
                  label="Invoices"
                  value={data.outstandingInvoices.toLocaleString("en-CA")}
                  onClick={() => navigate("documents")}
                  className="h-full w-full"
                />
              </motion.div>
              <motion.div variants={rise}>
                <KpiCell
                  label="Messages"
                  value={data.openMessages.toLocaleString("en-CA")}
                  onClick={() => navigate("support")}
                  className="h-full w-full"
                />
              </motion.div>
            </KpiStrip>
          </motion.div>

          {/* Expected updates — slim strip, only when the team committed to dates */}
          {data.nextExpectedUpdates.length > 0 && (
            <div className="rounded-[14px] border bg-card shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3">
                <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden /> Next updates
                </p>
              </div>
              <ul className="divide-y">
                {data.nextExpectedUpdates.slice(0, 5).map((u) => (
                  <li key={u.orderId}>
                    <button
                      onClick={() => navigate("order-detail", { id: u.orderId })}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-left transition-colors hover:bg-accent/70"
                    >
                      <Mono className="text-body-sm font-medium text-foreground">{u.orderNumber}</Mono>
                      <StatusBadge status={u.status} kind="order" />
                      <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-caption text-muted-foreground">
                        next update by
                        <span className="tnum font-medium text-foreground">
                          {formatDate(u.nextUpdateDate)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Upcoming deliveries — next five open orders by estimated date */}
          {upcomingDeliveries.length > 0 && (
            <div className="rounded-[14px] border bg-card shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3">
                <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
                  <Truck className="size-3.5" aria-hidden /> Upcoming deliveries
                </p>
                <p className="tnum text-caption text-muted-foreground">{upcomingDeliveries.length}</p>
              </div>
              <ul className="divide-y">
                {deliveryWeekGroups.map((group) => (
                  <li key={group.label} className="px-5 py-3">
                    <p className="text-micro text-muted-foreground">{group.label}</p>
                    <ul className="mt-2 space-y-1">
                      {group.items.map(({ order }) => (
                        <li key={order.id}>
                          <button
                            onClick={() => navigate("order-detail", { id: order.id })}
                            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                          >
                            <Mono className="text-body-sm font-medium text-foreground">{order.orderNumber}</Mono>
                            <StatusBadge status={order.status} kind="order" />
                            <span className="ml-auto tnum whitespace-nowrap text-caption text-muted-foreground">
                              {formatDate(order.estimatedDelivery)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recent orders */}
          <SectionCard
            title="Recent orders"
            contentClassName="p-0 sm:p-0"
            actions={
              <Button
                variant="link"
                size="sm"
                className="h-7 gap-0.5 px-0 text-caption text-muted-foreground hover:text-foreground"
                onClick={() => navigate("orders")}
              >
                View all <ChevronRight className="size-3.5" aria-hidden />
              </Button>
            }
          >
            {data.recentOrders.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No orders yet"
                action={<Button onClick={() => navigate("catalog")}>Browse products</Button>}
              />
            ) : (
              <>
                {/* Desktop table — cards take over below lg; a 248px sidebar
                    leaves too little table width at md */}
                <div className="hidden lg:block">
                  <Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Order</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="hidden w-[34%] lg:table-cell">Summary</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentOrders.map((o) => (
                        <TableRow
                          key={o.id}
                          tabIndex={0}
                          onClick={() => navigate("order-detail", { id: o.id })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") navigate("order-detail", { id: o.id });
                          }}
                          className="cursor-pointer"
                        >
                          <TableCell className="whitespace-nowrap">
                            <Mono className="text-body-sm font-medium text-foreground">{o.orderNumber}</Mono>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                          <TableCell className="hidden max-w-[300px] truncate text-muted-foreground lg:table-cell">{o.itemSummary}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <Money cents={o.totalCents} className="font-medium" />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1.5">
                              <StatusBadge status={o.status} kind="order" />
                              {o.nextUpdateDate && (
                                <span
                                  title="Next update expected by this date"
                                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground"
                                >
                                  <CalendarClock className="size-3" aria-hidden />
                                  <span className="tnum">{formatDate(o.nextUpdateDate)}</span>
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <ChevronRight className="size-4" aria-hidden />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile / tablet stacked cards */}
                <ul className="divide-y lg:hidden">
                  {data.recentOrders.map((o) => (
                    <li key={o.id}>
                      <button
                        onClick={() => navigate("order-detail", { id: o.id })}
                        className="flex w-full items-start justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/70"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <Mono className="text-body-sm font-medium text-foreground">{o.orderNumber}</Mono>
                            <StatusBadge status={o.status} kind="order" />
                          </span>
                          <span className="mt-1 block truncate text-caption text-muted-foreground">
                            {formatDate(o.createdAt)} · {o.itemSummary}
                          </span>
                          {o.nextUpdateDate && (
                            <span
                              title="Next update expected by this date"
                              className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground"
                            >
                              <CalendarClock className="size-3" aria-hidden />
                              <span className="tnum">next update {formatDate(o.nextUpdateDate)}</span>
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Money cents={o.totalCents} className="text-body-sm font-medium" />
                          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          {/* Quick reorder — horizontal strip of the most-ordered products */}
          {data.frequentlyOrdered.length > 0 && (
            <SectionCard title="Order again">
              <motion.ul
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="-mx-1 flex list-none gap-3 overflow-x-auto px-1 pb-2"
              >
                {data.frequentlyOrdered.map((item) => (
                  <motion.li key={item.productId} variants={rise} className="w-[262px] shrink-0">
                    <ReorderCard item={item} onOpenLastOrder={() => openLastOrder(item)} />
                  </motion.li>
                ))}
              </motion.ul>
            </SectionCard>
          )}
        </div>

        {/* ── Activity rail ── */}
        <aside className="min-w-0" aria-label="Recent account activity">
          <SectionCard
            title="Recent activity"
            actions={
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-caption text-muted-foreground hover:text-foreground" onClick={() => navigate("notifications")}>
                View all <ChevronRight className="size-3.5" aria-hidden />
              </Button>
            }
            contentClassName="p-0 sm:p-0"
          >
            {data.activity.length === 0 ? (
              <p className="px-5 py-10 text-center text-body-sm text-muted-foreground">Nothing new.</p>
            ) : (
              <ul className="divide-y">
                {activityGroups.map((group) => (
                  <li key={group.day} className="px-5 py-4">
                    <p className="text-micro text-muted-foreground">{group.day}</p>
                    <ol className="mt-3">
                      {group.items.map((a, i) => (
                        <ActivityRow key={a.id} item={a} last={i === group.items.length - 1} />
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>

      {canRequestProduct && (
        <ProductRequestSheet open={requestSheetOpen} onOpenChange={setRequestSheetOpen} />
      )}
    </motion.div>
  );
}

function ReorderCard({ item, onOpenLastOrder }: { item: FrequentlyOrdered; onOpenLastOrder: () => void }) {
  return (
    <div className="flex h-full gap-3.5 rounded-[14px] border bg-card p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-px hover:shadow-md">
      <ProductArtwork sku={item.sku} compact className="hidden shrink-0 sm:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-body-sm font-semibold leading-snug text-foreground">{item.name}</p>
        <p className="mt-1 truncate text-caption text-muted-foreground">
          <Mono>{item.sku}</Mono>
          <span aria-hidden> · </span>
          last ordered {formatDate(item.lastOrderDate)}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          {item.priceCents !== null ? (
            <div className="min-w-0">
              <Money cents={item.priceCents} className="text-body font-semibold" />
              <p className="tnum mt-0.5 whitespace-nowrap text-caption text-muted-foreground">
                last order {item.lastQty.toLocaleString()} units
              </p>
            </div>
          ) : (
            <StockBadge status="ENQUIRY_ONLY" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 whitespace-nowrap"
            onClick={onOpenLastOrder}
          >
            <RefreshCcw className="size-3.5" aria-hidden />
            Reorder
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ item, last }: { item: Activity; last: boolean }) {
  const family = ACTIVITY_TONES[item.kind] ?? "neutral";
  return (
    <li className="relative flex gap-3.5 pb-4 last:pb-0">
      {/* hairline spine between entries */}
      {!last && (
        <span
          aria-hidden
          className="absolute left-[3.5px] top-[16px] h-[calc(100%-14px)] w-px bg-border"
        />
      )}
      <span
        aria-hidden
        className={cn("relative z-10 mt-[3px] size-2 shrink-0 rounded-full", statusDotTone(family))}
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium leading-snug text-foreground">{item.title}</p>
        {item.detail && <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{item.detail}</p>}
        <p className="mt-1 text-caption text-muted-foreground/80">{timeAgo(item.createdAt)}</p>
      </div>
    </li>
  );
}
