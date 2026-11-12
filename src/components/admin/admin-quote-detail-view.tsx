"use client";

// Administration — quotation detail & builder. Zone A shows the customer's
// original request; zone B builds item lines and issues (or re-issues) the
// quotation. internalNote is stored on the quotation and submitted with issue.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Loader2,
  PackagePlus,
  Plus,
  Printer,
  RefreshCcw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money, MoneyWithCode } from "@/components/shared/money";
import { QuoteDocument } from "@/components/shared/quote-document";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/date";
import { QUOTE_ITEM_KINDS, QUOTE_ITEM_KIND_LABELS } from "@/lib/constants";
import { centsToInputValue, parseDollarsToCents } from "@/lib/money";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { CategoryDto, QuotationDetail } from "@/types";
import { DefRow, GroupLabel, InlineError, RowsSkeleton, SectionCard, Td, Th, ViewEnter, dashed } from "./admin-ui";
import { ProductFormDialog, type ProductFormPrefill } from "./product-form-dialog";
import { cn } from "@/lib/utils";

// Kraft-tinted tag — marks quotes that request a product we do not carry.
function NewProductTag() {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center rounded-full border border-kraft/40 bg-kraft-soft px-2 text-caption font-medium text-kraft-ink">
      New product
    </span>
  );
}

/** First description line of a NEW_PRODUCT specs blob (skips the Food contact / Yearly volume lines). */
function firstSpecLine(specs: string | null): string {
  if (!specs) return "";
  for (const raw of specs.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^Food contact:/i.test(line) || /^Yearly volume:/i.test(line)) continue;
    return line;
  }
  return "";
}

// ─── Builder draft state ─────────────────────────────────────────────────────

type DraftRow = { uid: string; description: string; kind: string; qty: string; price: string };

let uidCounter = 0;
const newUid = () => `row-${++uidCounter}`;

function rowsFromQuote(quote: QuotationDetail): DraftRow[] {
  if (quote.items.length === 0) return [emptyRow()];
  return quote.items.map((i) => ({
    uid: newUid(),
    description: i.description,
    kind: i.kind,
    qty: String(i.qty),
    price: centsToInputValue(i.unitPriceCents),
  }));
}

function emptyRow(): DraftRow {
  return { uid: newUid(), description: "", kind: "PRODUCT", qty: "", price: "" };
}

function rowCents(row: DraftRow): number | null {
  const cents = parseDollarsToCents(row.price.trim());
  const qty = Number.parseInt(row.qty, 10);
  if (cents === null || !Number.isFinite(qty) || qty <= 0) return null;
  return cents * qty;
}

