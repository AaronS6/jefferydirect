"use client";

// "Issue a quote on behalf of a customer" — for enquiries customers send
// by email, phone or in person. The quote lands on their account as
// ISSUED with the pricing entered here, ready for them to accept.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Plus, X } from "lucide-react";
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
import { ORDER_SOURCE_LABELS, QUOTE_ITEM_KIND_LABELS } from "@/lib/constants";
import { centsToInputValue, parseDollarsToCents } from "@/lib/money";
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
  // a string = an admin-entered price in dollars ("0.42", "12.50")
  priceInput: string | null;
};

type ChargeLine = {
  kind: "CHARGE";
  description: string;
  chargeKind: "SETUP" | "FREIGHT" | "OTHER";
  qty: number;
  priceInput: string | null;
};

type Line = ProductLine | ChargeLine;

export function AdminNewQuoteDialog({
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
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [expiryDate, setExpiryDate] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Org-scoped profile: customer price overrides.
  const { data: profile } = useQuery({
    queryKey: ["admin", "customer", orgId],
    queryFn: () => api.get<CustomerProfile>(`/api/admin/customers/${orgId}`),
    enabled: open && orgId !== "",
  });

  function resetForm() {
    setOrgId("");
    setSourceType("EMAIL");
    setTitle("");
    setLines([]);
    setExpiryDate("");
    setTerms("");
    setNotes("");
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

  function unitPrice(productId: string): number | null {
    return priceByProduct.get(productId) ?? null;
  }

  /** The cents quoted on a line: typed price > effective price. */
  function lineCents(line: Line): number | null {
    if (line.priceInput !== null) return parseDollarsToCents(line.priceInput);
    if (line.kind === "PRODUCT") return unitPrice(line.productId);
    return null;
  }

  const totalCents = lines.reduce((sum, line) => {
    const cents = lineCents(line);
    return cents === null ? sum : sum + line.qty * cents;
  }, 0);
  const unpricedCount = lines.filter((l) => lineCents(l) === null).length;

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
      api.post<{ id: string; quoteNumber: string }>("/api/admin/quotations", {
        orgId,
        sourceType,
        title: title.trim(),
        items: lines.map((line) => {
          const cents = lineCents(line);
          const priced = line.kind === "PRODUCT" || line.priceInput !== null ? cents : null;
          const description =
            line.kind === "PRODUCT" ? line.name : line.description.trim();
          const kind = line.kind === "PRODUCT" ? "PRODUCT" : line.chargeKind;
          const payload = { description, kind, qty: line.qty };
          return priced === null ? payload : { ...payload, unitPriceCents: priced };
        }),
        expiryDate: expiryDate || undefined,
        terms: terms.trim() || undefined,
        notes: notes.trim() || undefined,
        notifyCustomer,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "quotes"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (orgId) queryClient.invalidateQueries({ queryKey: ["admin", "customer", orgId] });
      toast({
        title: `${res.quoteNumber} issued`,
      });
      onOpenChange(false);
      navigate("admin-quote-detail", { id: res.id });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!orgId) {
      setSubmitError("Choose the customer for this quote.");
      return;
    }
    if (!title.trim()) {
      setSubmitError("Give the quote a title (what it covers).");
      return;
    }
    if (lines.length === 0) {
      setSubmitError("Add at least one product or charge line.");
      return;
    }
    if (lines.some((l) => l.kind === "CHARGE" && !l.description.trim())) {
      setSubmitError("Give every charge line a description (what it is for).");
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
      setSubmitError(`${unpricedProduct.name} has no published price. Enter the unit price to quote.`);
      return;
    }
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto sm:max-w-[720px]">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>Issue quote</DialogTitle>
          </DialogHeader>

          {/* Customer + provenance + title */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q-org" className="text-body-sm">
                Customer
              </Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger id="q-org" className="h-9 w-full text-body-sm" aria-label="Customer">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-source" className="text-body-sm">
                How was this enquiry received?
              </Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger id="q-source" className="h-9 w-full text-body-sm" aria-label="Enquiry source">
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="q-title" className="text-body-sm">
                Quote title
              </Label>
              <Input
                id="q-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Custom-printed pizza boxes, autumn refresh"
                className="h-9 text-body-sm"
                maxLength={160}
              />
              {orgId && profile && (
                <p className="tnum text-caption text-muted-foreground">
                  {profile.prices.filter((p) => p.priceCents !== null).length} custom prices applied
                </p>
              )}
            </div>
          </div>

          {/* Items builder */}
          <div className="space-y-2.5">
            <GroupLabel>Quoted items</GroupLabel>
            <p className="-mt-1.5 text-caption text-muted-foreground">
              Prices pre-fill from the customer&apos;s negotiated pricing. Edit any unit price to quote what you agreed.
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
                              placeholder={unitPrice(line.productId) === null ? "Quote" : "0.00"}
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
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Input
                            value={line.description}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((l, idx) => (idx === i && l.kind === "CHARGE" ? { ...l, description: e.target.value } : l)),
                              )
                            }
                            placeholder="Charge, e.g. Plate &amp; die charge"
                            className="h-8 text-body-sm"
                            aria-label="Charge description"
                            maxLength={200}
                          />
                          <Select
                            value={line.chargeKind}
                            onValueChange={(v) =>
                              setLines((ls) =>
                                ls.map((l, idx) =>
                                  idx === i && l.kind === "CHARGE" ? { ...l, chargeKind: v as ChargeLine["chargeKind"] } : l,
                                ),
                              )
                            }
                          >
                            <SelectTrigger
                              className="h-8 w-full text-body-sm"
                              aria-label={`Kind for charge line ${i + 1}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(["SETUP", "FREIGHT", "OTHER"] as const).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {QUOTE_ITEM_KIND_LABELS[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <QtyStepper
                          value={line.qty}
                          onChange={(q) =>
                            setLines((ls) => ls.map((l, idx) => (idx === i && l.kind === "CHARGE" ? { ...l, qty: q } : l)))
                          }
                          min={1}
                          size="sm"
                          ariaLabel="Quantity for charge line"
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
                                  ls.map((l, idx) => (idx === i && l.kind === "CHARGE" ? { ...l, priceInput: e.target.value } : l)),
                                )
                              }
                              placeholder="TBC"
                              className="h-8 w-[104px] pl-5 pr-2.5 text-right font-mono text-body-sm tnum focus:border-ring focus:ring-2 focus:ring-ring/50"
                              inputMode="decimal"
                              aria-label={`Unit price for ${line.description || "charge line"}`}
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
                          aria-label="Remove charge line"
                          onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                        >
                          <X className="size-3.5" aria-hidden />
                        </Button>
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
              onClick={() => setLines((ls) => [...ls, { kind: "CHARGE", description: "", chargeKind: "SETUP", qty: 1, priceInput: null }])}
            >
              <Plus className="size-3.5" aria-hidden />
              Add charge line
            </Button>

            {lines.length > 0 && (
              <div className="flex flex-col items-end gap-0.5 rounded-md border bg-secondary/50 px-3.5 py-2.5 text-body-sm">
                <div className="flex w-full items-baseline justify-between border-t pt-1">
                  <span className="font-medium">Quote total</span>
                  <Money cents={totalCents} className="font-semibold" />
                </div>
                {unpricedCount > 0 && (
                  <p className="mt-0.5 self-end text-caption text-muted-foreground">
                    {unpricedCount} line{unpricedCount === 1 ? "" : "s"} not yet priced, excluded from the total.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Validity & terms */}
          <div className="space-y-2.5">
            <GroupLabel>Validity &amp; notes</GroupLabel>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="q-expiry" className="text-body-sm">
                  Valid until <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="q-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="h-9 text-body-sm"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="q-terms" className="text-body-sm">
                  Terms <span className="text-muted-foreground">(shown on the quote document)</span>
                </Label>
                <Textarea
                  id="q-terms"
                  rows={3}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Payment terms, lead time, delivery conditions…"
                  className="leading-relaxed"
                  maxLength={4000}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="q-notes" className="text-body-sm">
                  Notes to the customer <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="q-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything from the email thread the customer should see on the quote."
                  className="leading-relaxed"
                  maxLength={2000}
                />
              </div>
            </div>
          </div>

          {/* Notify */}
          <div className="flex items-start justify-between gap-3 rounded-md border bg-secondary/50 px-3.5 py-3">
            <div className="min-w-0">
              <Label htmlFor="q-notify" className="text-body-sm font-medium">
                Notify the customer
              </Label>
              <p className="mt-0.5 text-caption leading-snug text-muted-foreground">
                A notification lands in their portal.
              </p>
            </div>
            <Switch
              id="q-notify"
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
              <FileCheck2 className={create.isPending ? "size-4 animate-pulse" : "size-4"} aria-hidden />
              {create.isPending ? "Issuing…" : "Issue quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
