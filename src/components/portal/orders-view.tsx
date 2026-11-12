"use client";

// Orders — filter tabs (active / delivered / all), client-side search, a
// responsive table with stacked mobile cards and hover reorder, plus a
// month-calendar view of estimated deliveries.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronRight,
  List,
  ReceiptText,
  RefreshCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { StatusBadge, OrderSourceBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useAppStore, useCartStore } from "@/store/app-store";
import type { OrderListItem, ReorderDraft } from "@/types";
import { ORDER_TERMINAL_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ErrorAlert, Mono, RowsSkeleton } from "./portal-bits";

const EASE = [0.22, 1, 0.36, 1] as const;
const REORDER_NOTE_KEY = "clienthub-reorder-note";

type Filter = "all" | "active" | "delivered";

const FILTER_TABS: { value: Filter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "delivered", label: "Delivered" },
  { value: "all", label: "All" },
];

// Local-day key shared by the calendar dots and the month list.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function OrdersView() {
  const navigate = useAppStore((s) => s.navigate);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => new Date());
  const [unavailableDraft, setUnavailableDraft] = useState<ReorderDraft | null>(null);
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const { data: orders, isLoading, error, refetch } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<OrderListItem[]>("/api/customer/orders"),
  });

  // Tab-level filter — shared by the list and the calendar.
  const tabFiltered = useMemo(() => {
    if (!orders) return [];
    switch (filter) {
      case "active":
        return orders.filter((o) => !ORDER_TERMINAL_STATUSES.includes(o.status));
      case "delivered":
        return orders.filter((o) => o.status === "DELIVERED");
      default:
        return orders;
    }
  }, [orders, filter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.itemSummary.toLowerCase().includes(q),
    );
  }, [tabFiltered, search]);

  // Calendar source data — every visible order with an estimated delivery.
  const deliveryDays = useMemo(() => {
    const days = new Set<string>();
    for (const o of tabFiltered) {
      if (!o.estimatedDelivery) continue;
      const d = new Date(o.estimatedDelivery);
      if (!Number.isNaN(d.getTime())) days.add(dayKey(d));
    }
    return days;
  }, [tabFiltered]);

  const monthOrders = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    return tabFiltered
      .filter((o) => o.estimatedDelivery)
      .map((o) => ({ order: o, date: new Date(o.estimatedDelivery as string) }))
      .filter(
        (x) =>
          !Number.isNaN(x.date.getTime()) &&
          x.date.getFullYear() === y &&
          x.date.getMonth() === m,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [tabFiltered, month]);

  const open = (o: OrderListItem) => navigate("order-detail", { id: o.id });

  // Counts per filter for the underline tab bar (derived, presentation only).
  const countFor = (f: Filter): number => {
    if (!orders) return 0;
    switch (f) {
      case "active":
        return orders.filter((o) => !ORDER_TERMINAL_STATUSES.includes(o.status)).length;
      case "delivered":
        return orders.filter((o) => o.status === "DELIVERED").length;
      default:
        return orders.length;
    }
  };

  // ── Reorder from the list — current pricing; unavailable items confirm ──
  const reorderMutation = useMutation({
    mutationFn: (o: OrderListItem) =>
      api.get<ReorderDraft>(`/api/customer/orders/${o.id}/reorder-data`),
    onSuccess: (draft) => {
      if (draft.lines.some((l) => l.unavailable)) setUnavailableDraft(draft);
      else finishReorder(draft);
    },
    onError: () => toast({ title: "Could not load reorder", variant: "destructive" }),
  });

  function finishReorder(draft: ReorderDraft) {
    const available = draft.lines.filter((l) => !l.unavailable);
    if (available.length === 0) return;
    const skipped = draft.lines.length - available.length;
    useCartStore.getState().loadDraft(available);
    if (skipped > 0) {
      try {
        sessionStorage.setItem(
          REORDER_NOTE_KEY,
          JSON.stringify({ source: draft.sourceOrderNumber, skipped }),
        );
      } catch {
        // storage unavailable — the cart shows its default note instead
      }
    }
    toast({ title: "Cart loaded" });
    navigate("cart");
  }

  const reorder = (o: OrderListItem) => reorderMutation.mutate(o);

  const hasSearch = search.trim() !== "";
  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <motion.div {...enter}>
      <PageHeader title="Orders" />

      {/* Tab bar with counts, search (list mode), list/calendar toggle */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b">
        <div role="tablist" aria-label="Filter orders" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {FILTER_TABS.map((t) => {
            const active = filter === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.value)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
                  active
                    ? "border-kraft-strong font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {orders !== undefined && (
                  <span className="tnum text-caption text-muted-foreground">{countFor(t.value)}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2.5">
          {mode === "list" && (
            <div className="relative min-w-0 flex-1 basis-40 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search orders"
                aria-label="Search orders"
                className="h-9 w-full pl-9 sm:w-56"
              />
            </div>
          )}
          <div
            role="group"
            aria-label="Layout"
            className="flex shrink-0 rounded-md border bg-card p-0.5 shadow-xs"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={mode === "list"}
              aria-label="List layout"
              onClick={() => setMode("list")}
              className={cn("rounded-[6px]", mode === "list" ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              <List className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={mode === "calendar"}
              aria-label="Calendar layout"
              onClick={() => setMode("calendar")}
              className={cn("rounded-[6px]", mode === "calendar" ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              <CalendarDays className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorAlert message="We could not load your orders." onRetry={() => refetch()} />
      ) : isLoading || !orders ? (
        <div className="rounded-[14px] border bg-card shadow-xs">
          <div className="border-b px-5 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-5">
            <RowsSkeleton rows={5} />
          </div>
        </div>
      ) : mode === "calendar" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
          {/* Month view — kraft dots mark days with estimated deliveries */}
          <div className="overflow-x-auto rounded-[14px] border bg-card p-3 shadow-xs sm:p-4">
            <Calendar
              month={month}
              onMonthChange={setMonth}
              className="mx-auto bg-card"
              modifiers={{ delivery: (d) => deliveryDays.has(dayKey(d)) }}
              modifiersClassNames={{
                delivery:
                  "relative after:pointer-events-none after:absolute after:bottom-[5px] after:left-1/2 after:size-[5px] after:-translate-x-1/2 after:rounded-full after:bg-kraft-strong after:content-['']",
              }}
            />
          </div>
          {/* Compact list of the visible month's deliveries */}
          <div className="min-w-0 rounded-[14px] border bg-card shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3">
              <p className="text-micro text-muted-foreground">Deliveries · {monthLabel}</p>
              <p className="tnum text-caption text-muted-foreground">{monthOrders.length}</p>
            </div>
            {monthOrders.length === 0 ? (
              <p className="px-5 py-8 text-center text-body-sm text-muted-foreground">
                No deliveries this month
              </p>
            ) : (
              <ul className="max-h-[420px] divide-y overflow-y-auto">
                {monthOrders.map(({ order, date }) => (
                  <li key={order.id}>
                    <button
                      onClick={() => open(order)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                    >
                      <Mono className="text-body-sm font-medium text-foreground">{order.orderNumber}</Mono>
                      <StatusBadge status={order.status} kind="order" />
                      <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-caption text-muted-foreground">
                        Est. delivery
                        <span className="tnum font-medium text-foreground">{formatDate(date)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={
            hasSearch
              ? "No orders match"
              : filter === "all"
                ? orders.length === 0
                  ? "No orders yet"
                  : "Nothing here"
                : filter === "active"
                  ? "No active orders"
                  : "No delivered orders"
          }
          action={
            orders.length === 0 ? (
              <Button variant="outline" onClick={() => navigate("catalog")}>
                Browse products
              </Button>
            ) : hasSearch ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : filter !== "all" ? (
              <Button variant="outline" onClick={() => setFilter("all")}>
                Show all orders
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-[14px] border bg-card shadow-xs">
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Est. delivery</TableHead>
                  <TableHead className="w-[96px]" />
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    tabIndex={0}
                    onClick={() => open(o)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") open(o);
                    }}
                    className="group cursor-pointer"
                  >
                    <TableCell className="whitespace-nowrap">
                      <Mono className="text-body-sm font-medium text-foreground">{o.orderNumber}</Mono>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-0 truncate text-muted-foreground">{o.itemSummary}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Money cents={o.totalCents} className="font-medium" />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusBadge status={o.status} kind="order" />
                        <div className="flex flex-wrap items-center gap-1.5">
                          {o.sourceType && <OrderSourceBadge source={o.sourceType} />}
                          {o.hasPendingChangeRequest && (
                            <span
                              title="A change request on this order is awaiting Jeffery Group's review"
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-kraft/40 bg-kraft-soft px-2 py-0.5 text-caption font-medium text-kraft-ink"
                            >
                              <span className="size-1.5 rounded-full bg-kraft-strong" aria-hidden />
                              Change pending
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {o.estimatedDelivery ? formatDate(o.estimatedDelivery) : ""}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center justify-end">
                        {o.itemCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 whitespace-nowrap px-2.5 text-caption text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                            disabled={reorderMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              reorder(o);
                            }}
                            aria-label={`Reorder ${o.orderNumber}`}
                          >
                            <RefreshCcw className="size-3.5" aria-hidden />
                            Reorder
                          </Button>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <ChevronRight className="size-4" aria-hidden />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile stacked cards */}
          <ul className="divide-y md:hidden">
            {filtered.map((o) => (
              <li key={o.id} className="group relative">
                {/* Stretched link — the whole row opens the order */}
                <button
                  type="button"
                  onClick={() => open(o)}
                  className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35"
                  aria-label={`View order ${o.orderNumber}`}
                />
                <div className="pointer-events-none relative z-20 flex items-start justify-between gap-3 px-5 py-3.5 transition-colors group-hover:bg-accent/70">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <Mono className="text-body-sm font-medium text-foreground">{o.orderNumber}</Mono>
                      <StatusBadge status={o.status} kind="order" />
                      {o.sourceType && <OrderSourceBadge source={o.sourceType} />}
                      {o.hasPendingChangeRequest && (
                        <span
                          title="A change request on this order is awaiting Jeffery Group's review"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-kraft/40 bg-kraft-soft px-2 py-0.5 text-caption font-medium text-kraft-ink"
                        >
                          <span className="size-1.5 rounded-full bg-kraft-strong" aria-hidden />
                          Change pending
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-caption text-muted-foreground">
                      {formatDate(o.createdAt)} · {o.itemSummary}
                    </span>
                    {o.estimatedDelivery && (
                      <span className="mt-0.5 block text-caption text-muted-foreground">
                        Est. delivery {formatDate(o.estimatedDelivery)}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Money cents={o.totalCents} className="text-body-sm font-medium" />
                    {o.itemCount > 0 && (
                      <span className="pointer-events-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-caption text-muted-foreground hover:text-foreground"
                          disabled={reorderMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            reorder(o);
                          }}
                          aria-label={`Reorder ${o.orderNumber}`}
                        >
                          <RefreshCcw className="size-3.5" aria-hidden />
                          Reorder
                        </Button>
                      </span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Unavailable items notice */}
      <Dialog open={unavailableDraft !== null} onOpenChange={(o) => !o && setUnavailableDraft(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4.5 text-kraft-ink" aria-hidden />
              Some items unavailable
            </DialogTitle>
            <DialogDescription>
              These products from {unavailableDraft?.sourceOrderNumber} are inactive or not approved for
              your account. Available items load if you continue.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-56 overflow-y-auto overscroll-contain rounded-[10px] border divide-y">
            {(unavailableDraft?.lines ?? [])
              .filter((l) => l.unavailable)
              .map((l) => (
                <li key={l.productId} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-body-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.name}</span>
                    <Mono className="text-muted-foreground">{l.sku}</Mono>
                  </span>
                  <span className="tnum shrink-0 text-caption text-muted-foreground">
                    qty {l.qty.toLocaleString()}
                  </span>
                </li>
              ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUnavailableDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={(unavailableDraft?.lines ?? []).every((l) => l.unavailable)}
              onClick={() => {
                if (unavailableDraft) finishReorder(unavailableDraft);
                setUnavailableDraft(null);
              }}
            >
              <Check className="size-4" aria-hidden />
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
