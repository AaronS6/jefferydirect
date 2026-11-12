"use client";

// Customer Update Centre timeline — the chronological history of published
// progress updates on an order. The latest update renders prominently;
// older updates remain accessible below. Admin variant also renders
// unpublished drafts with a clear "Draft" distinction.

import { useState } from "react";
import { CalendarClock, ChevronDown, FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/date";
import { UPDATE_CATEGORY_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants";
import { statusTone, statusDotTone } from "@/components/shared/status-badge";
import type { OrderUpdateDto } from "@/types";

// Token families per update category — same system as status badges.
const CATEGORY_TONE: Record<string, string> = {
  ORDER_ACCEPTED: "done",
  PREPARATION: "neutral",
  PRODUCTION: "production",
  PRODUCTION_COMPLETED: "production",
  READY_DISPATCH: "shipping",
  SHIPMENT: "shipping",
  DELIVERY: "done",
  DELAY: "kraft",
  INFO: "neutral",
  COMPLETED: "done",
};

export function UpdateCategoryBadge({ category }: { category: string }) {
  const family = CATEGORY_TONE[category] ?? "neutral";
  return (
    <span className={statusTone(family)}>
      <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", statusDotTone(family))} />
      {UPDATE_CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

function AttachmentChips({ attachments }: { attachments: { name: string; sizeLabel: string }[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5">
      {attachments.map((a, i) => (
        <li
          key={`${a.name}-${i}`}
          className="inline-flex h-[22px] max-w-full items-center gap-1.5 truncate rounded-full border bg-card px-2.5 text-caption text-muted-foreground"
          title={`${a.name} (${a.sizeLabel})`}
        >
          <Paperclip className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{a.name}</span>
          <span className="shrink-0 text-muted-foreground/70">{a.sizeLabel}</span>
        </li>
      ))}
    </ul>
  );
}

function UpdateEntry({ update, latest, admin }: { update: OrderUpdateDto; latest?: boolean; admin?: boolean }) {
  const publishedAt = update.publishedAt ?? update.createdAt;
  const isDelay = update.category === "DELAY";
  return (
    <article
      className={cn(
        "relative rounded-[14px] border bg-card px-4 py-4 sm:px-5",
        latest ? "shadow-xs" : "bg-card/70",
        isDelay && "border-kraft/40 bg-kraft-soft/60",
        !update.isPublished && "border-dashed",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h3 className="text-body font-medium leading-tight text-foreground">{update.title}</h3>
        {latest && update.isPublished && (
          <span className="inline-flex h-[22px] items-center rounded-full bg-foreground px-2.5 text-caption font-semibold text-background">
            Latest
          </span>
        )}
        {!update.isPublished && (
          <span className="inline-flex h-[22px] items-center rounded-full border border-dashed border-border bg-transparent px-2.5 text-caption font-medium text-muted-foreground">
            Draft — not visible to customer
          </span>
        )}
        <span className="tnum text-caption ml-auto text-muted-foreground">{formatDateTime(publishedAt)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <UpdateCategoryBadge category={update.category} />
        {update.newStatus && (
          <span className="inline-flex h-[22px] items-center rounded-full border bg-card px-2.5 text-caption font-medium text-muted-foreground">
            Status → {ORDER_STATUS_LABELS[update.newStatus] ?? update.newStatus}
          </span>
        )}
      </div>
      <p className="mt-2.5 whitespace-pre-line text-body-sm leading-relaxed text-foreground/90">{update.message}</p>
      {(update.estimatedDelivery || update.revisedDelivery || update.nextUpdateDate) && (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded-[10px] border bg-surface-sunken/70 px-3.5 py-2.5 sm:grid-cols-3">
          {update.revisedDelivery ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-micro shrink-0 text-muted-foreground">Revised delivery</dt>
              <dd className="tnum text-body-sm font-medium text-kraft-ink">{formatDate(update.revisedDelivery)}</dd>
            </div>
          ) : update.estimatedDelivery ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-micro shrink-0 text-muted-foreground">Estimated delivery</dt>
              <dd className="tnum text-body-sm font-medium">{formatDate(update.estimatedDelivery)}</dd>
            </div>
          ) : null}
          {update.nextUpdateDate && (
            <div className="flex items-baseline gap-1.5">
              <CalendarClock className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
              <dt className="text-micro shrink-0 text-muted-foreground">Next update expected</dt>
              <dd className="tnum text-body-sm font-medium">{formatDate(update.nextUpdateDate)}</dd>
            </div>
          )}
        </dl>
      )}
      <AttachmentChips attachments={update.attachments} />
      <p className="mt-2.5 text-caption text-muted-foreground/80">
        {admin ? "Published" : "Posted"} by {update.authorName}
        {admin && !update.isPublished && " · edit before publishing"}
      </p>
    </article>
  );
}

export function UpdateTimeline({ updates, admin = false }: { updates: OrderUpdateDto[]; admin?: boolean }) {
  const published = updates.filter((u) => u.isPublished);
  const drafts = admin ? updates.filter((u) => !u.isPublished) : [];
  const [showDrafts, setShowDrafts] = useState(true);

  if (published.length === 0 && drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed px-6 py-8 text-center">
        <FileText className="size-5 text-muted-foreground/50" aria-hidden />
        <p className="mt-2 text-body-sm font-medium text-foreground">No updates yet</p>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {admin
            ? "Publish the first progress update for this order — customers will see it on their order page."
            : "Jeffery Group will publish progress updates here as your order moves forward."}
        </p>
      </div>
    );
  }

  const latest = published[0];
  const older = published.slice(1);

  return (
    <div className="space-y-4">
      {latest && <UpdateEntry update={latest} latest admin={admin} />}
      {drafts.length > 0 && showDrafts && (
        <div className="space-y-3">
          {drafts.map((d) => (
            <UpdateEntry key={d.id} update={d} admin />
          ))}
        </div>
      )}
      {drafts.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-caption text-muted-foreground"
          onClick={() => setShowDrafts((v) => !v)}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !showDrafts && "-rotate-90")} aria-hidden />
          {showDrafts ? "Hide" : "Show"} {drafts.length} draft{drafts.length === 1 ? "" : "s"}
        </Button>
      )}
      {older.length > 0 && (
        <div className="space-y-3">
          <p className="text-micro text-muted-foreground">Earlier updates</p>
          {older.map((u) => (
            <UpdateEntry key={u.id} update={u} admin={admin} />
          ))}
        </div>
      )}
    </div>
  );
}
