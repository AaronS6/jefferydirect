"use client";

// Local administration UI helpers — shared only inside src/components/admin.
// These wrap the design language from CONTRACT.md: restrained cards, tiny
// uppercase group headers, 13px tables, generous padding.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  Check,
  Copy,
  FileText,
  FolderOpen,
  MessageSquare,
  PackageCheck,
  Search,
  Settings,
  Tag,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Debounce a fast-changing value (search boxes) for query keys. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── View-enter motion ──────────────────────────────────────────────────────

/**
 * Quiet view-enter wrapper: 8px rise + fade, 220ms, eased like paper settling.
 * Respects prefers-reduced-motion (fade only).
 */
export function ViewEnter({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ─── Table cell shorthands (design-language defaults) ───────────────────────

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <TableHead
      className={cn("h-9 whitespace-nowrap px-3 text-left text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <TableCell className={cn("px-3 py-2 text-body-sm align-middle", className)} {...props} />;
}

// ─── Section card ────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  description: _description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  /** Not rendered (copy diet). */
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-[14px] border bg-card shadow-xs", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          {title && <h2 className="text-title text-foreground">{title}</h2>}
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Tiny uppercase group label used inside cards. */
export function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-micro text-muted-foreground", className)}>{children}</p>
  );
}

// ─── Toolbar / filters ────────────────────────────────────────────────────────

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 shadow-xs", className)}
    >
      {children}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative min-w-[180px] flex-1 sm:max-w-xs", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="h-9 pl-8 text-body-sm"
      />
    </div>
  );
}

// ─── Money input ──────────────────────────────────────────────────────────────

/**
 * Controlled dollar-amount text input. Parsing to cents is the caller's job
 * (parseDollarsToCents); `invalid` drives the error styling.
 */
export function MoneyInput({
  value,
  onChange,
  invalid,
  placeholder = "0.00",
  className,
  ariaLabel = "Price in dollars",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  id?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <span
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-body-sm text-muted-foreground"
        aria-hidden
      >
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        className="tnum h-9 pl-6 text-body-sm"
      />
    </div>
  );
}

// ─── Inline error / alerts ───────────────────────────────────────────────────

export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-3 text-body-sm leading-relaxed text-[var(--status-danger-fg)]",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 text-caption leading-snug text-[var(--status-danger-fg)]">
      {children}
    </p>
  );
}

// ─── Skeletons ───────────────────────────────────────────────────────────────

export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[14px] border bg-card shadow-xs sm:grid-cols-3 lg:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-border/70">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-4 h-9 w-20" />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-md" />
      ))}
    </div>
  );
}

// ─── Kind icon (activity / notifications / pending tasks) ───────────────────

export function kindIcon(kind: string): LucideIcon {
  switch (kind.toUpperCase()) {
    case "ORDER":
      return PackageCheck;
    case "QUOTATION":
      return FileText;
    case "DOCUMENT":
      return FolderOpen;
    case "MESSAGE":
      return MessageSquare;
    case "CUSTOMER":
    case "ORGANIZATION":
      return Users;
    case "PRICE":
    case "PRICING":
      return Tag;
    case "SETTINGS":
      return Settings;
    default:
      return Bell;
  }
}

/**
 * Render the icon for a notification/activity kind. Defined as a stable
 * top-level component so it can be used directly inside render bodies
 * (avoids creating components during render).
 */
export function KindMark({ kind, className }: { kind: string; className?: string }) {
  const Icon = KIND_ICONS[kind.toUpperCase()] ?? Bell;
  return <Icon className={className ?? "size-3.5"} aria-hidden />;
}

const KIND_ICONS: Record<string, LucideIcon> = {
  ORDER: PackageCheck,
  QUOTATION: FileText,
  DOCUMENT: FolderOpen,
  MESSAGE: MessageSquare,
  CUSTOMER: Users,
  ORGANIZATION: Users,
  PRICE: Tag,
  PRICING: Tag,
  SETTINGS: Settings,
};

// ─── Org chip ─────────────────────────────────────────────────────────────────

export function OrgChip({
  name,
  code,
  onClick,
}: {
  name: string;
  code?: string | null;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="truncate font-medium">{name}</span>
      {code && <span className="font-mono text-caption text-muted-foreground">{code}</span>}
    </>
  );
  const cls =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 text-caption font-medium text-foreground";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          cls,
          "transition-colors hover:border-ring/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        {inner}
      </button>
    );
  }
  return <span className={cls}>{inner}</span>;
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

// ─── Temporary password panel ────────────────────────────────────────────────

/**
 * Highlighted one-time credential panel — shown after creating a customer,
 * inviting a customer user, or adding an internal user.
 */
export function TempPasswordPanel({
  email,
  password,
  intro,
}: {
  email: string;
  password: string;
  intro?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const ok = await copyText(password);
    if (ok) {
      setCopied(true);
      toast({ title: "Password copied" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } else {
      toast({ title: "Copy failed. Select and copy manually." });
    }
  }

  return (
    <div className="rounded-[14px] border border-kraft/40 bg-kraft-soft p-5">
      <GroupLabel className="text-kraft-ink">Temporary password, shown once</GroupLabel>
      <div className="mt-3 flex items-center gap-2">
        <code
          className="tnum flex-1 truncate rounded-md border border-kraft/30 bg-card px-3 py-2 font-mono text-body font-medium text-foreground select-all"
          aria-label="Temporary password"
        >
          {password}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="gap-1.5">
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-3 text-body-sm leading-relaxed text-kraft-ink">
        {intro ?? (
          <>
            Email: <span className="font-medium">{email}</span>. This password is shown once.
          </>
        )}
      </p>
    </div>
  );
}

// ─── Definition row (label / value pairs used in detail grids) ───────────────

export function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-[130px] shrink-0 text-micro text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-body-sm leading-relaxed text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

export function dashed(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}
