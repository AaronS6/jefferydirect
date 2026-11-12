// Order status timeline — completed / current / upcoming steps with dates.
// Hairline spine, ink dots for completed steps, kraft ring on the current one.

import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_TERMINAL_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";
import type { OrderHistoryEntry } from "@/types";

export function OrderTimeline({
  status,
  history,
}: {
  status: string;
  history: OrderHistoryEntry[];
}) {
  const terminal = ORDER_TERMINAL_STATUSES.includes(status);
  const cancelled = status === "CANCELLED" || status === "REJECTED";
  const flow = ORDER_STATUSES;
  const currentIndex = flow.indexOf(status as (typeof flow)[number]);
  const historyByStatus = new Map<string, OrderHistoryEntry[]>();
  for (const h of [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const list = historyByStatus.get(h.status) ?? [];
    list.push(h);
    historyByStatus.set(h.status, list);
  }

  if (cancelled) {
    const entries = historyByStatus.get(status) ?? [];
    return (
      <div className="space-y-3">
        <div className="rounded-[10px] bg-[var(--status-danger-bg)] px-4 py-3">
          <p className="text-body-sm font-medium text-[var(--status-danger-fg)]">{ORDER_STATUS_LABELS[status]}</p>
          {entries.map((e) =>
            e.note ? (
              <p key={e.id} className="mt-1 text-body-sm text-[var(--status-danger-fg)]/80">
                {e.note} · {formatDateTime(e.createdAt)}
              </p>
            ) : null,
          )}
        </div>
        <TimelineRows flow={flow} currentIndex={currentIndex} historyByStatus={historyByStatus} deadFrom={currentIndex} />
      </div>
    );
  }

  return (
    <TimelineRows
      flow={flow}
      currentIndex={currentIndex}
      historyByStatus={historyByStatus}
      deadFrom={terminal ? currentIndex + 1 : -1}
    />
  );
}

function TimelineRows({
  flow,
  currentIndex,
  historyByStatus,
  deadFrom,
}: {
  flow: readonly string[];
  currentIndex: number;
  historyByStatus: Map<string, OrderHistoryEntry[]>;
  deadFrom: number; // from this index onward, render as not-applicable
}) {
  return (
    <ol className="relative space-y-0">
      {flow.map((s, i) => {
        const entries = historyByStatus.get(s) ?? [];
        const latest = entries[entries.length - 1];
        const done = i < currentIndex || (deadFrom > 0 && i >= 0 && entries.length > 0);
        const current = i === currentIndex;
        const notApplicable = deadFrom >= 0 ? i >= deadFrom && entries.length === 0 : false;
        return (
          <li key={s} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* hairline spine */}
            {i < flow.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[6.5px] top-[18px] h-[calc(100%-14px)] w-px",
                  done || current ? "bg-foreground/25" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 mt-[2px] flex size-[14px] shrink-0 items-center justify-center rounded-full",
                done
                  ? "bg-foreground"
                  : current
                    ? "border-2 border-kraft-strong bg-kraft"
                    : "border border-border bg-card",
                notApplicable && "border-dashed border-border/70 bg-transparent",
              )}
            >
              {done && <span className="size-[4.5px] rounded-full bg-background" />}
            </span>
            <div className="min-w-0 flex-1 -translate-y-[2px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p
                  className={cn(
                    "text-body-sm font-medium",
                    current ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground",
                    notApplicable && "text-muted-foreground/50",
                  )}
                >
                  {ORDER_STATUS_LABELS[s]}
                  {current && (
                    <span className="text-micro ml-2 text-kraft-ink">Current</span>
                  )}
                </p>
                {latest && (
                  <p className="tnum text-caption text-muted-foreground">{formatDateTime(latest.createdAt)}</p>
                )}
              </div>
              {entries
                .filter((e) => e.note)
                .map((e) => (
                  <p key={e.id} className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
                    {e.note}
                    {e.byName && <span className="text-muted-foreground/70"> · {e.byName}</span>}
                  </p>
                ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
