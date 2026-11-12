"use client";

// Document centre — searchable, category-filtered listing with preview and a
// clearly-labelled demo download (client-side generated text file).

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Download,
  Eye,
  FileCheck2,
  FileCog,
  FileText,
  FolderOpen,
  ReceiptText,
  ScrollText,
  Search,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { DocumentCategoryBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { DocumentDto } from "@/types";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ErrorAlert, RowsSkeleton } from "./portal-bits";

const ALL = "all";
const EASE = [0.22, 1, 0.36, 1] as const;

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  INVOICE: ReceiptText,
  PURCHASE_ORDER: FileCheck2,
  QUOTATION: FileText,
  STATEMENT: ScrollText,
  SPECIFICATION: FileCog,
  DELIVERY_RECEIPT: Truck,
  OTHER: FolderOpen,
};

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title A-Z" },
] as const;

export function DocumentsView() {
  const navigate = useAppStore((s) => s.navigate);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [sort, setSort] = useState<string>("newest");
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (category !== ALL) p.set("category", category);
    return p.toString();
  }, [debouncedSearch, category]);

  const { data: documents, isLoading, error, refetch } = useQuery({
    queryKey: ["documents", { params }],
    queryFn: () => api.get<DocumentDto[]>(`/api/customer/documents?${params}`),
  });

  // Unfiltered listing feeds the per-category chip counts.
  const { data: allDocuments } = useQuery({
    queryKey: ["documents", "all"],
    queryFn: () => api.get<DocumentDto[]>("/api/customer/documents"),
  });

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of allDocuments ?? []) counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
    return counts;
  }, [allDocuments]);

  const sorted = useMemo(() => {
    const docs = [...(documents ?? [])];
    switch (sort) {
      case "oldest":
        return docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case "title":
        return docs.sort((a, b) => a.title.localeCompare(b.title, "en-CA"));
      default:
        return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }, [documents, sort]);

  const hasFilters = debouncedSearch !== "" || category !== ALL;

  function openRelated(doc: DocumentDto) {
    if (doc.orderId) navigate("order-detail", { id: doc.orderId });
    else if (doc.quotationId) navigate("quote-detail", { id: doc.quotationId });
  }

  return (
    <motion.div {...enter}>
      <PageHeader title="Documents" />

      {/* Filter bar — search, category chips, compact sort */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-9"
              aria-label="Search documents"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-[150px] shrink-0" aria-label="Sort documents">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Category chips — horizontally scrollable, with counts */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {[{ value: ALL, label: "All categories" }, ...DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: DOCUMENT_CATEGORY_LABELS[c] }))].map(
            (c) => {
              const active = category === c.value;
              const count =
                allDocuments === undefined
                  ? null
                  : c.value === ALL
                    ? allDocuments.length
                    : (categoryCounts.get(c.value) ?? 0);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
                    active
                      ? "bg-foreground text-background"
                      : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {c.label}
                  {count !== null && count > 0 && (
                    <span
                      className={cn(
                        "tnum ml-1.5",
                        active ? "text-background/70" : "text-muted-foreground/70",
                      )}
                    >
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            },
          )}
        </div>
      </div>

      {error ? (
        <ErrorAlert message="We could not load your documents." onRetry={() => refetch()} />
      ) : isLoading || !documents ? (
        <div className="rounded-[14px] border bg-card shadow-xs">
          <div className="border-b px-5 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-5">
            <RowsSkeleton rows={5} />
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={hasFilters ? "No documents match" : "No documents yet"}
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory(ALL);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-[14px] border bg-card shadow-xs">
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Document</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Related</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="w-[96px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((doc) => {
                  const Icon = CATEGORY_ICONS[doc.category] ?? FileText;
                  return (
                    <TableRow
                      key={doc.id}
                      tabIndex={0}
                      onClick={() => setPreview(doc)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setPreview(doc);
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-sunken text-muted-foreground">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-body-sm font-semibold text-foreground">{doc.title}</p>
                            {doc.description && (
                              <p className="truncate text-caption text-muted-foreground">{doc.description}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DocumentCategoryBadge category={doc.category} />
                      </TableCell>
                      <TableCell>
                        {(doc.orderNumber || doc.quoteNumber) && (
                          <button
                            className="tnum text-caption font-medium underline-offset-2 transition-colors hover:text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRelated(doc);
                            }}
                          >
                            {doc.orderNumber ?? doc.quoteNumber}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-caption text-muted-foreground">
                        <span className="block">{formatDate(doc.createdAt)}</span>
                        <span className="block text-muted-foreground/80">{doc.uploadedBy}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-caption text-muted-foreground">
                        {doc.sizeLabel}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreview(doc);
                            }}
                            aria-label={`Preview ${doc.title}`}
                          >
                            <Eye className="size-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadDemo(doc);
                            }}
                            aria-label={`Download ${doc.title}`}
                          >
                            <Download className="size-4" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* Mobile stacked cards */}
          <ul className="divide-y md:hidden">
            {sorted.map((doc) => {
              const Icon = CATEGORY_ICONS[doc.category] ?? FileText;
              return (
                <li key={doc.id} className="px-5 py-3.5">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreview(doc)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPreview(doc);
                      }
                    }}
                    className="w-full cursor-pointer text-left"
                  >
                    <span className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-sunken text-muted-foreground">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-semibold text-foreground">{doc.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                          <DocumentCategoryBadge category={doc.category} />
                          {(doc.orderNumber || doc.quoteNumber) && (
                            <button
                              className="tnum font-medium underline-offset-2 hover:text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRelated(doc);
                              }}
                            >
                              {doc.orderNumber ?? doc.quoteNumber}
                            </button>
                          )}
                        </span>
                        <span className="mt-1 block text-caption text-muted-foreground/80">
                          {formatDate(doc.createdAt)} · {doc.uploadedBy} · {doc.sizeLabel}
                        </span>
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setPreview(doc)}>
                      <Eye className="size-3.5" aria-hidden /> Preview
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => downloadDemo(doc)}>
                      <Download className="size-3.5" aria-hidden /> Download
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              {preview && (() => {
                const Icon = CATEGORY_ICONS[preview.category] ?? FileText;
                return (
                  <>
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 truncate">{preview.title}</span>
                  </>
                );
              })()}
            </DialogTitle>
            <DialogDescription>
              {preview ? DOCUMENT_CATEGORY_LABELS[preview.category] ?? preview.category : ""}
              {preview?.version ? ` · version ${preview.version}` : ""}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              {preview.description && (
                <p className="text-body-sm text-pretty leading-relaxed text-muted-foreground">{preview.description}</p>
              )}
              <dl className="m-0 grid grid-cols-1 gap-x-6 rounded-[10px] border bg-surface-sunken/60 px-4 py-3 sm:grid-cols-2">
                <div className="py-1.5">
                  <dt className="text-micro text-muted-foreground">Uploaded by</dt>
                  <dd className="mt-1 text-body-sm">{preview.uploadedBy}</dd>
                </div>
                <div className="py-1.5">
                  <dt className="text-micro text-muted-foreground">Uploaded</dt>
                  <dd className="mt-1 text-body-sm">{formatDateTime(preview.createdAt)}</dd>
                </div>
                <div className="py-1.5">
                  <dt className="text-micro text-muted-foreground">File</dt>
                  <dd className="mt-1 truncate font-mono text-caption">{preview.fileName}</dd>
                </div>
                <div className="py-1.5">
                  <dt className="text-micro text-muted-foreground">Size</dt>
                  <dd className="mt-1 text-body-sm">{preview.sizeLabel}</dd>
                </div>
                {(preview.orderNumber || preview.quoteNumber) && (
                  <div className="py-1.5 sm:col-span-2">
                    <dt className="text-micro text-muted-foreground">Related</dt>
                    <dd className="mt-1">
                      <button
                        className="tnum text-body-sm font-medium underline-offset-2 transition-colors hover:text-primary hover:underline"
                        onClick={() => openRelated(preview)}
                      >
                        {preview.orderNumber ? `Order ${preview.orderNumber}` : `Quote ${preview.quoteNumber}`}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
              <div className="flex justify-end">
                <Button className="gap-2" onClick={() => downloadDemo(preview)}>
                  <Download className="size-4" aria-hidden />
                  Download (demo file)
                </Button>
              </div>
              <p className="text-caption text-pretty leading-relaxed text-muted-foreground">
                Demo environment. Downloads a text summary, not the original PDF.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function downloadDemo(doc: DocumentDto) {
  const summary = [
    doc.title,
    "=".repeat(Math.min(doc.title.length, 60)),
    "",
    `Category: ${DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}`,
    doc.description ? `Summary: ${doc.description}` : null,
    `Uploaded by: ${doc.uploadedBy}`,
    `Uploaded: ${formatDateTime(doc.createdAt)}`,
    `File: ${doc.fileName} (${doc.sizeLabel})`,
    `Version: ${doc.version}`,
    doc.orderNumber ? `Related order: ${doc.orderNumber}` : null,
    doc.quoteNumber ? `Related quote: ${doc.quoteNumber}` : null,
    "",
    "Demo document. Generated by ClientHub",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const blob = new Blob([summary], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.fileName.replace(/\.pdf$/i, "") + "-demo.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
