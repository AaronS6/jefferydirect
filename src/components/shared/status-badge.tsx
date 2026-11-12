// Status badges — dot + text on a tinted background, no borders.
// Colours come from the --status-* token family in globals.css so both
// light and dark themes stay coherent without per-component overrides.

import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  ORDER_SOURCE_SHORT_LABELS,
} from "@/lib/constants";

// Token families: pending | active | production | shipping | done | danger | neutral | kraft
// NOTE: classes must be static strings so Tailwind can generate the utilities.
const TONE_CLASS: Record<string, string> = {
  pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
  active: "bg-[var(--status-active-bg)] text-[var(--status-active-fg)]",
  production: "bg-[var(--status-production-bg)] text-[var(--status-production-fg)]",
  shipping: "bg-[var(--status-shipping-bg)] text-[var(--status-shipping-fg)]",
  done: "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]",
  kraft: "bg-[var(--status-kraft-bg)] text-[var(--status-kraft-fg)]",
};

const DOT_CLASS: Record<string, string> = {
  pending: "bg-[var(--status-pending-dot)]",
  active: "bg-[var(--status-active-dot)]",
  production: "bg-[var(--status-production-dot)]",
  shipping: "bg-[var(--status-shipping-dot)]",
  done: "bg-[var(--status-done-dot)]",
  danger: "bg-[var(--status-danger-dot)]",
  neutral: "bg-[var(--status-neutral-dot)]",
  kraft: "bg-[var(--status-kraft-dot)]",
};

export function statusTone(family: string): string {
  return cn(
    "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption font-medium",
    TONE_CLASS[family] ?? TONE_CLASS.neutral,
  );
}

export function statusDotTone(family: string): string {
  return DOT_CLASS[family] ?? DOT_CLASS.neutral;
}

function ToneBadge({ family, children, className, title }: { family: string; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn(statusTone(family), className)} title={title}>
      <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", statusDotTone(family))} />
      {children}
    </span>
  );
}

const ORDER_TONES: Record<string, string> = {
  SUBMITTED: "pending",
  UNDER_REVIEW: "pending",
  AWAITING_CONFIRMATION: "pending",
  CONFIRMED: "active",
  PROCESSING: "active",
  IN_PRODUCTION: "production",
  READY_FOR_SHIPMENT: "shipping",
  DISPATCHED: "shipping",
  DELIVERED: "done",
  CANCELLED: "neutral",
  REJECTED: "danger",
};

const QUOTE_TONES: Record<string, string> = {
  REQUESTED: "pending",
  UNDER_REVIEW: "pending",
  ISSUED: "active",
  ACCEPTED: "done",
  REJECTED: "danger",
  EXPIRED: "neutral",
  REVISED: "production",
  CANCELLED: "neutral",
};

export function StatusBadge({ status, kind }: { status: string; kind: "order" | "quote" | "org" | "user" | "stock" }) {
  const toneMap =
    kind === "order" ? ORDER_TONES : kind === "quote" ? QUOTE_TONES : undefined;
  const label =
    kind === "order"
      ? ORDER_STATUS_LABELS[status] ?? status
      : kind === "quote"
        ? QUOTE_STATUS_LABELS[status] ?? status
        : status;
  const family = toneMap?.[status] ?? "neutral";
  return (
    <ToneBadge family={family}>
      {label}
    </ToneBadge>
  );
}

export function OrgStatusBadge({ status }: { status: string }) {
  return <ToneBadge family={status === "ACTIVE" ? "done" : "neutral"}>{status === "ACTIVE" ? "Active" : "Suspended"}</ToneBadge>;
}

export function UserStatusBadge({ status }: { status: string }) {
  const families: Record<string, string> = { ACTIVE: "done", INVITED: "pending", DISABLED: "neutral" };
  const labels: Record<string, string> = { ACTIVE: "Active", INVITED: "Invited", DISABLED: "Disabled" };
  return <ToneBadge family={families[status] ?? "neutral"}>{labels[status] ?? status}</ToneBadge>;
}

export function StockBadge({ status }: { status: string }) {
  const families: Record<string, string> = {
    IN_STOCK: "done",
    MADE_TO_ORDER: "production",
    ENQUIRY_ONLY: "pending",
  };
  const labels: Record<string, string> = {
    IN_STOCK: "In Stock",
    MADE_TO_ORDER: "Made to Order",
    ENQUIRY_ONLY: "Quotation Required",
  };
  return <ToneBadge family={families[status] ?? "neutral"}>{labels[status] ?? status}</ToneBadge>;
}

export function DocumentCategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    INVOICE: "Invoice",
    PURCHASE_ORDER: "Purchase Order",
    QUOTATION: "Quotation",
    STATEMENT: "Statement",
    SPECIFICATION: "Specification",
    DELIVERY_RECEIPT: "Delivery Receipt",
    OTHER: "Other",
  };
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full border bg-card px-2.5 text-caption font-medium text-muted-foreground">
      {labels[category] ?? category}
    </span>
  );
}

const CHANGE_TONES: Record<string, string> = {
  PENDING: "pending",
  ACCEPTED: "done",
  DECLINED: "danger",
  COUNTERED: "kraft",
  WITHDRAWN: "neutral",
};

export function ChangeStatusBadge({ status }: { status: string }) {
  const family = CHANGE_TONES[status] ?? "neutral";
  return (
    <ToneBadge family={family}>
      {CHANGE_REQUEST_STATUS_LABELS[status] ?? status}
    </ToneBadge>
  );
}

export function OrderSourceBadge({ source }: { source: string }) {
  if (source === "PORTAL") return null;
  return (
    <ToneBadge
      family="kraft"
      title={`Order received outside ClientHub (${source}) — recorded by Jeffery Group`}
    >
      {ORDER_SOURCE_SHORT_LABELS[source] ?? source}
    </ToneBadge>
  );
}

export function OrgRoleBadge({ role }: { role: string }) {
  const labels: Record<string, string> = {
    ORG_ADMIN: "Org Admin",
    PURCHASING: "Purchasing",
    READONLY: "Read-only",
  };
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-caption font-medium",
        role === "ORG_ADMIN" ? "bg-kraft-soft text-kraft-ink" : "border bg-card text-muted-foreground",
      )}
    >
      {labels[role] ?? role}
    </span>
  );
}
