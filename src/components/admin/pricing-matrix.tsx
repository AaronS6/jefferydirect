"use client";

// Customer-specific pricing matrix — shared by the Pricing administration
// view and the customer profile's "Products & pricing" tab. Rows: default
// price, customer price override, note, catalogue approval.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { parseDollarsToCents, centsToInputValue } from "@/lib/money";
import { toast } from "@/hooks/use-toast";
import type { PricingRow } from "@/types";
import { FieldError, InlineError, RowsSkeleton, Th, Td } from "./admin-ui";
import { cn } from "@/lib/utils";

export function PricingMatrix({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "pricing", orgId],
    queryFn: () => api.get<PricingRow[]>(`/api/admin/pricing?orgId=${orgId}`),
    enabled: Boolean(orgId),
  });

  const access = useMutation({
    mutationFn: (payload: { productId: string; approved: boolean }) =>
      api.post<{ ok: boolean }>("/api/admin/products/access", { orgId, ...payload }),
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast({
        title: payload.approved ? "Product approved" : "Product access removed",
      });
    },
    onError: (err: Error) => toast({ title: "Could not update access", description: err.message }),
  });

  if (isLoading) return <RowsSkeleton rows={8} />;
  if (isError) return <InlineError message={error instanceof Error ? error.message : "Could not load pricing."} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title="No active products"
      />
    );
  }

  const customCount = data.filter((r) => r.customPriceCents !== null).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-body-sm text-muted-foreground">
          <span className="tnum font-medium text-foreground">{data.length}</span> products ·{" "}
          <span className="tnum font-medium text-foreground">{customCount}</span> with custom pricing
        </p>
        <p className="text-caption text-muted-foreground">
          Empty customer price falls back to the default. Blank default means quote required.
        </p>
      </div>

      <div className="hidden max-h-[60vh] overflow-auto md:block">
        <Table className="min-w-[900px]">
          <TableHeader className="sticky top-0 z-20 bg-[var(--surface-sunken)] [&_tr>th]:border-r [&_tr>th]:border-border/60">
            <TableRow className="hover:bg-transparent">
              <Th className="sticky left-0 z-30">Product</Th>
              <Th>Category</Th>
              <Th className="text-right">Default</Th>
              <Th>Customer price</Th>
              <Th>Note</Th>
              <Th className="text-center">In catalogue</Th>
              <Th className="text-right">Actions</Th>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr>td]:border-r [&_tr>td]:border-border/60">
            {data.map((row) => (
              <PricingMatrixRow
                key={`${row.productId}|${row.customPriceCents ?? "q"}|${row.note ?? ""}|${row.approved}`}
                row={row}
                orgId={orgId}
                onAccess={(approved) => access.mutate({ productId: row.productId, approved })}
                accessPending={access.isPending && access.variables?.productId === row.productId}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked editors */}
      <div className="space-y-3 md:hidden">
        {data.map((row) => (
          <PricingMatrixRowMobile
            key={`${row.productId}|${row.customPriceCents ?? "q"}|${row.note ?? ""}|${row.approved}`}
            row={row}
            orgId={orgId}
            onAccess={(approved) => access.mutate({ productId: row.productId, approved })}
            accessPending={access.isPending && access.variables?.productId === row.productId}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Desktop row ──────────────────────────────────────────────────────────────

function PricingMatrixRow({
  row,
  orgId,
  onAccess,
  accessPending,
}: {
  row: PricingRow;
  orgId: string;
  onAccess: (approved: boolean) => void;
  accessPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(row.customPriceCents !== null ? centsToInputValue(row.customPriceCents) : "");
  const [note, setNote] = useState(row.note ?? "");

  const parsed = price.trim() === "" ? null : parseDollarsToCents(price);
  const priceInvalid = price.trim() !== "" && parsed === null;
  const nextCents = priceInvalid ? undefined : (price.trim() === "" ? null : parsed);
  const effectiveCents = nextCents !== undefined ? nextCents : (row.customPriceCents ?? row.defaultPriceCents);
  const dirty = nextCents !== row.customPriceCents || note !== (row.note ?? "");

  const save = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>("/api/admin/pricing", {
        orgId,
        productId: row.productId,
        priceCents: price.trim() === "" ? null : parsed,
        note: note.trim() === "" ? null : note.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast({
        title: price.trim() === "" ? "Custom price removed" : "Customer price saved",
      });
    },
    onError: (err: Error) => toast({ title: "Could not save price", description: err.message }),
  });

  return (
    <TableRow>
      <Td className="sticky left-0 z-10 max-w-[220px] whitespace-normal bg-card">
        <p className="truncate font-medium">{row.name}</p>
        <p className="font-mono text-caption text-muted-foreground">{row.sku}</p>
      </Td>
      <Td className="text-muted-foreground">{row.categoryName}</Td>
      <Td className="tnum text-right">
        {row.defaultPriceCents !== null ? <Money cents={row.defaultPriceCents} muted /> : <span className="text-caption text-muted-foreground">Quote</span>}
      </Td>
      <Td className="min-w-[150px]">
        <PriceCell
          price={price}
          setPrice={setPrice}
          invalid={priceInvalid}
          placeholder={row.defaultPriceCents === null ? "Quote required" : "0.00"}
          effective={
            effectiveCents !== null ? (
              <span className="tnum">
                Effective <Money cents={effectiveCents} className="text-foreground" />
              </span>
            ) : (
              "Effective: quote required"
            )
          }
          overridden={parsed !== null && !priceInvalid}
          changed={dirty}
        />
      </Td>
      <Td className="min-w-[180px]">
        <div className="relative">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Volume commitment, agreement…"
            aria-label={`Pricing note for ${row.name}`}
            className="h-8 text-body-sm focus:border-ring focus:ring-2 focus:ring-ring/50"
          />
          {note !== (row.note ?? "") && <CellTick />}
        </div>
      </Td>
      <Td className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={row.approved}
            disabled={accessPending}
            onCheckedChange={(v) => onAccess(Boolean(v))}
            aria-label={`Approve ${row.name} for this customer`}
          />
          <span className={cn("text-caption", row.approved ? "text-foreground" : "text-muted-foreground")}>
            {row.approved ? "Approved" : "Hidden"}
          </span>
        </div>
      </Td>
      <Td className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label={`Reset ${row.name} to default price`}
            disabled={row.customPriceCents === null && row.note === null}
            onClick={() => {
              setPrice("");
              setNote("");
              save.mutate();
            }}
            title="Reset to default price"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!dirty || priceInvalid || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>
        </div>
      </Td>
    </TableRow>
  );
}

// ─── Mobile row ───────────────────────────────────────────────────────────────

function PricingMatrixRowMobile({
  row,
  orgId,
  onAccess,
  accessPending,
}: {
  row: PricingRow;
  orgId: string;
  onAccess: (approved: boolean) => void;
  accessPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(row.customPriceCents !== null ? centsToInputValue(row.customPriceCents) : "");
  const [note, setNote] = useState(row.note ?? "");
  const parsed = price.trim() === "" ? null : parseDollarsToCents(price);
  const priceInvalid = price.trim() !== "" && parsed === null;

  const save = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>("/api/admin/pricing", {
        orgId,
        productId: row.productId,
        priceCents: price.trim() === "" ? null : parsed,
        note: note.trim() === "" ? null : note.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast({ title: price.trim() === "" ? "Custom price removed" : "Customer price saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save price", description: err.message }),
  });

  return (
    <div className="rounded-[14px] border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">{row.name}</p>
          <p className="font-mono text-caption text-muted-foreground">
            {row.sku} · {row.categoryName}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch
            checked={row.approved}
            disabled={accessPending}
            onCheckedChange={(v) => onAccess(Boolean(v))}
            aria-label={`Approve ${row.name} for this customer`}
          />
          <span className="text-caption text-muted-foreground">{row.approved ? "Approved" : "Hidden"}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div>
          <p className="text-micro text-muted-foreground">Default</p>
          <p className="tnum mt-1 text-body-sm">
            {row.defaultPriceCents !== null ? <Money cents={row.defaultPriceCents} /> : <span className="text-muted-foreground">Quote</span>}
          </p>
        </div>
        <div>
          <p className="text-micro text-muted-foreground">Customer price</p>
          <PriceCell
            price={price}
            setPrice={setPrice}
            invalid={priceInvalid}
            placeholder={row.defaultPriceCents === null ? "Quote required" : "0.00"}
            effective={null}
            overridden={false}
            className="mt-1"
          />
        </div>
      </div>
      <div className="mt-2.5">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (volume commitment, agreement…)"
          aria-label={`Pricing note for ${row.name}`}
          className="h-8 text-body-sm"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={row.customPriceCents === null && row.note === null}
          onClick={() => {
            setPrice("");
            setNote("");
            save.mutate();
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset to default
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={priceInvalid || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save className="size-3.5" aria-hidden /> Save
        </Button>
      </div>
    </div>
  );
}

function PriceCell({
  price,
  setPrice,
  invalid,
  placeholder,
  effective,
  overridden,
  changed,
  className,
}: {
  price: string;
  setPrice: (v: string) => void;
  invalid: boolean;
  placeholder: string;
  effective: React.ReactNode;
  overridden: boolean;
  changed?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-body-sm text-muted-foreground"
          aria-hidden
        >
          $
        </span>
        <Input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          className="tnum h-8 pl-6 text-body-sm focus:border-ring focus:ring-2 focus:ring-ring/50"
        />
        {(changed || overridden) && <CellTick />}
      </div>
      {invalid ? (
        <FieldError>Enter a valid amount, e.g. 1.50</FieldError>
      ) : (
        effective && (
          <p
            className={cn(
              "mt-1 text-caption leading-snug text-muted-foreground",
              overridden && "font-medium text-kraft-ink",
            )}
          >
            {effective}
          </p>
        )
      )}
    </div>
  );
}

/** Small kraft triangle in a cell's top-right corner — marks a changed value. */
function CellTick() {
  return (
    <span
      aria-hidden
      className="absolute right-0 top-0 size-1.5 bg-kraft [clip-path:polygon(100%_0,100%_100%,0_0)]"
    />
  );
}
