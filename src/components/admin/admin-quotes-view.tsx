"use client";

// Administration — quote list. REQUESTED / UNDER_REVIEW rows are highlighted
// (amber accent) because they are the quotes waiting on Jeffery Group pricing.
// "Issue quote" records a quote for an enquiry received by email or phone.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileStack, FilePlus2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/date";
import { QUOTE_STATUS_LABELS } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import type { QuotationListItem } from "@/types";
import { InlineError, RowsSkeleton, SearchField, SectionCard, Td, Th, Toolbar, useDebouncedValue, ViewEnter } from "./admin-ui";
import { AdminNewQuoteDialog } from "./admin-new-quote-dialog";
import { cn } from "@/lib/utils";

const ALL = "ALL";
const ACTION_STATUSES = new Set(["REQUESTED", "UNDER_REVIEW"]);

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

export function AdminQuotesView() {
  const navigate = useAppStore((s) => s.navigate);
  const aux = useAppStore((s) => s.view.aux);

  const [status, setStatus] = useState<string>(() => (aux && QUOTE_STATUS_LABELS[aux] ? aux : ALL));
  const [search, setSearch] = useState("");
  const [newProductsOnly, setNewProductsOnly] = useState(false);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  // Re-sync the filter when the entry-point changes (KPI drill-down vs the
  // plain sidebar entry) — render-time adjustment, no effect cascade.
  const [prevAux, setPrevAux] = useState(aux);
  if (aux !== prevAux) {
    setPrevAux(aux);
    setStatus(aux && QUOTE_STATUS_LABELS[aux] ? aux : ALL);
    setSearch("");
  }

  const params = new URLSearchParams();
  if (status !== ALL) params.set("status", status);
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  const qs = params.toString();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "quotes", { status, search: debouncedSearch.trim() }],
    queryFn: () => api.get<QuotationListItem[]>(`/api/admin/quotations${qs ? `?${qs}` : ""}`),
  });

  const quotes = data ?? [];
  const newProductCount = quotes.filter((q) => q.kind === "NEW_PRODUCT").length;
  const rows = newProductsOnly ? quotes.filter((q) => q.kind === "NEW_PRODUCT") : quotes;
  const filtersActive = status !== ALL || search.trim() !== "" || newProductsOnly;
  const actionCount = rows.filter((q) => ACTION_STATUSES.has(q.status)).length;

  const clearFilters = () => {
    setStatus(ALL);
    setSearch("");
    setNewProductsOnly(false);
  };

  return (
    <div>
      <PageHeader title="Quotes" />

      <ViewEnter>
      <Toolbar>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="h-9 w-full sm:w-[220px] text-body-sm" aria-label="Filter by quote status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectGroup>
              <SelectLabel className="text-micro">Needs action</SelectLabel>
              <SelectItem value="REQUESTED">{QUOTE_STATUS_LABELS.REQUESTED}</SelectItem>
              <SelectItem value="UNDER_REVIEW">{QUOTE_STATUS_LABELS.UNDER_REVIEW}</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-micro">Active</SelectLabel>
              <SelectItem value="ISSUED">{QUOTE_STATUS_LABELS.ISSUED}</SelectItem>
              <SelectItem value="REVISED">{QUOTE_STATUS_LABELS.REVISED}</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-micro">Responded / closed</SelectLabel>
              <SelectItem value="ACCEPTED">{QUOTE_STATUS_LABELS.ACCEPTED}</SelectItem>
              <SelectItem value="REJECTED">{QUOTE_STATUS_LABELS.REJECTED}</SelectItem>
              <SelectItem value="EXPIRED">{QUOTE_STATUS_LABELS.EXPIRED}</SelectItem>
              <SelectItem value="CANCELLED">{QUOTE_STATUS_LABELS.CANCELLED}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search quote #, title…"
          ariaLabel="Search quotes"
          className="sm:max-w-[280px]"
        />

        <button
          type="button"
          aria-pressed={newProductsOnly}
          onClick={() => setNewProductsOnly((v) => !v)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
            newProductsOnly
              ? "bg-kraft-strong text-white"
              : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          New products
          {data !== undefined && <span className="tnum text-caption">{newProductCount}</span>}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setNewQuoteOpen(true)}
          >
            <FilePlus2 className="size-4" aria-hidden />
            Issue quote
          </Button>
          {rows.length > 0 && (
            <p className="tnum whitespace-nowrap text-caption text-muted-foreground">
              {rows.length} {rows.length === 1 ? "quote" : "quotes"}
              {actionCount > 0 && (
                <span className="ml-1.5 rounded-full bg-kraft-soft px-1.5 py-0.5 text-caption font-medium text-kraft-ink">
                  {actionCount} awaiting pricing
                </span>
              )}
            </p>
          )}
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Button>
          )}
        </div>
      </Toolbar>

      {isError ? (
        <InlineError message={error instanceof Error ? error.message : "Could not load quotes."} />
      ) : isLoading ? (
        <SectionCard>
          <RowsSkeleton rows={6} />
        </SectionCard>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title={filtersActive ? "No matching quotes" : "No quotes yet"}
          action={
            filtersActive ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          {/* Desktop table */}
          <div className="hidden max-h-[60vh] overflow-auto md:block">
            <Table className="min-w-[840px]">
              <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <TableRow className="hover:bg-transparent">
                  <Th>Quote</Th>
                  <Th>Customer</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Issued</Th>
                  <Th>Expires</Th>
                  <Th className="w-10" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q) => (
                  <TableRow
                    key={q.id}
                    className={cn("cursor-pointer", ACTION_STATUSES.has(q.status) && "border-l-[3px] border-l-kraft bg-kraft-soft/30")}
                    onClick={() => navigate("admin-quote-detail", { id: q.id })}
                  >
                    <Td>
                      <button
                        type="button"
                        className="rounded font-mono text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("admin-quote-detail", { id: q.id });
                        }}
                      >
                        {q.quoteNumber}
                      </button>
                      {q.revision > 0 && <p className="text-caption text-muted-foreground">Rev {q.revision}</p>}
                    </Td>
                    <Td>
                      <p className="max-w-[180px] truncate">{q.orgName ?? "—"}</p>
                    </Td>
                    <Td className="max-w-[260px]">
                      <div className="flex items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate">{q.title}</p>
                        {q.kind === "NEW_PRODUCT" && <NewProductTag />}
                      </div>
                      {q.category && <p className="truncate text-caption text-muted-foreground">{q.category}</p>}
                    </Td>
                    <Td>
                      <StatusBadge status={q.status} kind="quote" />
                    </Td>
                    <Td className="text-right font-medium">
                      {q.itemsTotalCents > 0 ? <Money cents={q.itemsTotalCents} /> : <span className="text-caption text-muted-foreground">Not priced</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{formatDate(q.issuedAt)}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{formatDate(q.expiryDate)}</Td>
                    <Td className="text-right">
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <ul className="space-y-3 p-4 md:hidden">
            {rows.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => navigate("admin-quote-detail", { id: q.id })}
                  className={cn(
                    "w-full rounded-[14px] border bg-card p-4 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    ACTION_STATUSES.has(q.status) && "border-l-[3px] border-l-kraft bg-kraft-soft/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-body-sm font-medium">
                      {q.quoteNumber}
                      {q.revision > 0 && <span className="ml-1.5 text-caption text-muted-foreground">Rev {q.revision}</span>}
                    </span>
                    <StatusBadge status={q.status} kind="quote" />
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-body-sm font-medium leading-snug">
                    <span className="line-clamp-2">{q.title}</span>
                    {q.kind === "NEW_PRODUCT" && <NewProductTag />}
                  </p>
                  <p className="mt-0.5 truncate text-caption text-muted-foreground">{q.orgName ?? "—"}</p>
                  <div className="mt-2.5 flex items-center justify-between border-t pt-2.5">
                    <span className="text-caption text-muted-foreground">
                      Issued {formatDate(q.issuedAt)} · Expires {formatDate(q.expiryDate)}
                    </span>
                    {q.itemsTotalCents > 0 ? <Money cents={q.itemsTotalCents} className="text-body-sm font-medium" /> : <span className="text-caption text-muted-foreground">Not priced</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      </ViewEnter>

      <AdminNewQuoteDialog open={newQuoteOpen} onOpenChange={setNewQuoteOpen} />
    </div>
  );
}
