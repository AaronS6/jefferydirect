// Money display with tabular numerals; cents in, formatted CAD out.

import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";

export function Money({
  cents,
  className,
  muted,
}: {
  cents: number | null | undefined;
  className?: string;
  muted?: boolean;
}) {
  if (cents === null || cents === undefined) {
    return <span className={cn("tnum text-muted-foreground", className)}>—</span>;
  }
  return <span className={cn("tnum", muted && "text-muted-foreground", className)}>{formatCents(cents)}</span>;
}

export function MoneyWithCode({ cents, className }: { cents: number | null; className?: string }) {
  if (cents === null) return <span className={cn("tnum text-muted-foreground", className)}>—</span>;
  return (
    <span className={cn("tnum", className)}>
      {formatCents(cents)} <span className="text-muted-foreground text-xs font-normal">CAD</span>
    </span>
  );
}
