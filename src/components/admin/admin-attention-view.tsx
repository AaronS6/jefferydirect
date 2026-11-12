"use client";

// Administration — the Attention queue: the admin's working list. Everything
// that needs a decision, reply or update, grouped by urgency into one list:
// Overdue first, then Today, then Later. One primary action per row.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  Clock,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/date";
import { useAppStore } from "@/store/app-store";
import type { NavigateFn } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { AttentionCentreDto, AttentionOrderCard, ChangeItem, MessageDto, OrderDetail } from "@/types";
import { InlineError, RowsSkeleton, SectionCard, ViewEnter } from "./admin-ui";
import { PublishUpdateDialog } from "./publish-update-dialog";
import { cn } from "@/lib/utils";

type DismissSection =
  | "NEW_ORDER"
  | "NEEDS_UPDATE"
  | "OVERDUE_UPDATE"
  | "UPDATE_REMINDER"
  | "DELAYED"
  | "UPCOMING_DELIVERY";

type RowAction = "review" | "reply" | "open" | "publish";

/** The row's reference: an order number, or a message subject. */
type RowRef =
  | { kind: "order"; orderId: string; orderNumber: string }
  | { kind: "message"; subject: string; orderId?: string; orderNumber?: string | null };

type AttentionRowItem = {
  key: string;
  typeLabel: string;
  /** Order number / message subject — the row's reference. */
  reference: RowRef;
  /** One line of context data. */
  context: ReactNode;
  action: RowAction;
  actionLabel: string;
  /** Navigate target for open-style actions. */
  orderId?: string;
  ariaName: string;
  dismiss?: { orderId: string; section: DismissSection };
  /** Chronological anchor used for sorting inside a bucket. */
  sortAt: number;
};

/** Compact, readable summary of one requested change (attention-list style). */
function changeSummaryLine(item: ChangeItem): string {
  switch (item.kind) {
    case "QUANTITY":
      return `Quantity ${(item.currentQty ?? 0).toLocaleString()} → ${(item.newQty ?? 0).toLocaleString()}`;
    case "SPEC":
      return item.spec ?? item.name ?? "Specification change";
    case "ADD":
      return `Add ${item.name ?? "product"}${item.newQty ? ` × ${item.newQty.toLocaleString()}` : ""}`;
    case "REMOVE":
      return `Remove ${item.name ?? item.sku ?? "product"}`;
    case "ADDRESS":
      return "Delivery address";
    case "DATE":
      return `Delivery date → ${item.newDate ? formatDate(item.newDate) : "—"}`;
    case "CANCEL":
      return "Cancel order";
    case "OTHER":
      return item.note ?? "Other change";
  }
}

function dueLabel(dueInDays: number | null | undefined): string {
  if (dueInDays == null) return "";
  if (dueInDays < 0) return `overdue by ${Math.abs(dueInDays)} ${Math.abs(dueInDays) === 1 ? "day" : "days"}`;
  if (dueInDays === 0) return "due today";
  return `due in ${dueInDays} ${dueInDays === 1 ? "day" : "days"}`;
}

function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

// ─── Bucket construction ─────────────────────────────────────────────────────

function orderRow(
  card: AttentionOrderCard,
  typeLabel: string,
  context: ReactNode,
  action: RowAction,
  actionLabel: string,
  dismiss?: DismissSection,
  sortAt = Date.now(),
): AttentionRowItem {
  return {
    key: `${typeLabel}:${card.orderId}`,
    typeLabel,
    reference: { kind: "order", orderId: card.orderId, orderNumber: card.orderNumber },
    context,
    action,
    actionLabel,
    orderId: card.orderId,
    ariaName: card.orderNumber,
    dismiss: dismiss ? { orderId: card.orderId, section: dismiss } : undefined,
    sortAt,
  };
}

function reminderRow(card: AttentionOrderCard, typeLabel: string): AttentionRowItem {
  return orderRow(
    card,
    typeLabel,
    card.nextUpdateDate ? (
      <>
        Update expected {formatDate(card.nextUpdateDate)}
        {card.dueInDays != null && card.dueInDays >= 0 ? ` · ${dueLabel(card.dueInDays)}` : ""}
        {card.lastUpdateAt ? ` · last update ${timeAgo(card.lastUpdateAt)}` : ""}
      </>
    ) : (
      "An update is expected soon"
    ),
    "publish",
    "Publish update",
    "UPDATE_REMINDER",
    card.nextUpdateDate ? new Date(card.nextUpdateDate).getTime() : Date.now(),
  );
}

