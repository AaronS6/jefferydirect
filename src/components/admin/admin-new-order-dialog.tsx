"use client";

// "Record an order received outside ClientHub" — for orders customers place
// by email, phone or in person. Recorded orders appear in the customer's own
// history and (optionally) notify their organization.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QtyStepper } from "@/components/portal/portal-bits";
import { Money } from "@/components/shared/money";
import { api } from "@/lib/api-client";
import { DEFAULT_TAX_RATE_BP, ORDER_SOURCE_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { centsToInputValue, parseDollarsToCents, taxFromSubtotalCents } from "@/lib/money";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { AdminProduct, CustomerListItem, CustomerProfile } from "@/types";
import { FieldError, GroupLabel } from "./admin-ui";

const NONE = "__none__";
const SOURCES = ["EMAIL", "PHONE", "IN_PERSON"] as const;

type ProductLine = {
  kind: "PRODUCT";
  productId: string;
  sku: string;
  name: string;
  qty: number;
  // null = follow the customer's live effective price (shown pre-filled);
  // a string = an admin-entered agreed price in dollars ("0.42", "12.50")
  priceInput: string | null;
};

type CustomLine = {
  kind: "CUSTOM";
  name: string;
  description: string;
  qty: number;
  priceInput: string | null;
};

type Line = ProductLine | CustomLine;

export function AdminNewOrderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ["admin", "customers", ""],
    queryFn: () => api.get<CustomerListItem[]>("/api/admin/customers?search="),
    enabled: open,
  });

  const { data: products } = useQuery({
    queryKey: ["admin", "products", { search: "", category: "" }],
    queryFn: () => api.get<AdminProduct[]>("/api/admin/products"),
    enabled: open,
  });

  const [orgId, setOrgId] = useState("");
  const [sourceType, setSourceType] = useState<string>("EMAIL");
  const [status, setStatus] = useState<string>("CONFIRMED");
  const [lines, setLines] = useState<Line[]>([]);
  const [addressId, setAddressId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [estimatedDispatch, setEstimatedDispatch] = useState("");
  const [tracking, setTracking] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Org-scoped profile: approved addresses + customer price overrides.
  const { data: profile } = useQuery({
    queryKey: ["admin", "customer", orgId],
    queryFn: () => api.get<CustomerProfile>(`/api/admin/customers/${orgId}`),
    enabled: open && orgId !== "",
  });

  function resetForm() {
    setOrgId("");
    setSourceType("EMAIL");
    setStatus("CONFIRMED");
    setLines([]);
    setAddressId("");
    setPoNumber("");
    setNotes("");
    setRequestedDeliveryDate("");
    setEstimatedDelivery("");
    setEstimatedDispatch("");
    setTracking("");
    setNotifyCustomer(true);
    setSubmitError(null);
  }

  function handleOpenChange(v: boolean) {
    if (v) resetForm();
    onOpenChange(v);
  }

  const activeProducts = (products ?? []).filter((p) => p.isActive);
  const priceByProduct = new Map<string, number | null>();
  for (const price of profile?.prices ?? []) {
    priceByProduct.set(price.productId, price.priceCents);
  }
  for (const p of activeProducts) {
    if (!priceByProduct.has(p.id)) priceByProduct.set(p.id, p.defaultPriceCents);
  }

  const productsByCategory = new Map<string, AdminProduct[]>();
  for (const p of activeProducts) {
    const list = productsByCategory.get(p.categoryName) ?? [];
    list.push(p);
    productsByCategory.set(p.categoryName, list);
  }

  const approvedAddresses = (profile?.addresses ?? []).filter((a) => a.approvalStatus === "APPROVED");

  function unitPrice(productId: string): number | null {
    return priceByProduct.get(productId) ?? null;
  }

  /** The cents actually charged on a line: typed price > effective price. */
  function lineCents(line: Line): number | null {
    if (line.priceInput !== null) return parseDollarsToCents(line.priceInput);
    if (line.kind === "PRODUCT") return unitPrice(line.productId);
    return null;
  }

  const subtotalCents = lines.reduce((sum, line) => {
    const cents = lineCents(line);
    return cents === null ? sum : sum + line.qty * cents;
  }, 0);
  const unpricedCount = lines.filter((l) => lineCents(l) === null).length;
  const taxCents = taxFromSubtotalCents(subtotalCents, DEFAULT_TAX_RATE_BP);

  function addProduct(productId: string) {
    const product = activeProducts.find((p) => p.id === productId);
    if (!product) return;
    setLines((ls) => {
      const existing = ls.findIndex((l) => l.kind === "PRODUCT" && l.productId === productId);
      if (existing >= 0) {
        return ls.map((l, i) => (i === existing && l.kind === "PRODUCT" ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...ls, { kind: "PRODUCT", productId, sku: product.sku, name: product.name, qty: 1, priceInput: null }];
    });
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string; orderNumber: string }>("/api/admin/orders", {
        orgId,
        items: lines.map((line) => {
          const cents = lineCents(line);
          const priced = line.kind === "PRODUCT" || line.priceInput !== null ? cents : null;
          const payload =
            line.kind === "PRODUCT"
              ? { productId: line.productId, qty: line.qty }
              : {
                  custom: true,
                  name: line.name.trim(),
                  description: line.description.trim() || undefined,
                  qty: line.qty,
                };
          return priced === null ? payload : { ...payload, unitPriceCents: priced };
        }),
        addressId: addressId || undefined,
        poNumber: poNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        estimatedDelivery: estimatedDelivery || undefined,
        estimatedDispatch: estimatedDispatch || undefined,
        sourceType,
        status,
        trackingNumber: tracking.trim() || undefined,
        notifyCustomer,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "attention"] });
      if (orgId) queryClient.invalidateQueries({ queryKey: ["admin", "customer", orgId] });
      toast({
        title: `${res.orderNumber} recorded`,
      });
      onOpenChange(false);
      navigate("admin-order-detail", { id: res.id });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!orgId) {
      setSubmitError("Choose the customer for this order.");
      return;
    }
    if (lines.length === 0) {
      setSubmitError("Add at least one product or custom line.");
      return;
    }
    if (lines.some((l) => l.kind === "CUSTOM" && !l.name.trim())) {
      setSubmitError("Give every custom line a name (what was ordered).");
      return;
    }
    if (lines.some((l) => l.qty < 1)) {
      setSubmitError("Every line needs a quantity of at least 1.");
      return;
    }
    if (lines.some((l) => l.priceInput !== null && l.priceInput.trim() !== "" && parseDollarsToCents(l.priceInput) === null)) {
      setSubmitError("Enter unit prices as dollar amounts, for example 0.42 or 12.50.");
      return;
    }
    const unpricedProduct = lines.find((l) => l.kind === "PRODUCT" && lineCents(l) === null);
    if (unpricedProduct && unpricedProduct.kind === "PRODUCT") {
      setSubmitError(`${unpricedProduct.name} has no published price. Enter the agreed unit price.`);
      return;
    }
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto sm:max-w-[720px]">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>Record order</DialogTitle>
          </DialogHeader>

          {/* Customer + provenance + status */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rec-org" className="text-body-sm">
                Customer
              </Label>
              <Select
                value={orgId}
                onValueChange={(v) => {
                  setOrgId(v);
                  setAddressId("");
                }}
              >
                <SelectTrigger id="rec-org" className="h-9 w-full text-body-sm" aria-label="Customer">
                  <SelectValue placeholder="Choose a customer…" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      <span className="ml-1.5 font-mono text-caption text-muted-foreground">{c.code}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orgId && profile && (
                <p className="tnum text-caption text-muted-foreground">
                  {approvedAddresses.length} approved shipping {approvedAddresses.length === 1 ? "address" : "addresses"} ·{" "}
                  {profile.prices.filter((p) => p.priceCents !== null).length} custom prices applied
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-source" className="text-body-sm">
                How was this order received?
              </Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger id="rec-source" className="h-9 w-full text-body-sm" aria-label="Order source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-status" className="text-body-sm">
                Initial status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="rec-status" className="h-9 w-full text-body-sm" aria-label="Initial order status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-micro">
                      Fulfilment workflow
                    </SelectLabel>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ORDER_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-micro text-[var(--status-danger-fg)]">
                      Terminal, notifies customer
                    </SelectLabel>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items builder */}
          <div className="space-y-2.5">
            <GroupLabel>Items</GroupLabel>
            <p className="-mt-1.5 text-caption text-muted-foreground">
              Prices pre-fill from the customer's negotiated pricing. Edit any unit price to record what you agreed.
            </p>
            <Select value={NONE} onValueChange={(v) => v !== NONE && addProduct(v)}>
              <SelectTrigger className="h-9 w-full text-body-sm" aria-label="Add a product">
                <SelectValue placeholder="Add a product…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Add a product…</SelectItem>
                {Array.from(productsByCategory.entries()).map(([category, list]) => (
                  <SelectGroup key={category}>
                    <SelectLabel className="text-micro">{category}</SelectLabel>
                    {list.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="ml-1.5 font-mono text-caption text-muted-foreground">{p.sku}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed bg-surface-sunken/60 px-4 py-5 text-center text-body-sm text-muted-foreground">
                No lines yet.
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-md border">
                {lines.map((line, i) => (
                  <li key={i} className="px-3.5 py-3">
                    {line.kind === "PRODUCT" ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-medium">{line.name}</p>
                          <p className="font-mono text-caption text-muted-foreground">{line.sku}</p>
                        </div>
                        <QtyStepper
                          value={line.qty}
                          onChange={(q) =>
                            setLines((ls) => ls.map((l, idx) => (idx === i && l.kind === "PRODUCT" ? { ...l, qty: q } : l)))
                          }
                          min={1}
                          size="sm"
                          ariaLabel={`Quantity for ${line.name}`}
                        />
                        <div className="flex w-[104px] flex-col items-end gap-0.5">
                          <div className="relative">
                            <span
                              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-caption text-muted-foreground"
                              aria-hidden
                            >
                              $
                            </span>
                            <Input
                              value={
                                line.priceInput !== null
                                  ? line.priceInput
                                  : unitPrice(line.productId) !== null
                                    ? centsToInputValue(unitPrice(line.productId) as number)
                                    : ""
                              }
                              onChange={(e) =>
                                setLines((ls) =>
                                  ls.map((l, idx) => (idx === i && l.kind === "PRODUCT" ? { ...l, priceInput: e.target.value } : l)),
                                )
                              }
                              placeholder={unitPrice(line.productId) === null ? "Agreed" : "0.00"}
                              className="h-8 w-[104px] pl-5 pr-2.5 text-right font-mono text-body-sm tnum focus:border-ring focus:ring-2 focus:ring-ring/50"
                              inputMode="decimal"
                              aria-label={`Unit price for ${line.name}`}
                              maxLength={12}
                            />
                          </div>
                          <p className="tnum text-body-sm font-medium">
                            {lineCents(line) === null ? (
                              <span className="text-caption font-normal text-muted-foreground">Total TBC</span>
                            ) : (
                              <Money cents={line.qty * (lineCents(line) as number)} />
                            )}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                        >
                          <X className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="min-w-0 flex-1 space-y-2">
                            <Input
                              value={line.name}
                              onChange={(e) =>
                                setLines((ls) =>
                                  ls.map((l, idx) => (idx === i && l.kind === "CUSTOM" ? { ...l, name: e.target.value } : l)),
                                )
                              }
                              placeholder="Custom line, e.g. Printed sleeve prototype"
                              className="h-8 text-body-sm"
                              aria-label="Custom line name"
                              maxLength={160}
                            />
                            <Input
                              value={line.description}
                              onChange={(e) =>
                                setLines((ls) =>
                                  ls.map((l, idx) =>
                                    idx === i && l.kind === "CUSTOM" ? { ...l, description: e.target.value } : l,
                                  ),
                                )
                              }
                              placeholder="Details / specification (optional)"
                              className="h-8 text-body-sm"
                              aria-label="Custom line description"
                              maxLength={400}
                            />
                          </div>
                          <QtyStepper
                            value={line.qty}
                            onChange={(q) =>
                              setLines((ls) => ls.map((l, idx) => (idx === i && l.kind === "CUSTOM" ? { ...l, qty: q } : l)))
                            }
                            min={1}
                            size="sm"
                            ariaLabel="Quantity for custom line"
                          />
                          <div className="flex w-[104px] flex-col items-end gap-0.5">
                            <div className="relative">
                              <span
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-caption text-muted-foreground"
                                aria-hidden
                              >
                                $
                              </span>
                              <Input
                                value={line.priceInput ?? ""}
                                onChange={(e) =>
                                  setLines((ls) =>
                                    ls.map((l, idx) => (idx === i && l.kind === "CUSTOM" ? { ...l, priceInput: e.target.value } : l)),
                                  )
                                }
                                placeholder="TBC"
                                className="h-8 w-[104px] pl-5 pr-2.5 text-right font-mono text-body-sm tnum focus:border-ring focus:ring-2 focus:ring-ring/50"
                                inputMode="decimal"
                                aria-label={`Unit price for ${line.name || "custom line"}`}
                                maxLength={12}
                              />
                            </div>
                            <p className="tnum text-body-sm font-medium">
                              {lineCents(line) === null ? (
                                <span className="text-caption font-normal text-muted-foreground">Pricing TBC</span>
                              ) : (
                                <Money cents={line.qty * (lineCents(line) as number)} />
                              )}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            aria-label="Remove custom line"
                            onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                          >
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLines((ls) => [...ls, { kind: "CUSTOM", name: "", description: "", qty: 1, priceInput: null }])}
            >
              <Plus className="size-3.5" aria-hidden />
              Add custom line
            </Button>

            {lines.length > 0 && (
              <div className="flex flex-col items-end gap-0.5 rounded-md border bg-secondary/50 px-3.5 py-2.5 text-body-sm">
                <div className="flex w-full items-baseline justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <Money cents={subtotalCents} className="font-medium" />
                </div>
                <div className="flex w-full items-baseline justify-between">
                  <span className="text-muted-foreground">
                    GST ({(DEFAULT_TAX_RATE_BP / 100).toFixed(1)}%, estimated)
                  </span>
                  <Money cents={taxCents} />
                </div>
                <div className="flex w-full items-baseline justify-between border-t pt-1">
                  <span className="font-medium">Estimated total</span>
                  <Money cents={subtotalCents + taxCents} className="font-semibold" />
                </div>
                {unpricedCount > 0 && (
                  <p className="mt-0.5 self-end text-caption text-muted-foreground">
                    {unpricedCount} line{unpricedCount === 1 ? "" : "s"} not yet priced, excluded from the estimate.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Delivery */}
          <div className="space-y-2.5">
            <GroupLabel>Delivery &amp; reference</GroupLabel>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rec-address" className="text-body-sm">
                  Ship to
                </Label>
                <Select value={addressId} onValueChange={setAddressId} disabled={orgId === ""}>
                  <SelectTrigger id="rec-address" className="h-9 w-full text-body-sm" aria-label="Shipping address">
                    <SelectValue placeholder={orgId === "" ? "Choose a customer first…" : "Choose an approved address…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedAddresses.length === 0 ? (
                      <SelectItem value={NONE} disabled>
                        No approved addresses yet
                      </SelectItem>
                    ) : (
                      approvedAddresses.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label} · {a.city}, {a.province}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {orgId !== "" && approvedAddresses.length === 0 && (
                  <p className="text-caption text-muted-foreground">
                    Approve one from the customer profile, or leave unset.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-po" className="text-body-sm">
                  PO number <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="rec-po"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Customer PO reference"
                  className="h-9 text-body-sm"
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-tracking" className="text-body-sm">
                  Tracking <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="rec-tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="If already dispatched"
                  className="h-9 font-mono text-body-sm"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-requested" className="text-body-sm">
                  Requested delivery
                </Label>
                <Input
                  id="rec-requested"
                  type="date"
                  value={requestedDeliveryDate}
                  onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                  className="h-9 text-body-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-est-delivery" className="text-body-sm">
                  Estimated delivery
                </Label>
                <Input
                  id="rec-est-delivery"
                  type="date"
                  value={estimatedDelivery}
                  onChange={(e) => setEstimatedDelivery(e.target.value)}
                  className="h-9 text-body-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-est-dispatch" className="text-body-sm">
                  Estimated dispatch
                </Label>
                <Input
                  id="rec-est-dispatch"
                  type="date"
                  value={estimatedDispatch}
                  onChange={(e) => setEstimatedDispatch(e.target.value)}
                  className="h-9 text-body-sm"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rec-notes" className="text-body-sm">
                  Notes <span className="text-muted-foreground">(shared with the customer)</span>
                </Label>
                <Textarea
                  id="rec-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instructions from the email or call, delivery windows, contacts on site…"
                  className="leading-relaxed"
                  maxLength={1000}
                />
              </div>
            </div>
          </div>

          {/* Notify */}
          <div className="flex items-start justify-between gap-3 rounded-md border bg-secondary/50 px-3.5 py-3">
            <div className="min-w-0">
              <Label htmlFor="rec-notify" className="text-body-sm font-medium">
                Notify the customer
              </Label>
              <p className="mt-0.5 text-caption leading-snug text-muted-foreground">
                A notification lands in their portal.
              </p>
            </div>
            <Switch
              id="rec-notify"
              checked={notifyCustomer}
              onCheckedChange={setNotifyCustomer}
              aria-label="Notify the customer"
            />
          </div>

          {submitError && <FieldError>{submitError}</FieldError>}

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={create.isPending}>
              {create.isPending ? (
                <ClipboardCheck className="size-4 animate-pulse" aria-hidden />
              ) : (
                <ClipboardCheck className="size-4" aria-hidden />
              )}
              {create.isPending ? "Recording…" : "Record order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
