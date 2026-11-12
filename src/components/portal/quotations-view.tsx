"use client";

// Quotes — status-aware tabs (Open / Closed / All) over the same table, plus
// the request-new-quote dialog (auto-opens when navigated here with an aux
// payload).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, FileText, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { QuotationListItem } from "@/types";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ErrorAlert, Mono, RowsSkeleton } from "./portal-bits";
import { RequestQuoteDialog } from "./request-quote-dialog";
import { ProductRequestSheet } from "./product-request-sheet";

const EASE = [0.22, 1, 0.36, 1] as const;

const OPEN_STATUSES = new Set(["REQUESTED", "UNDER_REVIEW", "ISSUED", "REVISED"]);
const CLOSED_STATUSES = new Set(["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"]);

// Kraft-tinted tag — marks quotes that request a product we do not carry.
function NewProductTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-full border border-kraft/40 bg-kraft-soft px-2 text-caption font-medium text-kraft-ink",
        className,
      )}
    >
      New product
    </span>
  );
}

type QuoteTab = "open" | "closed" | "all";

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function QuotationsView() {
  const navigate = useAppStore((s) => s.navigate);
  const view = useAppStore((s) => s.view);
  const session = useAppStore((s) => s.session);
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const [tab, setTab] = useState<QuoteTab>("open");
  const [dialogOpen, setDialogOpen] = useState(() => Boolean(view.aux));
  const [prefillProduct, setPrefillProduct] = useState<string | undefined>(() =>
    view.aux && view.aux !== "new" ? view.aux : undefined,
  );
  // Product requests are a write action — hidden for read-only users.
  const canRequestProduct =
    session?.user.orgRole === "ORG_ADMIN" || session?.user.orgRole === "PURCHASING";
  const [productRequestOpen, setProductRequestOpen] = useState(false);

  // Auto-open the request dialog when routed here with aux === "new"
  // (dashboard quick action) or aux carrying a product-name prefill. Detail
  // navigation remounts this view, so deriving the initial state at mount is
  // sufficient. Clearing the prefill on close keeps manual opens unseeded.
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setPrefillProduct(undefined);
  };

  const { data: quotes, isLoading, error, refetch } = useQuery({
    queryKey: ["quotations"],
    queryFn: () => api.get<QuotationListItem[]>("/api/customer/quotations"),
  });

  const rows = useMemo(() => quotes ?? [], [quotes]);
  const openRows = useMemo(() => rows.filter((q) => OPEN_STATUSES.has(q.status)), [rows]);
  const closedRows = useMemo(() => rows.filter((q) => CLOSED_STATUSES.has(q.status)), [rows]);

  const tabs: { value: QuoteTab; label: string; count: number; rows: QuotationListItem[] }[] = [
    { value: "open", label: "Open", count: openRows.length, rows: openRows },
    { value: "closed", label: "Closed", count: closedRows.length, rows: closedRows },
    { value: "all", label: "All", count: rows.length, rows },
  ];

  const open = (q: QuotationListItem) => navigate("quote-detail", { id: q.id });

  return (
    <motion.div {...enter}>
      <PageHeader
        title="Quotes"
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
              <FileText className="size-4" aria-hidden />
              Request a quote
            </Button>
            {canRequestProduct && (
              <Button className="gap-2" onClick={() => setProductRequestOpen(true)}>
                <PackagePlus className="size-4" aria-hidden />
                Request a product
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as QuoteTab)} className="gap-6">
        <TabsList className="h-9">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3">
              {t.label}
              {!isLoading && quotes !== undefined && (
                <span className="tnum text-caption text-muted-foreground">{t.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {error ? (
          <ErrorAlert message="We could not load your quotes." onRetry={() => refetch()} />
        ) : isLoading || !quotes ? (
          <div className="rounded-[14px] border bg-card shadow-xs">
            <div className="border-b px-5 py-3">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="p-5">
              <RowsSkeleton rows={4} />
            </div>
          </div>
        ) : (
          tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              {t.rows.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={
                    t.value === "open" ? "No open quotes" : t.value === "closed" ? "No closed quotes" : "No quotes yet"
                  }
                  action={
                    t.value !== "closed" ? (
                      <Button onClick={() => setDialogOpen(true)} className="gap-2">
                        <FileText className="size-4" aria-hidden />
                        Request a quote
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <QuotesTable rows={t.rows} onOpen={open} />
              )}
            </TabsContent>
          ))
        )}
      </Tabs>

      <RequestQuoteDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        prefillProduct={prefillProduct}
      />

      {canRequestProduct && (
        <ProductRequestSheet open={productRequestOpen} onOpenChange={setProductRequestOpen} />
      )}
    </motion.div>
  );
}

function QuotesTable({ rows, onOpen }: { rows: QuotationListItem[]; onOpen: (q: QuotationListItem) => void }) {
  return (
    <div className="rounded-[14px] border bg-card shadow-xs">
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Quote</TableHead>
              <TableHead className="w-[34%]">Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((q) => {
              const expiringSoon =
                q.status === "ISSUED" && q.expiryDate !== null && daysUntil(q.expiryDate) <= 7;
              return (
                <TableRow
                  key={q.id}
                  tabIndex={0}
                  onClick={() => onOpen(q)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onOpen(q);
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="whitespace-nowrap">
                    <Mono className="text-body-sm font-medium text-foreground">{q.quoteNumber}</Mono>
                    {q.revision > 0 && (
                      <span className="ml-2 text-caption font-medium text-muted-foreground">
                        Rev {q.revision}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="line-clamp-1 min-w-0 flex-1">{q.title}</span>
                      {q.kind === "NEW_PRODUCT" && <NewProductTag />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={q.status} kind="quote" />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {q.itemsTotalCents > 0 ? <Money cents={q.itemsTotalCents} className="font-medium" /> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(q.issuedAt)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap",
                      expiringSoon ? "font-medium text-kraft-ink" : "text-muted-foreground",
                    )}
                  >
                    {formatDate(q.expiryDate)}
                    {expiringSoon && <span className="ml-1.5 text-caption">expires soon</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ChevronRight className="size-4" aria-hidden />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {/* Mobile stacked cards */}
      <ul className="divide-y md:hidden">
        {rows.map((q) => {
          const expiringSoon =
            q.status === "ISSUED" && q.expiryDate !== null && daysUntil(q.expiryDate) <= 7;
          return (
            <li key={q.id}>
              <button
                onClick={() => onOpen(q)}
                className="flex w-full items-start justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/70"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <Mono className="text-body-sm font-medium text-foreground">{q.quoteNumber}</Mono>
                    <StatusBadge status={q.status} kind="quote" />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="line-clamp-2 text-caption text-muted-foreground">{q.title}</span>
                    {q.kind === "NEW_PRODUCT" && <NewProductTag />}
                  </span>
                  <span
                    className={cn("mt-1 block text-caption", expiringSoon ? "text-kraft-ink" : "text-muted-foreground")}
                  >
                    Issued {formatDate(q.issuedAt)}
                    {q.expiryDate && <> · expires {formatDate(q.expiryDate)}</>}
                    {expiringSoon && " · expires soon"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {q.itemsTotalCents > 0 ? (
                    <Money cents={q.itemsTotalCents} className="text-body-sm font-medium" />
                  ) : null}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
