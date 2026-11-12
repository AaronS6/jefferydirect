"use client";

// Order detail — requested vs confirmed information, items (with per-line
// specs and attachment references), totals, published progress updates,
// change requests (including counter proposals), status timeline, documents,
// CSV export / print, and the canonical reorder flow (current pricing only).

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FilePen,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Printer,
  RefreshCcw,
  StickyNote,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { Money, MoneyWithCode } from "@/components/shared/money";
import { StatusBadge, ChangeStatusBadge, OrderSourceBadge } from "@/components/shared/status-badge";
import { OrderTimeline } from "@/components/shared/order-timeline";
import { UpdateTimeline } from "@/components/shared/update-timeline";
import { api, downloadFile } from "@/lib/api-client";
import { useAppStore, useCartStore } from "@/store/app-store";
import type { ChangeRequestDto, OrderDetail, OrderHistoryEntry, ReorderDraft } from "@/types";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatDateTime } from "@/lib/date";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
  ORDER_TERMINAL_STATUSES,
  type ChangeKind,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ErrorAlert, errorMessage, Mono, RowsSkeleton, SectionCard, SummaryItem, Chip } from "./portal-bits";
import { AttachmentChips, SpecChips } from "./order-builder-bits";
import { ChangeRequestDialog, changeItemText, type RespondAction } from "./change-request-dialog";

const EASE = [0.22, 1, 0.36, 1] as const;

