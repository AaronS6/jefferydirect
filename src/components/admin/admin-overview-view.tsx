"use client";

// Administration overview — KPI tiles, recent orders, pending tasks, an
// activity feed and a real order-activity chart (recharts, restrained styling).

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as ChartTooltipPrimitive,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronRight,
  FileStack,
  MessageSquare,
  ReceiptText,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCell, KpiStrip } from "@/components/shared/kpi-card";
import { StatusBadge, statusDotTone } from "@/components/shared/status-badge";
import { Money, MoneyWithCode } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/date";
import { useAppStore, type ViewName } from "@/store/app-store";
import type { AdminDashboard } from "@/types";
import { InlineError, KpiGridSkeleton, KindMark, RowsSkeleton, SectionCard, Td, Th, ViewEnter } from "./admin-ui";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const CHART_REQUESTS = "var(--chart-2)"; // kraft
const CHART_ORDERS = "var(--chart-1)"; // ink

export function AdminOverviewView() {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.get<AdminDashboard>("/api/admin/overview"),
  });

  if (isError) {
    return (
      <div>
        <PageHeader title="Overview" />
        <InlineError message={error instanceof Error ? error.message : "Could not load the overview."} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Overview" />

      {isLoading || !data ? (
        <div className="space-y-6">
          <KpiGridSkeleton count={4} />
          <SectionCard>
            <RowsSkeleton rows={5} />
          </SectionCard>
        </div>
      ) : (
        <ViewEnter className="space-y-6">
          {/* Primary KPI tiles — the four review queues */}
          <KpiStrip>
            <KpiCell
              label="New orders"
              value={data.newOrderRequests.toLocaleString("en-CA")}
              onClick={() => navigate("admin-orders", { aux: "SUBMITTED" })}
            />
            <KpiCell
              label="Pending quotes"
              value={data.pendingQuotations.toLocaleString("en-CA")}
              onClick={() => navigate("admin-quotes", { aux: "REQUESTED" })}
            />
            <KpiCell
              label="Confirmed orders"
              value={data.confirmedOrders.toLocaleString("en-CA")}
              onClick={() => navigate("admin-orders", { aux: "CONFIRMED" })}
            />
            <KpiCell
              label="In production"
              value={data.inProduction.toLocaleString("en-CA")}
              onClick={() => navigate("admin-orders", { aux: "IN_PRODUCTION" })}
            />
          </KpiStrip>

          {/* Secondary stats — compact hairline strip */}
          <div className="grid grid-cols-1 divide-y divide-border/70 overflow-hidden rounded-[14px] border bg-card shadow-xs sm:grid-cols-3 sm:divide-y-0 [&>*+*]:sm:border-l">
            <button
              onClick={() => navigate("admin-customers")}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:bg-accent/60"
            >
              <span className="flex items-center gap-2 text-micro text-muted-foreground">
                <Users className="size-3.5" aria-hidden /> Active customers
              </span>
              <span className="tnum text-lead font-medium">{data.activeCustomers}</span>
            </button>
            <button
              onClick={() => navigate("admin-notifications")}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:bg-accent/60"
            >
              <span className="flex items-center gap-2 text-micro text-muted-foreground">
                <MessageSquare className="size-3.5" aria-hidden /> Open messages
              </span>
              <span className="tnum text-lead font-medium">{data.openMessages}</span>
            </button>
            <button
              onClick={() => navigate("admin-documents", { aux: "INVOICE" })}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:bg-accent/60"
            >
              <span className="flex items-center gap-2 text-micro text-muted-foreground">
                <ReceiptText className="size-3.5" aria-hidden /> Invoiced volume
              </span>
              <span className="tnum text-lead font-medium">
                <MoneyWithCode cents={data.outstandingInvoiceCents} />
              </span>
            </button>
          </div>

          {/* Two-column working area */}
          <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[1fr_360px]">
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <RecentOrdersCard data={data} />
              <PendingTasksCard data={data} />
            </div>
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <OrderActivityCard data={data} />
              <ActivityFeedCard data={data} />
            </div>
          </div>
        </ViewEnter>
      )}
    </div>
  );
}

// ─── Recent orders ───────────────────────────────────────────────────────────

