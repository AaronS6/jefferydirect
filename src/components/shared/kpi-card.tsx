"use client";

// KPI presentation — a single connected panel divided by hairlines, not a
// row of separate cards. Values render directly (no count-up animation).
// `hint` is kept as a prop so call sites compile but is not rendered.

import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Plain localized numeral. Kept as a named export for existing imports. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  return <span className={cn("tnum", className)}>{value.toLocaleString("en-CA")}</span>;
}

export function KpiCell({
  label,
  value,
  hint: _hint,
  onClick,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Not rendered (copy diet). */
  hint?: string;
  onClick?: () => void;
  className?: string;
}) {
  const clickable = Boolean(onClick);
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      type={clickable ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative p-5 text-left",
        clickable &&
          "cursor-pointer transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
        className,
      )}
    >
      <p className="text-micro text-muted-foreground">{label}</p>
      <p className="tnum font-display mt-2 text-numeral font-normal text-foreground">{value}</p>
      {clickable && (
        <ArrowUpRight
          className="absolute right-4 top-4 size-4 translate-y-0.5 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
          aria-hidden
        />
      )}
    </Comp>
  );
}

/** Connected KPI panel: one surface, hairline dividers between cells. */
export function KpiStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 overflow-hidden rounded-[14px] border bg-card shadow-xs sm:grid-cols-2 lg:grid-cols-4",
        "[&>*+*]:border-t [&>*+*]:border-border/70",
        "sm:[&>*+*]:border-t-0 sm:[&>*:nth-child(even)]:border-l sm:[&>*:nth-child(n+3)]:border-t",
        "lg:[&>*:nth-child(n+2)]:border-l lg:[&>*:nth-child(n+2)]:border-t-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Legacy wrapper — keeps existing KpiCard imports working. */
export function KpiCard({
  icon: _icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  onClick?: () => void;
}) {
  return <KpiCell label={label} value={value} hint={hint} onClick={onClick} />;
}
