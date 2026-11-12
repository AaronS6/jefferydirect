"use client";

// Quotation detail — your original request, the issued quote (items, total,
// expiry, terms), decision actions when issued, conversion when accepted,
// and a print-ready document preview.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Check, FileDown, FileText, Loader2, PencilLine, Printer, ThumbsDown, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { QuoteDocument } from "@/components/shared/quote-document";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { QuotationDetail } from "@/types";
import { QUOTE_ITEM_KIND_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import { toast } from "@/hooks/use-toast";
import { DetailRow, ErrorAlert, Mono, RowsSkeleton, SectionCard } from "./portal-bits";

const EASE = [0.22, 1, 0.36, 1] as const;

// Short enquiry phrases for the admin-recorded provenance callout.
const SOURCE_ENQUIRY: Record<string, string> = {
  EMAIL: "email",
  PHONE: "phone",
  IN_PERSON: "in-person",
};

type RespondAction = "ACCEPT" | "REJECT" | "REVISION";

// NEW_PRODUCT quotes store their structured request inside `specs`:
// description lines + "Food contact: yes/no" + "Yearly volume: N".
function parseProductSpecs(specs: string | null): {
  description: string | null;
  foodContact: string | null;
  yearlyVolume: string | null;
} {
  if (!specs) return { description: null, foodContact: null, yearlyVolume: null };
  let foodContact: string | null = null;
  let yearlyVolume: string | null = null;
  const descriptionLines: string[] = [];
  for (const raw of specs.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const food = /^Food contact:\s*(.+)$/i.exec(line);
    const yearly = /^Yearly volume:\s*(.+)$/i.exec(line);
    if (food) foodContact = food[1].trim();
    else if (yearly) yearlyVolume = yearly[1].trim();
    else descriptionLines.push(line);
  }
  return {
    description: descriptionLines.length > 0 ? descriptionLines.join("\n") : null,
    foodContact,
    yearlyVolume,
  };
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function QuoteDetailView({ quotationId }: { quotationId: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const [acceptOpen, setAcceptOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [revisionComment, setRevisionComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: quote, isLoading, error, refetch } = useQuery({
    queryKey: ["quotations", "detail", quotationId],
    queryFn: () => api.get<QuotationDetail>(`/api/customer/quotations/${quotationId}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["quotations"] });
    queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const respondMutation = useMutation({
    mutationFn: ({ action, comment }: { action: RespondAction; comment?: string }) =>
      api.post<{ ok: boolean }>(`/api/customer/quotations/${quotationId}/respond`, { action, comment }),
    onSuccess: (_res, vars) => {
      invalidate();
      setAcceptOpen(false);
      setDeclineOpen(false);
      setRevisionOpen(false);
      setDeclineReason("");
      setRevisionComment("");
      setActionError(null);
      if (vars.action === "ACCEPT") {
        toast({ title: "Quote accepted" });
      } else if (vars.action === "REJECT") {
        toast({ title: "Quote declined" });
      } else {
        toast({ title: "Revision requested" });
      }
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "We could not record your response.";
      setActionError(message);
      setAcceptOpen(false);
      setDeclineOpen(false);
      setRevisionOpen(false);
      toast({ title: "Could not respond", description: message, variant: "destructive" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      api.post<{ orderId: string; orderNumber: string }>(`/api/customer/quotations/${quotationId}/convert`),
    onSuccess: (res) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setConvertOpen(false);
      toast({ title: "Order created" });
      navigate("order-detail", { id: res.orderId });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "We could not convert this quote.";
      setActionError(message);
      setConvertOpen(false);
      toast({ title: "Could not convert", description: message, variant: "destructive" });
    },
  });

  if (error) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Quote" onBack={back} />
        <ErrorAlert
          message={error instanceof Error ? error.message : "We could not load this quote."}
          onRetry={() => refetch()}
        />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate("quotations")}>
            Back to quotes
          </Button>
        </div>
      </motion.div>
    );
  }

  if (isLoading || !quote) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Quote" onBack={back} />
        <div className="space-y-8">
          <div className="rounded-[14px] border bg-card p-5 shadow-xs">
            <RowsSkeleton rows={6} />
          </div>
          <div className="rounded-[14px] border bg-card p-5 shadow-xs">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-40 w-full" />
          </div>
        </div>
      </motion.div>
    );
  }

  const issued = quote.items.length > 0 && quote.status !== "REQUESTED" && quote.status !== "UNDER_REVIEW";
  const expiringSoon =
    quote.status === "ISSUED" && quote.expiryDate !== null && daysUntil(quote.expiryDate) <= 7;
  const isNewProduct = quote.kind === "NEW_PRODUCT";
  const productSpecs = parseProductSpecs(quote.specs);

  return (
    <motion.div {...enter}>
      <PageHeader
        title={
          isNewProduct ? (
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span>Product request</span>
              <Mono className="text-body-sm tracking-normal text-muted-foreground">
                {quote.quoteNumber}
              </Mono>
            </span>
          ) : (
            <Mono className="text-heading tracking-tight">{quote.quoteNumber}</Mono>
          )
        }
        onBack={back}
        actions={
          <>
            {quote.revision > 0 && (
              <span className="inline-flex h-[22px] shrink-0 items-center rounded-full border bg-card px-2.5 text-caption font-medium text-muted-foreground">
                Rev {quote.revision}
              </span>
            )}
            <StatusBadge status={quote.status} kind="quote" />
          </>
        }
      />

      {quote.sourceType && quote.sourceType !== "PORTAL" && (
        <div className="mb-6 flex items-start gap-2.5 rounded-[10px] border border-kraft/40 bg-kraft-soft/60 px-4 py-3 text-body-sm text-kraft-ink">
          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">Jeffery Group issued this quote for you</span> from your{" "}
            {SOURCE_ENQUIRY[quote.sourceType] ?? quote.sourceType.toLowerCase()} enquiry
            {quote.recordedByName ? `, handled by ${quote.recordedByName}` : ""}.
          </p>
        </div>
      )}

      {expiringSoon && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-[10px] border border-kraft/40 bg-kraft-soft/60 px-4 py-3 text-body-sm text-kraft-ink"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">This quote expires soon</span>. Valid until{" "}
            {formatDate(quote.expiryDate)}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Issued quotation — paper document ── */}
        <div className="min-w-0 space-y-8">
          {issued ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div>
                  <p className="text-micro text-muted-foreground">Issued quote</p>
                  <p className="mt-1 text-caption text-muted-foreground">
                    Issued {formatDate(quote.issuedAt)}
                    {quote.expiryDate ? ` · valid until ${formatDate(quote.expiryDate)}` : ""} · excludes
                    applicable taxes
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPrintOpen(true)}>
                  <Printer className="size-3.5" aria-hidden />
                  Print / Save PDF
                </Button>
              </div>

              {/* ── Paper document — the printed-paper metaphor ── */}
              <div className="rounded-[18px] bg-surface-sunken p-4 sm:p-6">
                <div className="mx-auto max-w-[760px] bg-white px-6 py-8 text-neutral-900 shadow-md sm:px-10 dark:bg-white dark:text-neutral-900">
                  {/* Document header */}
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-neutral-900/15 pb-6">
                    <div>
                      <p className="text-micro text-neutral-900/50">Quote</p>
                      <p className="font-display mt-1 text-title font-normal tracking-tight">
                        {quote.quoteNumber}
                      </p>
                      {quote.revision > 0 && (
                        <p className="mt-1 text-caption text-neutral-900/60">Revision {quote.revision}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-micro text-neutral-900/50">Prepared for</p>
                      <p className="mt-1 text-body-sm font-semibold">{quote.orgName}</p>
                      <p className="mt-0.5 text-caption text-neutral-900/60">Attn: {quote.requestedBy}</p>
                      <p className="mt-0.5 text-caption text-neutral-900/60">
                        {quote.destination ?? quote.title}
                      </p>
                    </div>
                  </div>

                  {/* Items — ruled hairline rows */}
                  <div className="mt-5 hidden md:block">
                    <table className="w-full border-collapse text-body-sm">
                      <thead>
                        <tr className="border-b border-neutral-900/25 text-micro text-neutral-900/60">
                          <th className="w-[46%] py-2 text-left font-medium">Description</th>
                          <th className="py-2 text-left font-medium">Type</th>
                          <th className="py-2 pl-5 text-right font-medium">Qty</th>
                          <th className="py-2 pl-5 whitespace-nowrap text-right font-medium">Unit</th>
                          <th className="py-2 pl-5 whitespace-nowrap text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.items.map((item) => (
                          <tr key={item.id} className="border-b border-neutral-900/15 align-top last:border-b-0">
                            <td className="py-2.5 pr-2">{item.description}</td>
                            <td className="py-2.5 pr-2 text-neutral-900/60">
                              {QUOTE_ITEM_KIND_LABELS[item.kind] ?? item.kind}
                            </td>
                            <td className="tnum py-2.5 pl-5 whitespace-nowrap text-right">{item.qty.toLocaleString()}</td>
                            <td className="tnum py-2.5 pl-5 whitespace-nowrap text-right">
                              <Money cents={item.unitPriceCents} />
                            </td>
                            <td className="tnum py-2.5 pl-5 whitespace-nowrap text-right">
                              <Money cents={item.lineTotalCents} className="font-medium" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile stacked */}
                  <ul className="mt-5 md:hidden">
                    {quote.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 border-b border-neutral-900/15 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-body-sm leading-snug">{item.description}</p>
                          <p className="mt-0.5 text-caption text-neutral-900/60">
                            {QUOTE_ITEM_KIND_LABELS[item.kind] ?? item.kind}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Money cents={item.lineTotalCents} className="text-body-sm font-medium" />
                          <p className="text-caption text-neutral-900/60">
                            <span className="tnum">{item.qty.toLocaleString()}</span> ×{" "}
                            <Money cents={item.unitPriceCents} />
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Totals block */}
                  <div className="mt-4 flex justify-end">
                    <div className="w-full max-w-[300px]">
                      <div className="flex items-baseline justify-between py-1 text-body-sm text-neutral-900/70">
                        <span>Subtotal</span>
                        <Money cents={quote.itemsTotalCents} />
                      </div>
                      <div className="flex items-baseline justify-between py-1 text-body-sm text-neutral-900/70">
                        <span>Taxes</span>
                        <span className="text-caption">As applicable at invoice</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between border-t border-neutral-900/25 pt-2">
                        <span className="text-body-sm font-medium">Quote total</span>
                        <span className="tnum font-display text-title font-normal">
                          <Money cents={quote.itemsTotalCents} />{" "}
                          <span className="text-caption font-normal text-neutral-900/60">CAD</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {quote.terms && (
                    <div className="mt-6 border-t border-neutral-900/15 pt-5">
                      <p className="text-micro text-neutral-900/50">Terms &amp; conditions</p>
                      <p className="mt-2 whitespace-pre-line text-body-sm leading-relaxed text-neutral-900/70">
                        {quote.terms}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action bar pinned beneath the sheet */}
                {quote.status === "ISSUED" && (
                  <div className="mx-auto mt-4 max-w-[760px]">
                    {actionError && (
                      <div
                        role="alert"
                        className="mb-3 rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
                      >
                        {actionError}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Button className="gap-2" onClick={() => setAcceptOpen(true)} disabled={respondMutation.isPending}>
                        <Check className="size-4" aria-hidden />
                        Accept quote
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setRevisionOpen(true)}
                        disabled={respondMutation.isPending}
                      >
                        <PencilLine className="size-4" aria-hidden />
                        Request revision
                      </Button>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        onClick={() => setDeclineOpen(true)}
                        disabled={respondMutation.isPending}
                      >
                        <ThumbsDown className="size-4" aria-hidden />
                        Decline
                      </Button>
                    </div>
                    <p className="mt-2 text-caption text-pretty text-muted-foreground">
                      Accepting records your decision. Convert to an order afterwards.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <SectionCard title="Quote">
              {quote.status === "REQUESTED" || quote.status === "UNDER_REVIEW" ? (
                <div className="flex items-start gap-2.5 text-body-sm text-muted-foreground">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>Not issued yet. You&apos;ll be notified when it&apos;s ready.</p>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 text-body-sm text-muted-foreground">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>No priced items on this quote.</p>
                </div>
              )}
            </SectionCard>
          )}

          {quote.status === "ACCEPTED" && (
            <SectionCard title="Next step">
              {actionError && (
                <div
                  role="alert"
                  className="mb-3 rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
                >
                  {actionError}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button className="gap-2" onClick={() => setConvertOpen(true)} disabled={convertMutation.isPending}>
                  {convertMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ArrowRight className="size-4" aria-hidden />
                  )}
                  Convert to order
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setPrintOpen(true)}>
                  <Printer className="size-4" aria-hidden />
                  Print / Save PDF
                </Button>
              </div>
              <p className="mt-3 text-caption text-pretty leading-relaxed text-muted-foreground">
                Creates an order at the quoted prices. Setup, freight and other charges appear as separate
                lines.
              </p>
            </SectionCard>
          )}

          {(quote.status === "EXPIRED" || quote.status === "REJECTED" || quote.status === "REVISED" || quote.status === "CANCELLED") && (
            <div className="rounded-[14px] border bg-card px-5 py-4 text-body-sm leading-relaxed text-muted-foreground shadow-xs">
              {quote.status === "EXPIRED" &&
                `This quote expired on ${formatDate(quote.expiryDate)}. Pricing is no longer guaranteed.`}
              {quote.status === "REJECTED" &&
                `You declined this quote${quote.respondedAt ? ` on ${formatDate(quote.respondedAt)}` : ""}.`}
              {quote.status === "REVISED" &&
                "A revision is being prepared. You&apos;ll be notified when the updated quote is issued."}
              {quote.status === "CANCELLED" && "This quote was cancelled."}
            </div>
          )}
        </div>

        {/* ── Your request rail ── */}
        <aside className="min-w-0" aria-label="Original quote request">
          <SectionCard title="Your request">
            {isNewProduct ? (
              <dl className="m-0">
                <DetailRow label="Product">{quote.productName ?? quote.title}</DetailRow>
                <DetailRow label="Type">{quote.category}</DetailRow>
                <DetailRow label="Size">{quote.dimensions}</DetailRow>
                <DetailRow label="Material">{quote.material}</DetailRow>
                <DetailRow label="Printing">{quote.printing}</DetailRow>
                <DetailRow label="Food contact">{productSpecs.foodContact}</DetailRow>
                <DetailRow label="Quantity per order">{quote.quantity}</DetailRow>
                <DetailRow label="Yearly volume">{productSpecs.yearlyVolume}</DetailRow>
                <DetailRow label="Needed by">{quote.neededBy ? formatDate(quote.neededBy) : undefined}</DetailRow>
                <DetailRow label="Delivery address">{quote.destination}</DetailRow>
                <DetailRow label="Description">{productSpecs.description}</DetailRow>
              </dl>
            ) : (
              <dl className="m-0">
                <DetailRow label="Request title">{quote.title}</DetailRow>
                <DetailRow label="Category">{quote.category}</DetailRow>
                <DetailRow label="Product">{quote.productName}</DetailRow>
                <DetailRow label="Dimensions">{quote.dimensions}</DetailRow>
                <DetailRow label="Material">{quote.material}</DetailRow>
                <DetailRow label="Colour">{quote.colour}</DetailRow>
                <DetailRow label="Printing">{quote.printing}</DetailRow>
                <DetailRow label="Quantity">{quote.quantity}</DetailRow>
                <DetailRow label="Needed by">{quote.neededBy}</DetailRow>
                <DetailRow label="Destination">{quote.destination}</DetailRow>
                <DetailRow label="Specs">{quote.specs}</DetailRow>
                <DetailRow label="Comments">{quote.comments}</DetailRow>
              </dl>
            )}
            <Separator className="my-4" />
            <dl className="m-0">
              <DetailRow label="Requested">{formatDate(quote.createdAt)}</DetailRow>
              {quote.respondedAt && (
                <DetailRow label="Your response">
                  {formatDate(quote.respondedAt)}
                  {quote.respondedNote && (
                    <span className="block whitespace-pre-line text-caption text-muted-foreground">
                      {quote.respondedNote}
                    </span>
                  )}
                </DetailRow>
              )}
            </dl>
          </SectionCard>
        </aside>
      </div>

      {/* Accept confirm */}
      <AlertDialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept quote {quote.quoteNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Accepting records your decision with our team. Quoted prices apply until{" "}
              {formatDate(quote.expiryDate)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={respondMutation.isPending}>Not now</AlertDialogCancel>
            <AlertDialogAction
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate({ action: "ACCEPT" })}
            >
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline confirm + optional reason */}
      <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline quote {quote.quoteNumber}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>An optional reason helps us improve future quotes.</p>
                <div className="space-y-2">
                  <Label htmlFor="decline-reason">Reason (optional)</Label>
                  <Textarea
                    id="decline-reason"
                    rows={3}
                    maxLength={2000}
                    placeholder="e.g. Timing no longer works for us"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={respondMutation.isPending}>Keep quote</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/35"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate({ action: "REJECT", comment: declineReason.trim() || undefined })}
            >
              Decline quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Request revision */}
      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Request a revision</DialogTitle>
            <DialogDescription>
              Tell us what to change. We&apos;ll issue an updated quote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revision-comment">What should change?</Label>
            <Textarea
              id="revision-comment"
              rows={4}
              maxLength={2000}
              placeholder="e.g. Can we look at 3,000 units instead, with freight to the Danforth location?"
              value={revisionComment}
              onChange={(e) => setRevisionComment(e.target.value)}
            />
          </div>
          {actionError && (
            <div
              role="alert"
              className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
            >
              {actionError}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRevisionOpen(false)} disabled={respondMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={respondMutation.isPending || revisionComment.trim().length === 0}
              onClick={() => respondMutation.mutate({ action: "REVISION", comment: revisionComment.trim() })}
            >
              {respondMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <PencilLine className="size-4" aria-hidden />
              )}
              Send revision request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert confirm */}
      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to an order?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates an order at the quoted prices. Setup, freight and other charges appear as separate
              lines.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <div
              role="alert"
              className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
            >
              {actionError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={convertMutation.isPending}
              onClick={() => convertMutation.mutate()}
            >
              <ArrowRight className="size-4" aria-hidden />
              Create order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print / save as PDF */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-background p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Quote preview</DialogTitle>
            <DialogDescription>
              Print or save as PDF from your browser&apos;s print dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-surface-sunken p-4 sm:p-6">
            <QuoteDocument quote={quote} />
          </div>
          <div className="flex justify-end gap-2 border-t bg-background px-5 py-3.5">
            <Button variant="outline" onClick={() => setPrintOpen(false)}>
              Close
            </Button>
            <Button className="gap-2" onClick={() => window.print()}>
              <FileDown className="size-4" aria-hidden />
              Print / Save PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