function RecentOrdersCard({ data }: { data: AdminDashboard }) {
  const navigate = useAppStore((s) => s.navigate);
  const orders = data.recentOrders.slice(0, 6);

  return (
    <SectionCard
      title="Recent orders"
      action={
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => navigate("admin-orders")}
        >
          All orders
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      }
      bodyClassName="p-0"
    >
      {orders.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState icon={FileStack} title="No orders yet" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Summary</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow
                key={o.id}
                className="cursor-pointer"
                onClick={() => navigate("admin-order-detail", { id: o.id })}
              >
                <Td>
                  <span className="font-mono text-body-sm font-medium text-foreground">{o.orderNumber}</span>
                  <p className="text-caption text-muted-foreground">{formatDate(o.createdAt)}</p>
                </Td>
                <Td>
                  <p className="max-w-[170px] truncate">{o.orgName ?? "—"}</p>
                  {o.orgCode && <p className="font-mono text-caption text-muted-foreground">{o.orgCode}</p>}
                </Td>
                <Td className="text-muted-foreground">{o.itemSummary}</Td>
                <Td className="text-right font-medium">
                  <Money cents={o.totalCents} />
                </Td>
                <Td>
                  <StatusBadge status={o.status} kind="order" />
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Pending tasks ─────────────────────────────────────────────────────────────

function PendingTasksCard({ data }: { data: AdminDashboard }) {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <SectionCard title="Pending tasks">
      {data.pendingTasks.length === 0 ? (
        <p className="rounded-md border border-dashed bg-surface-sunken/60 px-4 py-8 text-center text-body-sm text-muted-foreground">
          Nothing waiting on you.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.pendingTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-md border bg-card px-3.5 py-2.5 transition-colors hover:border-ring/40 hover:bg-accent/60"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-secondary/60 text-muted-foreground">
                <KindMark kind={task.kind} />
              </span>
              <p className="min-w-0 flex-1 truncate text-body-sm leading-snug text-foreground">{task.label}</p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => navigate(task.view as ViewName, { id: task.relatedId })}
              >
                Open
                <ChevronRight className="size-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ─── Order activity chart ────────────────────────────────────────────────────

function OrderActivityCard({ data }: { data: AdminDashboard }) {
  const weeks = data.ordersByWeek ?? [];

  return (
    <SectionCard title="Order activity">
      {weeks.length === 0 ? (
        <p className="rounded-md border border-dashed bg-surface-sunken/60 px-4 py-8 text-center text-body-sm text-muted-foreground">
          No order activity yet.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4 pb-1.5">
        <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <span className="size-2 rounded-[3px]" style={{ background: CHART_REQUESTS }} aria-hidden />
          Requests
        </span>
        <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <span className="size-2 rounded-[3px]" style={{ background: CHART_ORDERS }} aria-hidden />
          Orders
        </span>
      </div>
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeks} barGap={3} barCategoryGap="26%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              width={26}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltipPrimitive
              cursor={{ fill: "var(--accent)" }}
              content={<ActivityChartTooltip />}
            />
            <Bar dataKey="requests" fill={CHART_REQUESTS} radius={[2, 2, 0, 0]} maxBarSize={12} />
            <Bar dataKey="orders" fill={CHART_ORDERS} radius={[2, 2, 0, 0]} maxBarSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
        </>
      )}
    </SectionCard>
  );
}

function ActivityChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const requests = Number(payload.find((p) => p.dataKey === "requests")?.value ?? 0);
  const orders = Number(payload.find((p) => p.dataKey === "orders")?.value ?? 0);
  return (
    <div className="rounded-[10px] border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-micro text-muted-foreground">{label}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-caption">
        <span className="size-1.5 rounded-full" style={{ background: CHART_REQUESTS }} aria-hidden />
        Requests <span className="tnum ml-auto pl-3 font-medium">{requests}</span>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-caption">
        <span className="size-1.5 rounded-full" style={{ background: CHART_ORDERS }} aria-hidden />
        Orders <span className="tnum ml-auto pl-3 font-medium">{orders}</span>
      </p>
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

function ActivityFeedCard({ data }: { data: AdminDashboard }) {
  const activity = data.activity ?? [];

  return (
    <SectionCard title="Activity feed">
      {activity.length === 0 ? (
        <p className="rounded-md border border-dashed bg-surface-sunken/60 px-4 py-8 text-center text-body-sm text-muted-foreground">
          No activity recorded yet.
        </p>
      ) : (
        <div className="max-h-[380px] overflow-y-auto pr-1">
          {activity.map((event) => (
            <div
              key={event.id}
              className="flex gap-3 border-b border-border/60 py-3 last:border-b-0"
            >
              <span
                className={cn("mt-1.5 size-[7px] shrink-0 rounded-full", statusDotTone(kindTone(event.kind)))}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium leading-snug text-foreground">{event.title}</p>
                {event.detail && (
                  <p className="mt-0.5 line-clamp-2 text-caption leading-snug text-muted-foreground">{event.detail}</p>
                )}
              </div>
              <p className="tnum shrink-0 text-caption text-muted-foreground">{timeAgo(event.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** Map an activity kind onto a status-family tone for its timeline dot. */
function kindTone(kind: string): string {
  switch (kind.toUpperCase()) {
    case "ORDER":
      return "kraft";
    case "QUOTATION":
      return "pending";
    case "DOCUMENT":
      return "neutral";
    case "MESSAGE":
      return "active";
    case "CUSTOMER":
    case "ORGANIZATION":
      return "done";
    case "PRICE":
    case "PRICING":
      return "production";
    default:
      return "neutral";
  }
}