function changeRequestRow(request: AttentionCentreDto["pendingChangeRequests"][number], overdue: boolean): AttentionRowItem {
  const summary = (
    <>
      {request.changes.slice(0, 2).map(changeSummaryLine).join(" · ")}
      {request.changes.length > 2 ? ` · +${request.changes.length - 2} more` : ""}
      {" · "}
      {overdue ? (
        <>
          waiting <span className="font-medium text-kraft-ink">{timeAgo(request.createdAt)}</span>
        </>
      ) : (
        <>requested by {request.requestedByName}</>
      )}
    </>
  );
  return {
    key: `change-request:${request.id}`,
    typeLabel: "Change request",
    reference: { kind: "order", orderId: request.orderId, orderNumber: request.orderNumber },
    context: summary,
    action: "open",
    actionLabel: "Open",
    orderId: request.orderId,
    ariaName: request.orderNumber,
    sortAt: new Date(request.createdAt).getTime(),
  };
}

function messageRow(message: MessageDto): AttentionRowItem {
  return {
    key: `message:${message.id}`,
    typeLabel: "Message",
    reference: {
      kind: "message",
      subject: message.subject,
      orderId: message.orderId ?? undefined,
      orderNumber: message.orderNumber,
    },
    context: (
      <>
        {message.orgName ?? "Customer"} · from {message.authorName} · {timeAgo(message.createdAt)}
      </>
    ),
    action: "reply",
    actionLabel: "Reply",
    orderId: message.orderId ?? undefined,
    ariaName: message.subject,
    sortAt: new Date(message.createdAt).getTime(),
  };
}

function buildBuckets(data: AttentionCentreDto | undefined) {
  const overdue: AttentionRowItem[] = [];
  const today: AttentionRowItem[] = [];
  const later: AttentionRowItem[] = [];

  if (!data) return { overdue, today, later };

  // ── Overdue ──
  for (const card of data.overdueUpdates) {
    overdue.push(
      orderRow(
        card,
        "Update overdue",
        card.nextUpdateDate ? (
          <>
            Expected {formatDate(card.nextUpdateDate)} ·{" "}
            <span className="font-medium text-kraft-ink">overdue {timeAgo(card.nextUpdateDate)}</span>
            {card.lastUpdateAt ? ` · last update ${timeAgo(card.lastUpdateAt)}` : ""}
          </>
        ) : (
          "An expected update has not been published"
        ),
        "publish",
        "Publish update",
        "OVERDUE_UPDATE",
        card.nextUpdateDate ? new Date(card.nextUpdateDate).getTime() : Date.now(),
      ),
    );
  }
  for (const card of data.delayedOrders) {
    overdue.push(
      orderRow(
        card,
        "Delayed",
        card.estimatedDelivery ? (
          <>
            Revised delivery {formatDate(card.estimatedDelivery)}
            {card.dueInDays != null ? ` · ${dueLabel(card.dueInDays)}` : ""}
          </>
        ) : (
          "Delay flagged on this order"
        ),
        "open",
        "Open",
        "DELAYED",
        card.estimatedDelivery ? new Date(card.estimatedDelivery).getTime() : Date.now(),
      ),
    );
  }
  for (const card of data.upcomingDeliveries) {
    if (!isPast(card.estimatedDelivery)) continue;
    overdue.push(
      orderRow(
        card,
        "Delivery",
        card.estimatedDelivery ? (
          <>
            Was expected {formatDate(card.estimatedDelivery)} · {dueLabel(card.dueInDays)}
          </>
        ) : (
          "Delivery date has passed"
        ),
        "open",
        "Open",
        "UPCOMING_DELIVERY",
        card.estimatedDelivery ? new Date(card.estimatedDelivery).getTime() : Date.now(),
      ),
    );
  }
  // Change requests sitting unanswered for more than two days.
  for (const request of data.pendingChangeRequests) {
    if (Date.now() - new Date(request.createdAt).getTime() <= TWO_DAYS_MS) continue;
    overdue.push(changeRequestRow(request, true));
  }

  // ── Today ──
  for (const card of data.newOrderRequests) {
    today.push(
      orderRow(
        card,
        "New order",
        card.requestedAt ? (
          <>
            {card.itemCount} {card.itemCount === 1 ? "line" : "lines"} · <Money cents={card.totalCents} /> · requested{" "}
            {timeAgo(card.requestedAt)}
          </>
        ) : (
          <>
            {card.itemCount} {card.itemCount === 1 ? "line" : "lines"} · <Money cents={card.totalCents} />
          </>
        ),
        "review",
        "Review",
        "NEW_ORDER",
        card.requestedAt ? new Date(card.requestedAt).getTime() : Date.now(),
      ),
    );
  }
  for (const request of data.pendingChangeRequests) {
    if (Date.now() - new Date(request.createdAt).getTime() > TWO_DAYS_MS) continue;
    today.push(changeRequestRow(request, false));
  }
  for (const message of data.pendingMessages) {
    today.push(messageRow(message));
  }
  for (const card of data.upcomingUpdateReminders) {
    if (card.dueInDays != null && card.dueInDays > 0) continue;
    today.push(reminderRow(card, "Update due"));
  }
  for (const card of data.ordersNeedingUpdates) {
    today.push(
      orderRow(
        card,
        "No recent update",
        card.lastUpdateAt ? <>Last update {timeAgo(card.lastUpdateAt)}</> : "Never updated",
        "publish",
        "Publish update",
        "NEEDS_UPDATE",
        card.lastUpdateAt ? new Date(card.lastUpdateAt).getTime() : 0,
      ),
    );
  }

  // ── Later ──
  for (const card of data.upcomingUpdateReminders) {
    if (card.dueInDays == null || card.dueInDays <= 0) continue;
    later.push(reminderRow(card, "Update due"));
  }
  for (const card of data.upcomingDeliveries) {
    if (isPast(card.estimatedDelivery)) continue;
    later.push(
      orderRow(
        card,
        "Delivery",
        card.estimatedDelivery ? (
          <>
            Est. delivery {formatDate(card.estimatedDelivery)}
            {card.dueInDays != null ? ` · ${dueLabel(card.dueInDays)}` : ""}
          </>
        ) : (
          "Delivery expected"
        ),
        "open",
        "Open",
        "UPCOMING_DELIVERY",
        card.estimatedDelivery ? new Date(card.estimatedDelivery).getTime() : Date.now(),
      ),
    );
  }

  // Most urgent first inside each bucket.
  overdue.sort((a, b) => a.sortAt - b.sortAt);
  today.sort((a, b) => a.sortAt - b.sortAt);
  later.sort((a, b) => a.sortAt - b.sortAt);
  return { overdue, today, later };
}