function rowIssues(row: DraftRow): { description: boolean; qty: boolean; price: boolean } {
  const cents = parseDollarsToCents(row.price.trim());
  const qty = Number.parseInt(row.qty, 10);
  return {
    description: row.description.trim() === "",
    qty: !Number.isFinite(qty) || qty <= 0,
    price: cents === null,
  };
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function AdminQuoteDetailView({ quotationId }: { quotationId: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  const { data: quote, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "quote", quotationId],
    queryFn: () => api.get<QuotationDetail>(`/api/admin/quotations/${quotationId}`),
  });

  // Category list — resolves the quote's `category` label to an id for the
  // "Add to catalogue" prefill (same key the product form uses, so it dedupes).
  const { data: settings } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.get<{ categories: CategoryDto[] }>("/api/admin/settings"),
  });

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const [expiry, setExpiry] = useState("");
  const [terms, setTerms] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const initialised = useRef(false);

  // Open the builder by default while the request awaits pricing; prefill from
  // the quotation once data arrives.
  useEffect(() => {
    if (!quote) return;
    if (!initialised.current) {
      initialised.current = true;
      setRows(rowsFromQuote(quote));
      setTerms(quote.terms ?? "");
      setInternalNote(quote.internalNote ?? "");
      setExpiry(quote.expiryDate ? quote.expiryDate.slice(0, 10) : "");
      if (quote.status === "REQUESTED" || quote.status === "UNDER_REVIEW") setBuilderOpen(true);
    }
  }, [quote]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "quote", quotationId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "quotes"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const acknowledge = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>(`/api/admin/quotations/${quotationId}/acknowledge`, { status: "UNDER_REVIEW" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Request acknowledged" });
    },
    onError: (err: Error) => toast({ title: "Could not acknowledge", description: err.message }),
  });

  const issue = useMutation({
    mutationFn: () => {
      const items = rows.map((r) => ({
        description: r.description.trim(),
        kind: r.kind,
        qty: Number.parseInt(r.qty, 10),
        unitPriceCents: parseDollarsToCents(r.price.trim()) ?? 0,
      }));
      return api.post<{ ok: boolean }>(`/api/admin/quotations/${quotationId}/issue`, {
        items,
        expiryDate: expiry || null,
        terms: terms.trim() || null,
        internalNote: internalNote.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      setBuilderOpen(false);
      initialised.current = false; // re-prefill from refreshed data if reopened
      toast({ title: "Quote issued" });
    },
    onError: (err: Error) => toast({ title: "Could not issue quote", description: err.message }),
  });

  if (isError) {
    return (
      <div>
        <PageHeader title="Quote" onBack={back} />
        <InlineError message={error instanceof Error ? error.message : "Could not load."} />
      </div>
    );
  }

  if (isLoading || !quote) {
    return (
      <div>
        <PageHeader title="Quote" onBack={back} />
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_360px]">
          <SectionCard>
            <RowsSkeleton rows={5} />
          </SectionCard>
          <SectionCard>
            <RowsSkeleton rows={4} />
          </SectionCard>
        </div>
      </div>
    );
  }

  const preIssue = quote.status === "REQUESTED" || quote.status === "UNDER_REVIEW";
  const reissuable = quote.status === "ISSUED" || quote.status === "REVISED" || quote.status === "EXPIRED";
  const responded = quote.status === "ACCEPTED" || quote.status === "REJECTED";
  const hasItems = quote.items.length > 0;
  const isNewProduct = quote.kind === "NEW_PRODUCT";

  // Prefill for "Add to catalogue" — everything stays editable before saving.
  const productPrefill: ProductFormPrefill = {
    name: quote.productName ?? quote.title,
    categoryId: (settings?.categories ?? []).find((c) => c.name === quote.category)?.id ?? "",
    shortDescription: firstSpecLine(quote.specs),
    description: quote.specs ?? "",
    material: quote.material ?? "",
    dimensions: quote.dimensions ?? "",
  };

  // After the product is saved: grant the requesting customer access, then
  // notify them. A failure here keeps the product (creation already succeeded).
  const grantAccessAndNotify = async (productId: string) => {
    try {
      await api.post<{ ok: boolean }>("/api/admin/products/access", {
        orgId: quote.orgId,
        productId,
        approved: true,
      });
      await api.post<{ ok: boolean }>("/api/admin/notifications", {
        orgId: quote.orgId,
        title: "Your requested product is now available",
        body: `${productPrefill.name} is now in your catalogue.`,
        kind: "QUOTATION",
      });
      toast({ title: "Added to catalogue" });
      toast({ title: "Customer notified" });
    } catch (err) {
      toast({
        title: "Could not finish",
        description:
          err instanceof Error
            ? err.message
            : "The product is saved. Grant access and notify the customer manually.",
      });
    }
  };

  function openBuilderPrefilled(q: QuotationDetail) {
    setRows(rowsFromQuote(q));
    setTerms(q.terms ?? "");
    setInternalNote(q.internalNote ?? "");
    setExpiry(q.expiryDate ? q.expiryDate.slice(0, 10) : "");
    setBuilderOpen(true);
  }

  const rowsValid = rows.length > 0 && rows.every((r) => {
    const i = rowIssues(r);
    return !i.description && !i.qty && !i.price;
  });
  const invalidRows = rows.length - rows.filter((r) => {
    const i = rowIssues(r);
    return !i.description && !i.qty && !i.price;
  }).length;
  const subtotalCents = rows.reduce((sum, r) => sum + (rowCents(r) ?? 0), 0);

  return (
    <div>
      <PageHeader
        title={quote.title}
        onBack={back}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {quote.revision > 0 && (
              <span className="rounded-full border bg-secondary px-2 py-0.5 text-caption font-medium text-muted-foreground">
                Revision {quote.revision}
              </span>
            )}
            {isNewProduct && <NewProductTag />}
            {isNewProduct && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setProductFormOpen(true)}
              >
                <PackagePlus className="size-3.5" aria-hidden />
                Add to catalogue
              </Button>
            )}
            {preIssue && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={quote.status !== "REQUESTED" || acknowledge.isPending}
                onClick={() => acknowledge.mutate()}
              >
                {acknowledge.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                Acknowledge
              </Button>
            )}
            <StatusBadge status={quote.status} kind="quote" />
          </div>
        }
      />

      <ViewEnter>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Zone A + issued quote + builder */}
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <SectionCard title="Customer's request">
            <dl>
              <DefRow label="Category" value={dashed(quote.category)} />
              <DefRow label="Product" value={dashed(quote.productName)} />
              <DefRow label="Dimensions" value={dashed(quote.dimensions)} />
              <DefRow label="Material" value={dashed(quote.material)} />
              <DefRow label="Colour" value={dashed(quote.colour)} />
              <DefRow label="Printing" value={dashed(quote.printing)} />
              <DefRow label="Quantity" value={dashed(quote.quantity)} />
              <DefRow label="Needed by" value={dashed(quote.neededBy)} />
              <DefRow label="Destination" value={dashed(quote.destination)} />
              <DefRow label="Specifications" value={dashed(quote.specs)} />
              <DefRow label="Comments" value={dashed(quote.comments)} />
            </dl>
          </SectionCard>

          {/* Response zone */}
          {responded && (
            <div
              className={cn(
                "flex items-start gap-3 rounded-[14px] border border-transparent p-4 sm:p-5",
                quote.status === "ACCEPTED"
                  ? "bg-[var(--status-done-bg)]"
                  : "bg-[var(--status-danger-bg)]",
              )}
            >
              {quote.status === "ACCEPTED" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--status-done-fg)]" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-[var(--status-danger-fg)]" aria-hidden />
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-body font-medium",
                    quote.status === "ACCEPTED" ? "text-[var(--status-done-fg)]" : "text-[var(--status-danger-fg)]",
                  )}
                >
                  Customer {quote.status === "ACCEPTED" ? "accepted" : "declined"} this quote
                  {quote.respondedAt ? ` · ${formatDateTime(quote.respondedAt)}` : ""}
                </p>
                {quote.respondedNote && (
                  <p className="mt-1 text-body-sm leading-relaxed text-foreground/80">{quote.respondedNote}</p>
                )}
              </div>
            </div>
          )}

          {quote.status === "EXPIRED" && hasItems && (
            <div className="flex items-start gap-3 rounded-[14px] border bg-secondary/50 p-4 text-body-sm leading-relaxed text-muted-foreground">
              <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                This quote expired{quote.expiryDate ? ` on ${formatDate(quote.expiryDate)}` : ""} without a customer
                response. Re-issue to send fresh pricing.
              </p>
            </div>
          )}

          {/* Issued quotation view */}
          {hasItems && (reissuable || responded || quote.status === "EXPIRED") && (
            <SectionCard
              title={quote.status === "REVISED" ? `Issued quote, revision ${quote.revision}` : "Issued quote"}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPreviewOpen(true)}>
                    <Eye className="size-3.5" aria-hidden /> Preview document
                  </Button>
                  {reissuable && (
                    <Button
                      variant={preIssue ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setBuilderOpen(false);
                        openBuilderPrefilled(quote);
                      }}
                    >
                      <RefreshCcw className="size-3.5" aria-hidden /> Re-issue (revision)
                    </Button>
                  )}
                </div>
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <Th>Description</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit</Th>
                    <Th className="text-right">Amount</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.items.map((item) => (
                    <TableRow key={item.id}>
                      <Td className="max-w-[320px] whitespace-normal">{item.description}</Td>
                      <Td>
                        <span className="inline-flex items-center rounded-full border bg-card px-2 py-0.5 text-caption text-muted-foreground">
                          {QUOTE_ITEM_KIND_LABELS[item.kind] ?? item.kind}
                        </span>
                      </Td>
                      <Td className="tnum text-right">{item.qty.toLocaleString()}</Td>
                      <Td className="text-right">
                        <Money cents={item.unitPriceCents} />
                      </Td>
                      <Td className="text-right font-medium">
                        <Money cents={item.lineTotalCents} />
                      </Td>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <Td className="text-right font-medium">Quoted total</Td>
                    <Td />
                    <Td />
                    <Td />
                    <Td className="text-right font-semibold">
                      <MoneyWithCode cents={quote.itemsTotalCents} />
                    </Td>
                  </TableRow>
                </TableFooter>
              </Table>

              {quote.terms && (
                <div className="mt-4 border-t pt-4">
                  <GroupLabel className="mb-1.5">Terms &amp; conditions</GroupLabel>
                  <p className="text-body-sm leading-relaxed text-muted-foreground">{quote.terms}</p>
                </div>
              )}
              {quote.internalNote && (
                <div className="mt-3 rounded-md border border-l-2 border-l-kraft bg-surface-sunken px-3.5 py-3">
                  <GroupLabel className="mb-1.5">Internal note, not shown to the customer</GroupLabel>
                  <p className="text-body-sm leading-relaxed text-muted-foreground">{quote.internalNote}</p>
                </div>
              )}
            </SectionCard>
          )}

          {/* Zone B — the builder */}
          {builderOpen ? (
            <SectionCard
              title={hasItems ? "Build revision" : "Build quote"}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => setBuilderOpen(false)}
                  disabled={preIssue}
                  title={preIssue ? "Pricing this request requires the builder" : "Close without issuing"}
                >
                  Close builder
                </Button>
              }
            >
              <div className="space-y-4">
                {/* Item lines */}
                <div>
                  <GroupLabel className="mb-2">Quote lines</GroupLabel>
                  <div className="space-y-2.5">
                    {rows.map((row, index) => {
                      const issues = rowIssues(row);
                      const total = rowCents(row);
                      return (
                        <div key={row.uid} className="rounded-md border bg-card p-3">
                          <div className="grid gap-2.5 sm:grid-cols-[1fr_150px_90px_110px_auto] sm:items-end">
                            <div className="min-w-0">
                              <Label htmlFor={`desc-${row.uid}`} className="text-caption text-muted-foreground">
                                Description {index + 1}
                              </Label>
                              <Input
                                id={`desc-${row.uid}`}
                                value={row.description}
                                onChange={(e) => updateRow(row.uid, { description: e.target.value })}
                                placeholder="e.g. Custom printed 12&rdquo; pizza box, 2-colour flexo"
                                aria-invalid={issues.description || undefined}
                                className="mt-1 h-9 text-body-sm"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`kind-${row.uid}`} className="text-caption text-muted-foreground">
                                Type
                              </Label>
                              <Select value={row.kind} onValueChange={(v) => updateRow(row.uid, { kind: v })}>
                                <SelectTrigger id={`kind-${row.uid}`} className="mt-1 h-9 text-body-sm" aria-label="Line type">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {QUOTE_ITEM_KINDS.map((k) => (
                                    <SelectItem key={k} value={k}>
                                      {QUOTE_ITEM_KIND_LABELS[k]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor={`qty-${row.uid}`} className="text-caption text-muted-foreground">
                                Qty
                              </Label>
                              <Input
                                id={`qty-${row.uid}`}
                                inputMode="numeric"
                                value={row.qty}
                                onChange={(e) => updateRow(row.uid, { qty: e.target.value.replace(/[^\d]/g, "") })}
                                placeholder="1000"
                                aria-invalid={issues.qty || undefined}
                                className="tnum mt-1 h-9 text-body-sm"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`price-${row.uid}`} className="text-caption text-muted-foreground">
                                Unit price
                              </Label>
                              <div className="relative mt-1">
                                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-body-sm text-muted-foreground" aria-hidden>
                                  $
                                </span>
                                <Input
                                  id={`price-${row.uid}`}
                                  inputMode="decimal"
                                  value={row.price}
                                  onChange={(e) => updateRow(row.uid, { price: e.target.value })}
                                  placeholder="0.62"
                                  aria-invalid={issues.price || undefined}
                                  className="tnum h-9 pl-6 text-body-sm"
                                />
                              </div>
                            </div>
                            <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end">
                              <div className="text-right">
                                <p className="text-caption text-muted-foreground">Line total</p>
                                <p className="tnum text-body-sm font-medium">
                                  {total === null ? <span className="text-muted-foreground">—</span> : <Money cents={total} />}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                                aria-label={`Remove line ${index + 1}`}
                                disabled={rows.length === 1}
                                onClick={() => setRows((rs) => rs.filter((r) => r.uid !== row.uid))}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </Button>
                            </div>
                          </div>
                          {(issues.description || issues.qty || issues.price) && (
                            <p className="mt-1.5 text-caption text-[var(--status-danger-fg)]">
                              {issues.description && "Description required. "}
                              {issues.qty && "Qty must be a whole number greater than 0. "}
                              {issues.price && "Unit price must be a valid dollar amount (e.g. 0.62)."}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setRows((rs) => [...rs, emptyRow()])}
                    >
                      <Plus className="size-3.5" aria-hidden /> Add line
                    </Button>
                    <div className="flex items-baseline gap-2">
                      <p className="text-caption text-muted-foreground">Quoted subtotal</p>
                      <MoneyWithCode cents={subtotalCents} className="text-lead font-semibold" />
                    </div>
                  </div>
                </div>

                {/* Expiry / terms / internal note */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quote-expiry" className="flex items-center gap-1.5 text-body-sm">
                      <CalendarDays className="size-3.5" aria-hidden /> Valid until
                    </Label>
                    <Input
                      id="quote-expiry"
                      type="date"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="h-9 text-body-sm"
                    />
                    <p className="text-caption text-muted-foreground">
                      Optional. The quote remains open-ended when blank.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quote-terms" className="text-body-sm">
                      Terms &amp; conditions
                    </Label>
                    <Textarea
                      id="quote-terms"
                      rows={4}
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      placeholder="Validity, lead time, freight, taxes…"
                      className="text-body-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-internal-note" className="text-body-sm">
                    Internal note <span className="text-muted-foreground">(stored on the quote, not shown to the customer)</span>
                  </Label>
                  <Textarea
                    id="quote-internal-note"
                    rows={3}
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Costing basis, margin notes, follow-ups…"
                    className="bg-surface-sunken text-body-sm"
                  />
                </div>

                {invalidRows > 0 && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]">
                    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p>
                      {invalidRows === 1
                        ? "One line is incomplete. Every line needs a description, a quantity above 0 and a valid unit price."
                        : `${invalidRows} lines are incomplete. Every line needs a description, a quantity above 0 and a valid unit price.`}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="max-w-sm text-caption leading-relaxed text-muted-foreground">
                    Issuing replaces the item list and notifies the customer. Re-issuing creates revision{" "}
                    {quote.revision + 1}.
                  </p>
                  <Button
                    className="gap-1.5"
                    disabled={!rowsValid || issue.isPending}
                    onClick={() => issue.mutate()}
                  >
                    {issue.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                    {issue.isPending ? "Issuing…" : hasItems ? `Send revision ${quote.revision + 1}` : "Issue quote"}
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <div className="rounded-[14px] border border-dashed bg-surface-sunken/60 px-4 py-8 text-center">
              <FileText className="mx-auto size-5 text-muted-foreground/60" aria-hidden />
              <p className="mt-2 text-body-sm font-medium text-foreground">
                {preIssue ? "Not priced yet" : "Issue a new revision"}
              </p>
              <Button variant="outline" className="mt-4 gap-1.5" onClick={() => openBuilderPrefilled(quote)}>
                <ClipboardList className="size-4" aria-hidden />
                Open builder
              </Button>
            </div>
          )}
        </div>

        {/* Right column — facts */}
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:sticky lg:top-[84px]">
          <SectionCard title="Summary">
            <dl>
              <DefRow
                label="Customer"
                value={
                  <button
                    type="button"
                    onClick={() => navigate("admin-customer-detail", { id: quote.orgId })}
                    className="text-left underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {quote.orgName}
                  </button>
                }
              />
              <DefRow label="Code" value={<span className="font-mono text-body-sm">{quote.orgCode}</span>} />
              <DefRow label="Requested" value={formatDateTime(quote.createdAt)} />
              {quote.issuedAt && <DefRow label="Issued" value={formatDateTime(quote.issuedAt)} />}
              {quote.expiryDate && <DefRow label="Valid until" value={formatDate(quote.expiryDate)} />}
              {quote.respondedAt && <DefRow label="Response" value={formatDateTime(quote.respondedAt)} />}
              <DefRow label="Quoted total" value={quote.itemsTotalCents > 0 ? <MoneyWithCode cents={quote.itemsTotalCents} /> : "Not yet priced"} />
            </dl>
          </SectionCard>
        </div>
      </div>
      </ViewEnter>

      {/* Print-ready preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-surface-sunken sm:max-w-[820px]">
          <DialogHeader className="border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle className="text-body font-medium">
              Document preview, {quote.quoteNumber}
            </DialogTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="size-3.5" aria-hidden /> Print / save as PDF
            </Button>
          </DialogHeader>
          <QuoteDocument quote={quote} />
        </DialogContent>
      </Dialog>

      {/* Add to catalogue — prefilled product form; on save the customer gets
          access and a notification (see grantAccessAndNotify). */}
      {isNewProduct && (
        <ProductFormDialog
          key={`add-to-catalogue-${quote.id}`}
          open={productFormOpen}
          onClose={() => setProductFormOpen(false)}
          prefill={productPrefill}
          onSaved={({ id }) => {
            void grantAccessAndNotify(id);
          }}
        />
      )}
    </div>
  );

  function updateRow(uid: string, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }
}
