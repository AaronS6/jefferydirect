// ClientHub brand mark — a folded carton seen from above: three flat planes,
// no gradients. Works in currentColor contexts; the top plane carries the
// kraft accent. The lockup pairs the mark with the wordmark.

import { cn } from "@/lib/utils";

export function BrandMark({
  size = 32,
  className,
  accent = true,
}: {
  size?: number;
  className?: string;
  accent?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
      fill="none"
      shapeRendering="geometricPrecision"
    >
      {/* top plane — the kraft accent */}
      <path
        d="M16 5.5 L27 11 L16 16.5 L5 11 Z"
        fill={accent ? "var(--kraft)" : "currentColor"}
        opacity={accent ? 1 : 0.4}
      />
      {/* left wall — full ink */}
      <path d="M5 11 L16 16.5 L16 27 L5 21.5 Z" fill="currentColor" opacity="0.92" />
      {/* right wall — lighter ink for depth */}
      <path d="M27 11 L16 16.5 L16 27 L27 21.5 Z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export function BrandLockup({
  className,
  markClassName,
  accent = true,
  compact = false,
}: {
  className?: string;
  markClassName?: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={compact ? 26 : 32} className={cn("shrink-0", markClassName)} accent={accent} />
      <div className="min-w-0">
        <p className="text-body font-semibold leading-tight tracking-tight text-foreground">ClientHub</p>
        <p className="text-micro text-muted-foreground">Jeffery Group Ltd.</p>
      </div>
    </div>
  );
}