// ─── The view ────────────────────────────────────────────────────────────────

export function AdminAttentionView() {
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "attention"],
    queryFn: () => api.get<AttentionCentreDto>("/api/admin/attention"),
  });

  const buckets = useMemo(() => buildBuckets(data), [data]);

  const dismiss = useMutation({
    mutationFn: (vars: { orderId: string; section: DismissSection }) =>
      api.post<{ ok: boolean }>("/api/admin/attention", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "attention"] });
      toast({ title: "Marked as reviewed" });
    },
    onError: (err: Error) => toast({ title: "Could not mark reviewed", description: err.message }),
  });

  // ── Publish-update flow: the sheet needs the full order, fetched on demand.
  const [publishOrderId, setPublishOrderId] = useState<string | null>(null);
  const {
    data: publishOrder,
    isError: publishIsError,
    error: publishError,
  } = useQuery({
    queryKey: ["admin", "order", publishOrderId ?? ""],
    queryFn: () => api.get<OrderDetail>(`/api/admin/orders/${publishOrderId}`),
    enabled: publishOrderId !== null,
  });

  function markReviewed(orderId: string, section: DismissSection) {
    dismiss.mutate({ orderId, section });
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Attention" />
        <InlineError message={error instanceof Error ? error.message : "Could not load."} />
      </div>
    );
  }

  const total = buckets.overdue.length + buckets.today.length + buckets.later.length;

  const renderRow = (item: AttentionRowItem, kraft: boolean) => (
    <AttentionRow
      key={item.key}
      item={item}
      kraft={kraft}
      onPublishOrder={setPublishOrderId}
      onMarkReviewed={
        item.dismiss ? () => markReviewed(item.dismiss!.orderId, item.dismiss!.section) : undefined
      }
      dismissPending={dismiss.isPending}
    />
  );

  return (
    <div>
      <PageHeader title="Attention" />

      {isLoading || data == null ? (
        <div className="space-y-4 sm:space-y-6">
          <SectionCard>
            <RowsSkeleton rows={4} />
          </SectionCard>
          <SectionCard>
            <RowsSkeleton rows={3} />
          </SectionCard>
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing needs attention"
          action={
            <Button variant="outline" onClick={() => navigate("admin-overview")}>
              Go to overview
            </Button>
          }
        />
      ) : (
        <ViewEnter>
          <p className="text-body text-muted-foreground">
            <span className={cn("tnum", total > 0 && "font-medium text-kraft-ink")}>{total}</span> items need you ·{" "}
            <span className={cn("tnum", buckets.overdue.length > 0 && "font-medium text-kraft-ink")}>
              {buckets.overdue.length}
            </span>{" "}
            overdue
          </p>

          <div className="mt-6 space-y-4 sm:space-y-6">
            {buckets.overdue.length > 0 && (
              <AttentionSection icon={Clock} title="Overdue" count={buckets.overdue.length} countTone="danger">
                {buckets.overdue.map((item) => renderRow(item, true))}
              </AttentionSection>
            )}

            {buckets.today.length > 0 && (
              <AttentionSection icon={Inbox} title="Today" count={buckets.today.length} countTone="kraft">
                {buckets.today.map((item) => renderRow(item, false))}
              </AttentionSection>
            )}

            {buckets.later.length > 0 && (
              <AttentionSection icon={CalendarClock} title="Later" count={buckets.later.length} countTone="neutral">
                {buckets.later.map((item) => renderRow(item, false))}
              </AttentionSection>
            )}
          </div>
        </ViewEnter>
      )}

      {publishOrderId != null && publishIsError && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <InlineError
            className="min-w-0 flex-1"
            message={publishError instanceof Error ? publishError.message : "Could not load this order."}
          />
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPublishOrderId(null)}>
            Close
          </Button>
        </div>
      )}

      {publishOrderId && publishOrder && (
        <PublishUpdateDialog
          orderId={publishOrder.id}
          order={publishOrder}
          open
          onOpenChange={(v) => {
            if (!v) setPublishOrderId(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Section shell ───────────────────────────────────────────────────────────

function AttentionSection({
  icon: Icon,
  title,
  count,
  countTone,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  countTone: "danger" | "kraft" | "neutral";
  className?: string;
  children: ReactNode;
}) {
  return (
    <SectionCard
      className={className}
      title={
        <span className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {title}
        </span>
      }
      action={<CountBadge count={count} tone={countTone} />}
      bodyClassName="p-0"
    >
      <ul className="divide-y">{children}</ul>
    </SectionCard>
  );
}

function CountBadge({ count, tone }: { count: number; tone: "danger" | "kraft" | "neutral" }) {
  const tones: Record<"danger" | "kraft" | "neutral", string> = {
    danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
    kraft: "bg-kraft-soft text-kraft-ink",
    neutral: "bg-secondary text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "tnum inline-flex h-[20px] shrink-0 items-center justify-center rounded-full px-2 text-caption font-medium",
        tones[tone],
      )}
    >
      {count}
    </span>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function AttentionRow({
  item,
  kraft,
  onPublishOrder,
  onMarkReviewed,
  dismissPending,
}: {
  item: AttentionRowItem;
  kraft?: boolean;
  onPublishOrder: (orderId: string) => void;
  onMarkReviewed?: () => void;
  dismissPending: boolean;
}) {
  const navigate = useAppStore((s) => s.navigate);

  function runPrimaryAction() {
    switch (item.action) {
      case "publish":
        if (item.orderId) onPublishOrder(item.orderId);
        break;
      case "reply":
        navigate("admin-notifications");
        break;
      case "review":
      case "open":
        if (item.orderId) navigate("admin-order-detail", { id: item.orderId });
        break;
    }
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4",
        kraft && "border-l-2 border-l-kraft bg-kraft-soft/60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-micro", kraft ? "text-kraft-ink" : "text-muted-foreground")}>
            {item.typeLabel}
          </span>
          {renderReference(item.reference, navigate)}
        </div>
        <p className="mt-1 tnum text-caption leading-snug text-muted-foreground">{item.context}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant={kraft ? "kraft" : "outline"} size="sm" onClick={runPrimaryAction}>
          {item.actionLabel}
        </Button>
        {onMarkReviewed && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            disabled={dismissPending}
            onClick={onMarkReviewed}
            aria-label={`Mark ${item.ariaName} reviewed`}
            title="Mark reviewed"
          >
            <CheckCheck className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}

/** Order-number buttons navigate to the order; subjects stay inert. */
function renderReference(ref: RowRef, navigate: NavigateFn): ReactNode {
  if (ref.kind === "order") {
    return (
      <button
        type="button"
        className="rounded font-mono text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => navigate("admin-order-detail", { id: ref.orderId })}
      >
        {ref.orderNumber}
      </button>
    );
  }
  return (
    <>
      <span className="min-w-0 truncate text-body-sm font-medium text-foreground">{ref.subject}</span>
      {ref.orderNumber && ref.orderId && (
        <button
          type="button"
          className="rounded font-mono text-caption text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => navigate("admin-order-detail", { id: ref.orderId as string })}
        >
          {ref.orderNumber}
        </button>
      )}
    </>
  );
}