// Order progress hero — the full nine-step rail at xl and up; a compact
// progress bar below xl (the vertical timeline below carries full history).
// Ink dots for completed steps, kraft ring on the current one, hollow future.
function StatusStepper({ status, history }: { status: string; history: OrderHistoryEntry[] }) {
  const flow = ORDER_STATUSES;
  const terminal = ORDER_TERMINAL_STATUSES.includes(status);
  const currentIdx = flow.indexOf(status as (typeof flow)[number]);

  // Latest history entry per status (ascending order).
  const latestByStatus = new Map<string, OrderHistoryEntry>();
  for (const h of [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    latestByStatus.set(h.status, h);
  }

  const progress =
    currentIdx >= 0 ? Math.round(((currentIdx + 1) / flow.length) * 100) : 100;
  const dead = status === "CANCELLED" || status === "REJECTED";

  return (
    <>
      {/* Compact progress — below xl */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 xl:hidden" aria-label="Order progress">
        <span
          aria-hidden
          className={cn(
            "flex size-[14px] shrink-0 items-center justify-center rounded-full",
            dead
              ? "border-2 border-[var(--status-danger-dot)] bg-[var(--status-danger-bg)]"
              : terminal
                ? "bg-foreground"
                : "border-2 border-kraft-strong bg-kraft",
          )}
        >
          {!dead && !terminal && <span className="size-1.5 rounded-full bg-background" aria-hidden />}
          {terminal && <span className="size-[4.5px] rounded-full bg-background" aria-hidden />}
        </span>
        <p className="text-body font-semibold text-foreground">
          {ORDER_STATUS_LABELS[status] ?? status}
        </p>
        {!dead && (
          <p className="text-caption text-muted-foreground">
            <span className="tnum">Step {Math.max(1, currentIdx + 1)} of {flow.length}</span>
          </p>
        )}
        <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", dead ? "bg-[var(--status-danger-dot)]" : "bg-kraft-strong")}
            style={{ width: `${dead ? 100 : progress}%` }}
          />
        </div>
      </div>

      {/* Full rail — xl and up */}
      <ol className="hidden items-start xl:flex" aria-label="Order progress steps">
        {flow.map((s, i) => {
          const entry = latestByStatus.get(s);
          const done = i < currentIdx || (terminal && entry !== undefined);
          const current = i === currentIdx && !terminal;
          return (
            <li
              key={s}
              className="relative flex min-w-[96px] flex-1 basis-0 flex-col items-center gap-2.5 px-1 text-center"
            >
              {i < flow.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[7px] left-[calc(50%+10px)] h-px w-[calc(100%-20px)]",
                    done || current ? "bg-foreground/25" : "bg-border",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-[14px] shrink-0 items-center justify-center rounded-full",
                  done
                    ? "bg-foreground"
                    : current
                      ? "border-2 border-kraft-strong bg-kraft"
                      : "border border-border bg-card",
                )}
              >
                {done && <span className="size-[4.5px] rounded-full bg-background" aria-hidden />}
              </span>
              <div className="min-w-0 max-w-full">
                <p
                  className={cn(
                    "text-caption max-w-full truncate whitespace-nowrap",
                    current
                      ? "font-semibold text-foreground"
                      : done
                        ? "font-medium text-foreground/80"
                        : "font-medium text-muted-foreground",
                  )}
                >
                  {ORDER_STATUS_LABELS[s]}
                </p>
                {entry && (
                  <p className="tnum text-caption whitespace-nowrap text-muted-foreground">
                    {formatDate(entry.createdAt)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

const QUICK_CHANGE_KINDS: { kind: ChangeKind; label: string }[] = [
  { kind: "QUANTITY", label: "Quantity" },
  { kind: "SPEC", label: "Specifications" },
  { kind: "ADD", label: "Add/remove products" },
  { kind: "ADDRESS", label: "Delivery address" },
  { kind: "DATE", label: "Delivery date" },
  { kind: "CANCEL", label: "Cancel order" },
];

export function OrderDetailView({ orderId }: { orderId: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const loadDraft = useCartStore((s) => s.loadDraft);
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unavailableDraft, setUnavailableDraft] = useState<ReorderDraft | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeKind, setChangeKind] = useState<ChangeKind | undefined>(undefined);

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ["orders", "detail", orderId],
    queryFn: () => api.get<OrderDetail>(`/api/customer/orders/${orderId}`),
  });

  const reorderMutation = useMutation({
    mutationFn: () => api.get<ReorderDraft>(`/api/customer/orders/${orderId}/reorder-data`),
    onSuccess: (draft) => {
      if (draft.lines.some((l) => l.unavailable)) {
        setUnavailableDraft(draft);
      } else {
        finishReorder(draft);
      }
    },
    onError: (err) =>
      setReorderError(err instanceof Error ? err.message : "We could not load reorder data."),
  });

  const exportMutation = useMutation({
    mutationFn: (orderNumber: string) =>
      downloadFile(`/api/customer/orders/${orderId}/export`, `${orderNumber}.csv`),
    onSuccess: () => toast({ title: "Order exported" }),
    onError: (err) =>
      toast({
        title: "Export failed",
        description: errorMessage(err, "Please try again."),
        variant: "destructive",
      }),
  });

  function finishReorder(draft: ReorderDraft) {
    const available = draft.lines.filter((l) => !l.unavailable);
    if (available.length === 0) {
      setUnavailableDraft(draft);
      return;
    }
    loadDraft(available);
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast({ title: "Added to cart" });
    navigate("cart");
  }

  if (error) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Order" onBack={back} />
        <ErrorAlert
          message={error instanceof Error ? error.message : "We could not load this order."}
          onRetry={() => refetch()}
        />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate("orders")}>
            Back to orders
          </Button>
        </div>
      </motion.div>
    );
  }

  if (isLoading || !order) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Order" onBack={back} />
        <div className="space-y-8">
          <div className="rounded-[14px] border bg-card p-5 shadow-xs">
            <Skeleton className="h-4 w-40" />
            <div className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="py-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-1.5 h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[14px] border bg-card p-5 shadow-xs">
            <RowsSkeleton rows={3} />
          </div>
        </div>
      </motion.div>
    );
  }

  const taxRateLabel = `${order.taxRateBp / 100}%`;
  const terminal = ORDER_TERMINAL_STATUSES.includes(order.status);

  // Most recent published update — one line in the summary bar.
  const latestUpdate =
    [...order.updates].sort((a, b) =>
      (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt),
    )[0] ?? null;

  function openChangeDialog(kind?: ChangeKind) {
    setChangeKind(kind);
    setChangeOpen(true);
  }

  return (
    <motion.div {...enter}>
      <PageHeader
        title={<Mono className="text-heading tracking-tight">{order.orderNumber}</Mono>}
        onBack={back}
        actions={
          <>
            <Button
              variant="outline"
              className="gap-2 print:hidden"
              onClick={() => navigate("support")}
              aria-label="Message our team about this order"
            >
              <MessageSquare className="size-4" aria-hidden />
              <span className="hidden sm:inline">Message</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-1.5 print:hidden" aria-label="Export this order">
                  <Download className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Export</span>
                  <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={exportMutation.isPending}
                  onClick={() => exportMutation.mutate(order.orderNumber)}
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-4" aria-hidden />
                  )}
                  Download CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="size-4" aria-hidden />
                  Print order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Reorder stays a header action unless it is the summary bar's
                primary action (delivered orders) */}
            {order.items.length > 0 && order.status !== "DELIVERED" && (
              <Button
                variant="outline"
                className="gap-2 print:hidden"
                onClick={() => {
                  setReorderError(null);
                  setConfirmOpen(true);
                }}
              >
                <RefreshCcw className="size-4" aria-hidden />
                <span className="hidden sm:inline">Reorder</span>
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-8">
        {/* ── Summary bar + progress hero — one anchored panel ── */}
        <SectionCard className="print:break-inside-avoid" contentClassName="p-0 sm:p-0">
          {/* Summary bar — status, latest update, delivery, primary action */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-4">
            <StatusBadge status={order.status} kind="order" />
            {latestUpdate ? (
              <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
                Latest update{" "}
                <span className="font-medium text-foreground">{latestUpdate.title}</span>
                <span aria-hidden> · </span>
                <span className="tnum">{formatDate(latestUpdate.publishedAt ?? latestUpdate.createdAt)}</span>
              </p>
            ) : (
              <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">No updates yet</p>
            )}
            {(order.estimatedDelivery || order.revisedDeliveryDate) && (
              <span
                className={cn(
                  "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption font-medium",
                  order.revisedDeliveryDate
                    ? "border border-kraft/40 bg-kraft-soft text-kraft-ink"
                    : "border text-muted-foreground",
                )}
                title={
                  order.revisedDeliveryDate && order.estimatedDelivery
                    ? `Revised. Originally estimated ${formatDate(order.estimatedDelivery)}`
                    : undefined
                }
              >
                Est. delivery{" "}
                <span className="tnum font-semibold">
                  {formatDate(order.revisedDeliveryDate ?? order.estimatedDelivery)}
                </span>
                {order.revisedDeliveryDate && <span aria-hidden>· revised</span>}
              </span>
            )}
            {/* Single most relevant action — visual priority only; every other
                action stays available in the header / side rail */}
            <div className="ml-auto flex shrink-0 items-center gap-2 print:hidden">
              {!terminal && (
                <Button
                  className="gap-2"
                  onClick={() => openChangeDialog()}
                  aria-label="Request a change to this order"
                >
                  <FilePen className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Request a change</span>
                </Button>
              )}
              {order.status === "DELIVERED" && order.items.length > 0 && (
                <Button
                  className="gap-2"
                  onClick={() => {
                    setReorderError(null);
                    setConfirmOpen(true);
                  }}
                  aria-label={`Reorder ${order.orderNumber}`}
                >
                  <RefreshCcw className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Reorder</span>
                </Button>
              )}
            </div>
          </div>
          <div className="border-t px-5 py-4">
            <StatusStepper status={order.status} history={order.history} />
          </div>
        </SectionCard>

        {/* Next expected update — only when the team committed to one */}
        {order.nextUpdateDate && !terminal && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border bg-card px-5 py-3 shadow-xs print:shadow-none">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-micro text-muted-foreground">Next update</p>
              <p className="mt-0.5 text-body-sm leading-relaxed text-foreground">
                Expected by <span className="tnum font-medium">{formatDate(order.nextUpdateDate)}</span>.
              </p>
            </div>
          </div>
        )}

        {/* ── Summary grid ── */}
        <SectionCard title="Order details">
          <dl className="m-0 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryItem label="Submitted">{formatDate(order.createdAt)}</SummaryItem>
            <SummaryItem label="Submitted by">{order.submittedBy}</SummaryItem>
            {order.poNumber && <SummaryItem label="PO reference">{order.poNumber}</SummaryItem>}
            {order.requestedDelivery && (
              <SummaryItem label="Requested delivery">{order.requestedDelivery}</SummaryItem>
            )}
            {order.requestedDeliveryDate && (
              <SummaryItem label="Requested delivery">
                {formatDate(order.requestedDeliveryDate)}
                <span className="block text-caption text-muted-foreground">
                  Requested, not confirmed.
                </span>
              </SummaryItem>
            )}
            {order.estimatedDispatch && (
              <SummaryItem label="Est. dispatch">{formatDate(order.estimatedDispatch)}</SummaryItem>
            )}
            {order.actualDeliveryDate && (
              <SummaryItem label="Delivered">{formatDate(order.actualDeliveryDate)}</SummaryItem>
            )}
            {order.trackingNumber && (
              <SummaryItem label="Tracking number">
                <Mono className="text-body-sm">{order.trackingNumber}</Mono>
              </SummaryItem>
            )}
            {order.sourceType !== "PORTAL" && (
              <SummaryItem label="Order source">
                <span className="flex flex-wrap items-center gap-2">
                  <OrderSourceBadge source={order.sourceType} />
                  <span className="text-caption leading-relaxed text-muted-foreground">
                    {ORDER_SOURCE_LABELS[order.sourceType] ?? order.sourceType}
                    {order.recordedByName ? ` · recorded by ${order.recordedByName}` : ""}. Placed outside
                    ClientHub; recorded here for tracking.
                  </span>
                </span>
              </SummaryItem>
            )}
            {order.reorderSource && (
              <SummaryItem label="Reorder source">Reorder of {order.reorderSource}</SummaryItem>
            )}
          </dl>
        </SectionCard>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Main column ── */}
          <div className="min-w-0 space-y-8">
            {/* Items */}
            <SectionCard
              title="Items"
              contentClassName="p-0 sm:p-0"
              className="print:break-inside-avoid"
            >
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <ItemIdentity item={item} navigate={navigate} />
                          {item.note && (
                            <span className="mt-0.5 block text-caption text-muted-foreground">{item.note}</span>
                          )}
                          <SpecChips specs={item.specs} />
                          <AttachmentChips attachments={item.attachments} />
                        </TableCell>
                        <TableCell className="tnum whitespace-nowrap text-right text-body-sm">{item.qty.toLocaleString()}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {item.productId ? (
                            <Money cents={item.unitPriceCents} />
                          ) : (
                            <span className="text-caption text-muted-foreground">Pricing to be confirmed</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {item.productId ? (
                            <Money cents={item.lineTotalCents} className="font-medium" />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile stacked */}
              <ul className="divide-y md:hidden">
                {order.items.map((item) => (
                  <li key={item.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <ItemIdentity item={item} navigate={navigate} />
                        {item.note && (
                          <span className="mt-0.5 block text-caption text-muted-foreground">{item.note}</span>
                        )}
                        <SpecChips specs={item.specs} />
                        <AttachmentChips attachments={item.attachments} />
                      </div>
                      <div className="shrink-0 text-right">
                        {item.productId ? (
                          <>
                            <Money cents={item.lineTotalCents} className="text-body-sm font-semibold" />
                            <p className="text-caption text-muted-foreground">
                              <span className="tnum">{item.qty.toLocaleString()}</span> ×{" "}
                              <Money cents={item.unitPriceCents} muted />
                            </p>
                          </>
                        ) : (
                          <>
                            <span className="text-caption text-muted-foreground">Pricing to be confirmed</span>
                            <p className="text-caption text-muted-foreground">
                              <span className="tnum">{item.qty.toLocaleString()}</span> units
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>

            {/* Progress updates */}
            <SectionCard
              title="Order updates"
              className="print:break-inside-avoid"
            >
              <UpdateTimeline updates={order.updates} />
            </SectionCard>

            {/* Change requests */}
            {order.changeRequests.length > 0 && (
              <ChangeRequestsCard orderId={orderId} requests={order.changeRequests} />
            )}

            {/* Timeline */}
            <SectionCard title="Status timeline">
              <OrderTimeline status={order.status} history={order.history} />
            </SectionCard>
          </div>

          {/* ── Side rail ── */}
          <aside className="space-y-8" aria-label="Shipping and documents">
            <SectionCard title="Totals" className="print:break-inside-avoid">
              <div className="w-full space-y-1.5">
                <div className="flex items-baseline justify-between text-body-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <MoneyWithCode cents={order.subtotalCents} />
                </div>
                <div className="flex items-baseline justify-between text-body-sm">
                  <span className="text-muted-foreground">GST ({taxRateLabel})</span>
                  <MoneyWithCode cents={order.taxCents} />
                </div>
                <Separator className="my-2" />
                <div className="flex items-baseline justify-between">
                  <span className="text-body-sm font-medium">Total</span>
                  <MoneyWithCode cents={order.totalCents} className="font-display text-title font-normal" />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Shipping" className="print:break-inside-avoid">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-body-sm leading-relaxed text-foreground">{order.shippingText}</p>
              </div>
              {order.notes && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-start gap-2.5">
                    <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="text-micro text-muted-foreground">Notes</p>
                      <p className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-foreground">
                        {order.notes}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </SectionCard>

            {!terminal && (
              <SectionCard title="Request a change" className="print:hidden">
                <ul className="space-y-1">
                  {QUICK_CHANGE_KINDS.map((q) => (
                    <li key={q.kind}>
                      <button
                        type="button"
                        onClick={() => openChangeDialog(q.kind)}
                        className="flex w-full items-center justify-between gap-2 rounded-[10px] border bg-card px-3 py-2 text-left text-body-sm font-medium text-foreground transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                      >
                        {q.label}
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {order.documents.length > 0 && (
              <SectionCard title="Related documents" className="print:break-inside-avoid">
                <ul className="space-y-2">
                  {order.documents.map((doc) => (
                    <li key={doc.id}>
                      <button
                        onClick={() => navigate("documents")}
                        className="flex w-full items-center gap-2.5 rounded-[10px] border bg-card px-3 py-2.5 text-left text-body-sm transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{doc.title}</span>
                        <span className="shrink-0 text-caption text-muted-foreground">{doc.sizeLabel}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
          </aside>
        </div>
      </div>

      {/* Change request dialog */}
      <ChangeRequestDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        orderId={orderId}
        items={order.items.map((i) => ({ productId: i.productId, name: i.name, sku: i.sku, qty: i.qty }))}
        initialKind={changeKind}
      />

      {/* Reorder confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reorder {order.orderNumber}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  We&apos;ll load the items into your cart at your <strong>current</strong> effective
                  pricing. Quantities start at your last order.
                </p>
                <p>Any items currently in your cart will be replaced.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {reorderError && (
            <div
              role="alert"
              className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
            >
              {reorderError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                reorderMutation.mutate();
              }}
            >
              {reorderMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCcw className="size-4" aria-hidden />
              )}
              Load items
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

// ─── Items identity (catalogue link vs custom request) ──────────────────────

function ItemIdentity({
  item,
  navigate,
}: {
  item: { productId: string | null; name: string; sku: string };
  navigate: ReturnType<typeof useAppStore.getState>["navigate"];
}) {
  if (item.productId) {
    return (
      <button
        className="text-left text-body-sm font-semibold underline-offset-2 transition-colors hover:text-primary hover:underline"
        onClick={() => navigate("product-detail", { id: item.productId ?? "" })}
      >
        {item.name}
        <Mono className="ml-2 block text-muted-foreground">{item.sku}</Mono>
      </button>
    );
  }
  return (
    <span className="text-body-sm font-semibold">
      <span className="flex flex-wrap items-center gap-1.5">
        {item.name}
        <Chip>Custom request</Chip>
      </span>
      <Mono className="mt-0.5 block text-muted-foreground">{item.sku || "custom"}</Mono>
    </span>
  );
}

// ─── Change requests card ────────────────────────────────────────────────────

function ChangeRequestsCard({
  orderId,
  requests,
}: {
  orderId: string;
  requests: ChangeRequestDto[];
}) {
  const queryClient = useQueryClient();

  const respondMutation = useMutation({
    mutationFn: (vars: { id: string; action: RespondAction }) =>
      api.post<ChangeRequestDto>(`/api/customer/change-requests/${vars.id}/respond`, {
        action: vars.action,
      }),
    onSuccess: (_cr, vars) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (vars.action === "ACCEPT") {
        toast({ title: "Proposal accepted" });
      } else if (vars.action === "DECLINE") {
        toast({ title: "Proposal declined" });
      } else {
        toast({ title: "Request withdrawn" });
      }
    },
    onError: (err) =>
      toast({
        title: "Could not respond",
        description: errorMessage(err, "Please try again."),
        variant: "destructive",
      }),
  });

  // Newest-first from the API — render chronologically for the narrative.
  const chronological = [...requests].reverse();

  return (
    <SectionCard
      title="Change requests"
      className="print:break-inside-avoid"
    >
      <div className="space-y-3">
        {chronological.map((cr) => (
          <ChangeRequestEntry
            key={cr.id}
            cr={cr}
            busy={respondMutation.isPending}
            onRespond={(id, action) => respondMutation.mutate({ id, action })}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function ChangeRequestEntry({
  cr,
  busy,
  onRespond,
}: {
  cr: ChangeRequestDto;
  busy: boolean;
  onRespond: (id: string, action: RespondAction) => void;
}) {
  return (
    <article className="rounded-[14px] border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <ChangeStatusBadge status={cr.status} />
        <span className="text-body-sm text-foreground">requested by {cr.requestedByName}</span>
        <span className="ml-auto tnum text-caption text-muted-foreground">{formatDateTime(cr.createdAt)}</span>
      </div>

      <ul className="mt-2.5 space-y-1">
        {cr.changes.map((c, i) => (
          <li key={i} className="text-body-sm leading-relaxed text-foreground/90">
            {changeItemText(c)}
          </li>
        ))}
      </ul>

      {cr.requestNote && (
        <p className="mt-2 whitespace-pre-line text-caption leading-relaxed text-muted-foreground">
          <span className="font-medium text-muted-foreground/80">Your note: </span>
          {cr.requestNote}
        </p>
      )}

      {cr.status === "PENDING" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[10px] border bg-surface-sunken/60 px-3.5 py-2.5">
          <p className="max-w-md text-caption leading-relaxed text-muted-foreground">
            Your order stays unchanged until Jeffery Group approves this request.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-caption text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={() => onRespond(cr.id, "WITHDRAW")}
          >
            Withdraw request
          </Button>
        </div>
      )}

      {(cr.status === "ACCEPTED" || cr.status === "DECLINED" || cr.status === "WITHDRAWN") &&
        (cr.adminName || cr.decidedAt) && (
          <div className="mt-3 rounded-[10px] border bg-surface-sunken/60 px-3.5 py-2.5 text-caption leading-relaxed">
            <p className="font-medium text-foreground">
              {cr.status === "ACCEPTED" ? "Approved" : cr.status === "DECLINED" ? "Declined" : "Withdrawn"}
              {cr.adminName ? ` by ${cr.adminName}` : ""}
              {cr.decidedAt ? ` · ${formatDateTime(cr.decidedAt)}` : ""}
            </p>
            {cr.decisionNote && <p className="mt-0.5 text-muted-foreground">{cr.decisionNote}</p>}
            {cr.appliedAt && cr.status === "ACCEPTED" && (
              <p className="mt-0.5 text-muted-foreground">Applied to your order {formatDateTime(cr.appliedAt)}.</p>
            )}
          </div>
        )}

      {cr.status === "COUNTERED" && (
        <div className="mt-3 rounded-[10px] border border-kraft/40 bg-kraft-soft/60 p-3.5">
          <p className="text-micro text-kraft-ink">Jeffery Group proposed an alternative</p>
          {cr.counter && (
            <ul className="mt-1.5 space-y-1">
              {cr.counter.map((c, i) => (
                <li key={i} className="text-body-sm leading-relaxed text-foreground/90">
                  {changeItemText(c)}
                </li>
              ))}
            </ul>
          )}
          {cr.counterNote && (
            <p className="mt-1.5 whitespace-pre-line text-caption leading-relaxed text-kraft-ink/80">
              {cr.counterNote}
            </p>
          )}
          {cr.counterDecision ? (
            <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
              You {cr.counterDecision === "ACCEPT" ? "accepted" : "declined"} this proposal
              {cr.counterDecidedAt ? ` on ${formatDateTime(cr.counterDecidedAt)}` : ""}.
            </p>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={busy}
                onClick={() => onRespond(cr.id, "ACCEPT")}
              >
                <Check className="size-3.5" aria-hidden /> Accept proposal
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={busy}
                onClick={() => onRespond(cr.id, "DECLINE")}
              >
                Decline
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
