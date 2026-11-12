"use client";

// Small local building blocks shared by the customer-portal views.
// Kept inside `src/components/portal` per task scope — complements (never
// duplicates) the shared components under `src/components/shared`.

import { Heart, Minus, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { ProductListItem, SavedProductDto } from "@/types";
import { cn } from "@/lib/utils";

// ─── Errors ──────────────────────────────────────────────────────────────────

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function ErrorAlert({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[var(--status-danger-bg)] px-4 py-3"
    >
      <div className="flex items-start gap-2.5 text-body-sm text-[var(--status-danger-fg)]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onRetry}>
          <RotateCcw className="size-3.5" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

// ─── Typography helpers ──────────────────────────────────────────────────────

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-caption tracking-tight", className)}>{children}</span>;
}

export function ValueOrDash({ children }: { children: React.ReactNode | null | undefined }) {
  if (children === null || children === undefined || children === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  return <>{children}</>;
}

// ─── Section card ─────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  description: _description,
  actions,
  children,
  className,
  contentClassName,
  id,
}: {
  title?: React.ReactNode;
  /** Not rendered (copy diet). */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("rounded-[14px] border bg-card shadow-xs", className)}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-5 py-4">
          {title && (
            <h2 id={id ? `${id}-title` : undefined} className="text-body font-medium leading-tight text-foreground">
              {title}
            </h2>
          )}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}

// ─── Detail rows (spec-style definition lists) ───────────────────────────────

export function DetailRow({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-micro shrink-0 text-muted-foreground sm:w-44">{label}</dt>
      <dd className="text-body-sm min-w-0 flex-1 leading-relaxed text-foreground sm:text-right">
        <ValueOrDash>{children}</ValueOrDash>
      </dd>
    </div>
  );
}

// Summary grid item — stacked label/value pairs for detail header grids.
export function SummaryItem({
  label,
  children,
  className,
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border/60 py-3", className)}>
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd className="text-body-sm mt-1 leading-relaxed text-foreground">
        <ValueOrDash>{children}</ValueOrDash>
      </dd>
    </div>
  );
}

// ─── Quantity stepper ─────────────────────────────────────────────────────────

export function QtyStepper({
  value,
  onChange,
  min = 1,
  increment = 1,
  disabled,
  ariaLabel = "Quantity",
  size = "md",
}: {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  increment?: number;
  disabled?: boolean;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  const clamp = (n: number) => Math.max(min, n);
  const h = size === "sm" ? "size-8" : "size-9";
  return (
    <div
      className={cn(
        "inline-flex items-center overflow-hidden rounded-md border border-input bg-card shadow-xs",
        disabled && "opacity-60",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(h, "rounded-none")}
        disabled={disabled || value - increment < min}
        onClick={() => onChange(clamp(value - increment))}
        aria-label={`Decrease ${ariaLabel}`}
      >
        <Minus className="size-3.5" aria-hidden />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        className={cn(
          "tnum h-8 w-16 border-x border-border/70 bg-transparent py-1 text-center text-body-sm outline-none disabled:opacity-60",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
        value={Number.isFinite(value) ? value : ""}
        min={min}
        step={increment}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isNaN(n)) return;
          onChange(Math.max(min, n));
        }}
        onBlur={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isNaN(n)) onChange(min);
          else if (n < min) onChange(min);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(h, "rounded-none")}
        disabled={disabled}
        onClick={() => onChange(clamp(value + increment))}
        aria-label={`Increase ${ariaLabel}`}
      >
        <Plus className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

// ─── Skeleton blocks ──────────────────────────────────────────────────────────

export function KpiSkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-[14px] border bg-card shadow-xs sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-border/70 p-5 sm:[&:nth-child(even)]:border-l lg:border-l">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-4 h-9 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

// ─── Chips row for small attribute strings ────────────────────────────────────

export function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-[22px] max-w-full items-center truncate rounded-full border bg-card px-2.5 text-caption font-medium text-muted-foreground"
    >
      {children}
    </span>
  );
}

// ─── Favourites (saved products) ─────────────────────────────────────────────
// Shared by the catalogue and product detail. Query key matches the existing
// ["customer-saved-products"] cache used across the portal so every mutation
// invalidates the same list.

/** Fields needed to build an optimistic SavedProductDto row. */
export type FavouriteProduct = Pick<
  ProductListItem,
  "id" | "sku" | "name" | "priceCents" | "priceSource" | "stockStatus" | "unit" | "minOrderQty" | "increment" | "casePack"
>;

export function useFavourites() {
  const session = useAppStore((s) => s.session);
  const queryClient = useQueryClient();
  // READONLY users cannot write saved products (the POST endpoint rejects them).
  const canSave = session?.user.orgRole === "ORG_ADMIN" || session?.user.orgRole === "PURCHASING";

  const { data: saved } = useQuery({
    queryKey: ["customer-saved-products"],
    queryFn: () => api.get<SavedProductDto[]>("/api/customer/saved-products"),
    enabled: canSave,
  });

  const toggleMutation = useMutation<
    { removed: boolean },
    Error,
    { product: FavouriteProduct; qty: number; savedRowId?: string },
    { prev: SavedProductDto[] | undefined }
  >({
    mutationFn: async (vars) => {
      if (vars.savedRowId) {
        await api.del<{ ok: boolean }>(`/api/customer/saved-products/${vars.savedRowId}`);
        return { removed: true };
      }
      await api.post<{ id: string }>("/api/customer/saved-products", {
        productId: vars.product.id,
        qty: vars.qty,
      });
      return { removed: false };
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["customer-saved-products"] });
      const prev = queryClient.getQueryData<SavedProductDto[]>(["customer-saved-products"]);
      if (prev) {
        if (vars.savedRowId) {
          queryClient.setQueryData(
            ["customer-saved-products"],
            prev.filter((r) => r.productId !== vars.product.id),
          );
        } else {
          // Optimistic placeholder row — replaced by the server payload on settle.
          queryClient.setQueryData(["customer-saved-products"], [
            {
              id: `pending-${vars.product.id}`,
              productId: vars.product.id,
              sku: vars.product.sku,
              name: vars.product.name,
              qty: vars.qty,
              note: null,
              priceCents: vars.product.priceCents,
              priceSource: vars.product.priceSource,
              stockStatus: vars.product.stockStatus,
              available: true,
              unit: vars.product.unit,
              minOrderQty: vars.product.minOrderQty,
              increment: vars.product.increment,
              casePack: vars.product.casePack,
              createdAt: new Date().toISOString(),
            } satisfies SavedProductDto,
            ...prev,
          ]);
        }
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback the optimistic flip.
      if (ctx?.prev) queryClient.setQueryData(["customer-saved-products"], ctx.prev);
      toast({ title: "Could not save" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-saved-products"] });
    },
  });

  const savedRows = saved ?? [];
  const savedIds = new Set(savedRows.map((r) => r.productId));
  const toggle = (product: FavouriteProduct, qty: number) => {
    // Skip optimistic placeholders so a rapid double toggle POSTs again
    // (an upsert) rather than DELETEing a non-existent row id.
    const row = savedRows.find((r) => r.productId === product.id && !r.id.startsWith("pending-"));
    toggleMutation.mutate({ product, qty, savedRowId: row?.id });
  };

  return {
    canSave,
    savedRows,
    savedIds,
    isFavourite: (productId: string) => savedIds.has(productId),
    toggle,
    busy: toggleMutation.isPending,
  };
}

export function FavouriteHeart({
  active,
  busy,
  product,
  onToggle,
  className,
}: {
  active: boolean;
  busy?: boolean;
  product: { id: string; name: string };
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-pressed={active}
      aria-label={active ? `Remove ${product.name} from favourites` : `Add ${product.name} to favourites`}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn("text-muted-foreground hover:text-foreground", active && "text-kraft-strong hover:text-kraft-strong", className)}
    >
      <Heart className="size-4" fill={active ? "currentColor" : "none"} aria-hidden />
    </Button>
  );
}
