"use client";

// Administration — product catalogue management: search + category filter,
// create/edit product dialogs (the edit dialog IS the detail editor) and
// archive toggles.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Package,
  PencilLine,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { StockBadge } from "@/components/shared/status-badge";
import { ProductArtwork } from "@/components/shared/product-artwork";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import type { AdminProduct, CategoryDto } from "@/types";
import {
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
import { ProductFormDialog } from "./product-form-dialog";

const ALL = "ALL";

export function AdminProductsView() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const { data: categories } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.get<{ categories: CategoryDto[] }>("/api/admin/settings"),
  });

  const params = new URLSearchParams();
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  if (category !== ALL) params.set("category", category);
  const qs = params.toString();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "products", { search: debouncedSearch.trim(), category }],
    queryFn: () => api.get<AdminProduct[]>(`/api/admin/products${qs ? `?${qs}` : ""}`),
  });

  const queryClient = useQueryClient();
  const archive = useMutation({
    mutationFn: (payload: { id: string; archive: boolean; sku: string }) =>
      api.post<{ ok: boolean }>(`/api/admin/products/${payload.id}/archive`, { archive: payload.archive }),
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast({
        title: payload.archive ? "Product archived" : "Product restored",
      });
    },
    onError: (err: Error) => toast({ title: "Could not archive product", description: err.message }),
  });

  const products = data ?? [];
  const filtersActive = search.trim() !== "" || category !== ALL;
  const categoryList = categories?.categories ?? [];

  return (
    <div>
      <PageHeader
        title="Products"
        actions={
          <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New product
          </Button>
        }
      />

      <ViewEnter>
      <Toolbar>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger size="sm" className="h-9 w-full sm:w-[240px] text-body-sm" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categoryList.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search name or SKU…"
          ariaLabel="Search products"
          className="sm:max-w-[280px]"
        />

        <div className="ml-auto flex items-center gap-2">
          {products.length > 0 && (
            <p className="tnum whitespace-nowrap text-caption text-muted-foreground">
              {products.length} {products.length === 1 ? "product" : "products"}
            </p>
          )}
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                setSearch("");
                setCategory(ALL);
              }}
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Button>
          )}
        </div>
      </Toolbar>

      {isError ? (
        <InlineError message={error instanceof Error ? error.message : "Could not load products."} />
      ) : isLoading ? (
        <SectionCard>
          <RowsSkeleton rows={7} />
        </SectionCard>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={filtersActive ? "No matching products" : "No products yet"}
          action={
            filtersActive ? (
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
        <SectionCard bodyClassName="p-0">
          {/* Desktop table */}
          <div className="hidden max-h-[60vh] overflow-auto md:block">
            <Table className="min-w-[980px]">
              <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <TableRow className="hover:bg-transparent">
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th>Category</Th>
                  <Th className="text-right">Default price</Th>
                  <Th>Stock</Th>
                  <Th>MOQ / Increment</Th>
                  <Th className="text-right">Customers</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <Td className="max-w-[260px] whitespace-normal">
                      <div className="flex items-center gap-3">
                        <ProductArtwork sku={p.sku} compact className="h-10 w-10 shrink-0 p-1.5" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="truncate text-caption text-muted-foreground">{p.shortDescription}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-body-sm">{p.sku}</span>
                    </Td>
                    <Td className="text-muted-foreground">{p.categoryName}</Td>
                    <Td className="text-right">
                      {p.defaultPriceCents !== null ? (
                        <Money cents={p.defaultPriceCents} />
                      ) : (
                        <span className="text-caption text-muted-foreground">Quote</span>
                      )}
                    </Td>
                    <Td>
                      <StockBadge status={p.stockStatus} />
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      <span className="tnum">{p.minOrderQty.toLocaleString()}</span> /{" "}
                      <span className="tnum">+{p.increment.toLocaleString()}</span>
                    </Td>
                    <Td className="tnum text-right text-muted-foreground">
                      <span title="Approved customers">{p.approvedOrgCount}</span>
                      {p.customPriceCount > 0 && (
                        <span className="ml-1.5 text-caption text-kraft-ink" title="Customers with custom pricing">
                          · {p.customPriceCount} custom
                        </span>
                      )}
                    </Td>
                    <Td>
                      {p.isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-done-bg)] px-2 py-0.5 text-caption font-medium text-[var(--status-done-fg)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-2 py-0.5 text-caption font-medium text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                          Archived
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEditing(p)}
                        >
                          <PencilLine className="size-3.5" aria-hidden />
                        </Button>
                        {p.isActive ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                                aria-label={`Archive ${p.name}`}
                              >
                                <Archive className="size-3.5" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Archive {p.name}?</AlertDialogTitle>
                                <AlertDialogDescription className="leading-relaxed">
                                  The product disappears from active catalogues and new orders, but existing orders,
                                  documents and custom pricing are preserved. You can restore it at any time.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep active</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
                                  disabled={archive.isPending}
                                  onClick={() => archive.mutate({ id: p.id, archive: true, sku: p.sku })}
                                >
                                  Yes, archive product
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-[var(--status-done-fg)]"
                            aria-label={`Restore ${p.name}`}
                            disabled={archive.isPending}
                            onClick={() => archive.mutate({ id: p.id, archive: false, sku: p.sku })}
                          >
                            <ArchiveRestore className="size-3.5" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <ul className="space-y-3 p-4 md:hidden">
            {products.map((p) => (
              <li key={p.id} className="rounded-[14px] border bg-card p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <ProductArtwork sku={p.sku} compact className="h-12 w-12 shrink-0 p-1.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">{p.name}</p>
                    <p className="font-mono text-caption text-muted-foreground">
                      {p.sku} · {p.categoryName}
                    </p>
                  </div>
                  {p.isActive ? <StockBadge status={p.stockStatus} /> : null}
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-caption text-muted-foreground">
                  <span>
                    {p.defaultPriceCents !== null ? <Money cents={p.defaultPriceCents} /> : "Quote required"}
                    {` · MOQ ${p.minOrderQty.toLocaleString()}`}
                  </span>
                  <span>{p.approvedOrgCount} customers</span>
                </div>
                <div className="mt-3 flex justify-end gap-1.5">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(p)}>
                    <PencilLine className="size-3.5" aria-hidden /> Edit
                  </Button>
                  {p.isActive ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]">
                          <Archive className="size-3.5" aria-hidden /> Archive
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Archive {p.name}?</AlertDialogTitle>
                          <AlertDialogDescription className="leading-relaxed">
                            The product disappears from active catalogues and new orders. Existing data is preserved and
                            you can restore it at any time.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep active</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
                            onClick={() => archive.mutate({ id: p.id, archive: true, sku: p.sku })}
                          >
                            Yes, archive
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-[var(--status-done-fg)] hover:bg-[var(--status-done-bg)]"
                      onClick={() => archive.mutate({ id: p.id, archive: false, sku: p.sku })}
                    >
                      <ArchiveRestore className="size-3.5" aria-hidden /> Restore
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      </ViewEnter>

      {/* Create / edit dialogs (shared form; loads its own categories) */}
      <ProductFormDialog key="create" open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing && (
        <ProductFormDialog
          key={`edit-${editing.id}`}
          product={editing}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
