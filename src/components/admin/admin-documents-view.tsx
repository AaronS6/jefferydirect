"use client";

// Administration — document centre: register documents against customer
// organizations (files are registered here; real storage lands with the
// production release), preview and delete.

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, FolderOpen, Plus, Trash2, Upload, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { DocumentCategoryBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/date";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { DocumentDto, CustomerListItem, OrderListItem } from "@/types";
import { cn } from "@/lib/utils";
import {
  FieldError,
  GroupLabel,
  InlineError,
  RowsSkeleton,
  SearchField,
  SectionCard,
  Td,
  Th,
  Toolbar,
  useDebouncedValue,
  ViewEnter,
} from "./admin-ui";

const ALL = "ALL";

export function AdminDocumentsView() {
  const aux = useAppStore((s) => s.view.aux);
  const [orgId, setOrgId] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(() =>
    aux && (DOCUMENT_CATEGORIES as readonly string[]).includes(aux) ? aux : ALL,
  );
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  // Re-sync the category filter when the entry-point changes (invoiced-volume
  // KPI drill-down vs the plain sidebar entry) — render-time adjustment.
  const [prevAux, setPrevAux] = useState(aux);
  if (aux !== prevAux) {
    setPrevAux(aux);
    setCategory(aux && (DOCUMENT_CATEGORIES as readonly string[]).includes(aux) ? aux : ALL);
    setOrgId(ALL);
    setSearch("");
  }

  const { data: customers } = useQuery({
    queryKey: ["admin", "customers", ""],
    queryFn: () => api.get<CustomerListItem[]>("/api/admin/customers?search="),
  });

  const params = new URLSearchParams();
  if (orgId !== ALL) params.set("orgId", orgId);
  if (category !== ALL) params.set("category", category);
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  const qs = params.toString();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "documents", { orgId, category, search: debouncedSearch.trim() }],
    queryFn: () => api.get<DocumentDto[]>(`/api/admin/documents${qs ? `?${qs}` : ""}`),
  });

  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (doc: DocumentDto) => api.del<{ ok: boolean }>(`/api/admin/documents/${doc.id}`),
    onSuccess: (_res, doc) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", doc.orgId ?? ""] });
      toast({ title: "Document deleted" });
    },
    onError: (err: Error) => toast({ title: "Could not delete document", description: err.message }),
  });

  const documents = data ?? [];
  const filtersActive = orgId !== ALL || category !== ALL || search.trim() !== "";

  return (
    <div>
      <PageHeader
        title="Documents"
        actions={
          <Button className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" aria-hidden />
            Register document
          </Button>
        }
      />

      <ViewEnter>
      <Toolbar>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger size="sm" className="h-9 w-full text-body-sm sm:w-[220px]" aria-label="Filter by customer">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All customers</SelectItem>
            {(customers ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger size="sm" className="h-9 w-full text-body-sm sm:w-[210px]" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {DOCUMENT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search title or file…"
          ariaLabel="Search documents"
          className="sm:max-w-[260px]"
        />

        <div className="ml-auto flex items-center gap-2">
          {documents.length > 0 && (
            <p className="tnum whitespace-nowrap text-caption text-muted-foreground">
              {documents.length} {documents.length === 1 ? "document" : "documents"}
            </p>
          )}
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                setOrgId(ALL);
                setCategory(ALL);
                setSearch("");
              }}
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Button>
          )}
        </div>
      </Toolbar>

      {isError ? (
        <InlineError message={error instanceof Error ? error.message : "Could not load documents."} />
      ) : isLoading ? (
        <SectionCard>
          <RowsSkeleton rows={6} />
        </SectionCard>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={filtersActive ? "No matching documents" : "No documents yet"}
          action={
            filtersActive ? (
              <Button
                variant="outline"
                onClick={() => {
                  setOrgId(ALL);
                  setCategory(ALL);
                  setSearch("");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          {/* Desktop table */}
          <div className="hidden max-h-[60vh] overflow-auto md:block">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <TableRow className="hover:bg-transparent">
                  <Th>Document</Th>
                  <Th>Category</Th>
                  <Th>Customer</Th>
                  <Th>Related order</Th>
                  <Th>Uploaded by</Th>
                  <Th>Date</Th>
                  <Th>Size</Th>
                  <Th className="text-right">Actions</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <Td className="max-w-[260px] whitespace-normal">
                      <div className="flex items-center gap-2.5">
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{doc.title}</p>
                          <p className="truncate font-mono text-caption text-muted-foreground">{doc.fileName}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <DocumentCategoryBadge category={doc.category} />
                    </Td>
                    <Td className="max-w-[180px] truncate">{doc.orgName ?? "—"}</Td>
                    <Td className="whitespace-nowrap">
                      {doc.orderNumber ? <span className="font-mono text-body-sm">{doc.orderNumber}</span> : <span className="text-muted-foreground">—</span>}
                    </Td>
                    <Td className="max-w-[160px] truncate text-muted-foreground">{doc.uploadedBy}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{formatDate(doc.createdAt)}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{doc.sizeLabel}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          aria-label={`Preview ${doc.title}`}
                          onClick={() => setPreview(doc)}
                        >
                          <Eye className="size-3.5" aria-hidden />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                              aria-label={`Delete ${doc.title}`}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
                              <AlertDialogDescription className="leading-relaxed">
                                The document is removed from the customer’s document centre immediately. This cannot be
                                undone. Re-register the file if it is needed again.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep document</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(doc)}
                              >
                                {remove.isPending ? "Deleting…" : "Yes, delete document"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <ul className="space-y-3 p-4 md:hidden">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-[14px] border bg-card p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium">{doc.title}</p>
                    <p className="truncate font-mono text-caption text-muted-foreground">{doc.fileName}</p>
                  </div>
                  <DocumentCategoryBadge category={doc.category} />
                </div>
                <p className="mt-1.5 text-caption text-muted-foreground">
                  {doc.orgName ?? "—"} · {formatDate(doc.createdAt)} · {doc.sizeLabel}
                  {doc.orderNumber ? ` · ${doc.orderNumber}` : ""}
                </p>
                <div className="mt-3 flex justify-end gap-1.5">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPreview(doc)}>
                    <Eye className="size-3.5" aria-hidden /> Preview
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]">
                        <Trash2 className="size-3.5" aria-hidden /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
                        <AlertDialogDescription className="leading-relaxed">
                          The document disappears from the customer’s portal immediately and this cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep document</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
                          onClick={() => remove.mutate(doc)}
                        >
                          Yes, delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      </ViewEnter>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} customers={customers ?? []} />

      {/* Preview dialog */}
      <Dialog open={preview !== null} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          {preview && (
            <>
              <DialogHeader className="border-b pb-4">
                <DialogTitle>{preview.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2 text-body-sm">
                  <DocumentCategoryBadge category={preview.category} />
                  <span className="font-mono text-muted-foreground">{preview.fileName}</span>
                </DialogDescription>
              </DialogHeader>
              <dl className="space-y-0">
                {[
                  ["Customer", preview.orgName ?? "—"],
                  ["Version", `v${preview.version}`],
                  ["Size", preview.sizeLabel],
                  ["Uploaded by", preview.uploadedBy],
                  ["Uploaded", formatDateTime(preview.createdAt)],
                  ["Related order", preview.orderNumber ?? "—"],
                  ["Related quote", preview.quoteNumber ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
                    <dt className="text-micro text-muted-foreground">{label}</dt>
                    <dd className="text-right text-body-sm text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              {preview.description && (
                <div className="rounded-md border bg-secondary/50 p-3.5">
                  <GroupLabel className="mb-1">Description</GroupLabel>
                  <p className="text-body-sm leading-relaxed text-foreground/85">{preview.description}</p>
                </div>
              )}
              <DialogFooter className="border-t pt-4">
                <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Upload (register) dialog ─────────────────────────────────────────────────

/** Human-readable file size for the metadata-only registration model. */
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function UploadDialog({
  open,
  onOpenChange,
  customers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: CustomerListItem[];
}) {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState("");
  const [category, setCategory] = useState<string>("INVOICE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [orderId, setOrderId] = useState<string>("NONE");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Drop/browse fills the metadata fields only — no file contents leave
  // the browser (the registry stays honest until real storage lands).
  function acceptFile(file: File) {
    setFileName(file.name);
    setSizeLabel(formatFileSize(file.size));
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]*$/, ""));
    }
    toast({ title: "File attached" });
  }

  // Orders of the chosen organization — for linking the document.
  const { data: orgOrders } = useQuery({
    queryKey: ["admin", "orders", { status: "", search: "", orgId }],
    queryFn: () => api.get<OrderListItem[]>(`/api/admin/orders?orgId=${orgId}`),
    enabled: Boolean(orgId),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/admin/documents", {
        orgId,
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        fileName: fileName.trim(),
        sizeLabel: sizeLabel.trim() || "—",
        orderId: orderId === "NONE" ? undefined : orderId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", orgId] });
      toast({ title: "Document registered" });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function resetForm() {
    setOrgId("");
    setCategory("INVOICE");
    setTitle("");
    setDescription("");
    setFileName("");
    setSizeLabel("");
    setOrderId("NONE");
    setSubmitError(null);
    create.reset();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!orgId) {
      setSubmitError("Choose the customer this document belongs to.");
      return;
    }
    if (!title.trim() || !fileName.trim()) {
      setSubmitError("Title and file name are required.");
      return;
    }
    create.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>Register document</DialogTitle>
          </DialogHeader>

          <div>
            <button
              type="button"
              aria-label="Choose a file"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files[0];
                if (file) acceptFile(file);
              }}
              className={cn(
                "flex w-full flex-col items-center gap-1.5 rounded-[12px] border border-dashed p-6 text-center transition-colors",
                dragActive ? "border-ring bg-accent/50" : "border-border hover:border-ring/50 hover:bg-accent/30",
              )}
            >
              <UploadCloud className="size-5 text-muted-foreground" aria-hidden />
              <span className="text-body-sm font-medium text-foreground">Drop a file or click to browse</span>
              {fileName && (
                <span className="font-mono text-caption text-muted-foreground">
                  {fileName}
                  {sizeLabel ? ` · ${sizeLabel}` : ""}
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) acceptFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-org" className="text-body-sm">Customer <span className="text-[var(--status-danger-fg)]">*</span></Label>
              <Select value={orgId} onValueChange={(v) => { setOrgId(v); setOrderId("NONE"); }}>
                <SelectTrigger id="doc-org" className="h-9 w-full text-body-sm" aria-label="Customer">
                  <SelectValue placeholder="Choose a customer…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · <span className="font-mono text-caption text-muted-foreground">{c.code}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-category" className="text-body-sm">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="doc-category" className="h-9 w-full text-body-sm" aria-label="Document category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {DOCUMENT_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-size" className="text-body-sm">Size label</Label>
              <Input id="doc-size" value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} placeholder="148 KB" className="h-9 text-body-sm" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-title" className="text-body-sm">Title</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Statement of account, October" className="h-9 text-body-sm" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-file" className="text-body-sm">File name</Label>
              <Input id="doc-file" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g. INV-2024-0321.pdf" className="h-9 font-mono text-body-sm" required />
              <p className="text-caption text-muted-foreground">
                The file name is shown to the customer. File storage arrives with the production release.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-desc" className="text-body-sm">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="doc-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this document covers…" className="text-body-sm" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-order" className="text-body-sm">Link to an order <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={orderId} onValueChange={setOrderId} disabled={!orgId}>
                <SelectTrigger id="doc-order" className="h-9 w-full text-body-sm" aria-label="Related order">
                  <SelectValue placeholder={orgId ? "No related order" : "Choose a customer first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No related order</SelectItem>
                  {(orgOrders ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.orderNumber} · {o.itemSummary}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orgId && (orgOrders ?? []).length === 0 && (
                <p className="text-caption text-muted-foreground">This customer has no orders yet.</p>
              )}
            </div>
          </div>

          {submitError && <FieldError>{submitError}</FieldError>}

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="gap-1.5" disabled={create.isPending}>
              {create.isPending ? <span className="tnum">Registering…</span> : <><Plus className="size-4" aria-hidden /> Register document</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
