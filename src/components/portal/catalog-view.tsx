"use client";

// Product catalogue — sticky filter bar (search / category / sort), responsive
// product grid with cards, and an honest "showing X of Y" count.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronRight, Heart, LayoutGrid, List, PackagePlus, PackageSearch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastAction } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { StockBadge } from "@/components/shared/status-badge";
import { ProductArtwork } from "@/components/shared/product-artwork";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useAppStore, useCartStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CategoryDto, ProductListItem } from "@/types";
import { Chip, ErrorAlert, FavouriteHeart, Mono, QtyStepper, useFavourites } from "./portal-bits";
import { ProductRequestSheet } from "./product-request-sheet";

const ALL = "all";
const VIEW_STORAGE_KEY = "clienthub-catalog-view";

const SORTS = [
  { value: "name", label: "Name A-Z" },
  { value: "sku", label: "SKU" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

// Kraft outline tag — products sold by quotation only.
function QuoteRequiredTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-full border border-kraft/40 px-2.5 text-caption font-medium text-kraft-ink",
        className,
      )}
    >
      Quote required
    </span>
  );
}

export function CatalogView() {
  const navigate = useAppStore((s) => s.navigate);
  const session = useAppStore((s) => s.session);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [sort, setSort] = useState<string>("name");
  const [viewMode, setViewModeState] = useState<"grid" | "list">("grid");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const { canSave, savedRows, savedIds, isFavourite, toggle, busy: favouriteBusy } = useFavourites();

  // Product requests are a write action — hidden for read-only users.
  const canRequestProduct = session?.user.orgRole === "ORG_ADMIN" || session?.user.orgRole === "PURCHASING";
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [requestInitialName, setRequestInitialName] = useState<string | undefined>();

  const openProductRequest = (name?: string) => {
    setRequestInitialName(name);
    setRequestSheetOpen(true);
  };
  const handleRequestSheetChange = (open: boolean) => {
    setRequestSheetOpen(open);
    if (!open) setRequestInitialName(undefined);
  };

  // Restore the persisted grid/list choice (post-mount for SSR safety).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(VIEW_STORAGE_KEY);
    } catch {
      // storage unavailable (private mode) — keep the default
    }
    if (stored === "grid" || stored === "list") {
      const id = window.requestAnimationFrame(() => setViewModeState(stored as "grid" | "list"));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  const setViewMode = (mode: "grid" | "list") => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // storage unavailable — preference simply not persisted
    }
  };

  // "/" focuses the search field (ignored while typing in another field or
  // while any dialog / sheet / select overlay is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target === searchRef.current ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector("[data-state=open]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const rise: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
  };
  const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  // Debounce the search input ~300ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (category !== ALL) p.set("category", category);
    p.set("sort", sort);
    return p.toString();
  }, [debouncedSearch, category, sort]);

  const { data: products, isLoading, error, refetch } = useQuery({
    queryKey: ["products", "list", { params }],
    queryFn: () => api.get<ProductListItem[]>(`/api/customer/products?${params}`),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<CategoryDto[]>("/api/customer/categories"),
  });

  // Unfiltered count for the "Showing X of Y" line.
  const { data: allProducts } = useQuery({
    queryKey: ["products", "list", { params: "sort=name" }],
    queryFn: () => api.get<ProductListItem[]>("/api/customer/products?sort=name"),
  });

  const hasFilters = debouncedSearch !== "" || category !== ALL || favouritesOnly;
  const total = allProducts?.length ?? 0;

  // Favourites is a separate toggle that overrides the category selection;
  // picking either side clears the other.
  const visibleProducts = useMemo(
    () => (favouritesOnly ? (products ?? []).filter((p) => savedIds.has(p.id)) : (products ?? [])),
    [products, favouritesOnly, savedIds],
  );

  const selectCategory = (cat: string) => {
    setFavouritesOnly(false);
    setCategory(cat);
  };

  // Per-category counts from the unfiltered catalogue (chips show live totals).
  const countFor = (cat: string) =>
    cat === ALL ? total : (allProducts ?? []).filter((p) => p.categoryId === cat).length;

  return (
    <motion.div {...enter}>
      <PageHeader title="Products" />

      {/* Sticky filter bar — search left, category chips, compact sort, layout toggle */}
      <div className="sticky top-[65px] z-20 -mx-4 mb-6 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU or description…"
              className="pl-9"
              aria-label="Search products"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-[150px] shrink-0" aria-label="Sort products">
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
          <div
            role="group"
            aria-label="Layout"
            className="flex shrink-0 rounded-md border bg-card p-0.5 shadow-xs"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={viewMode === "grid"}
              aria-label="Grid layout"
              onClick={() => setViewMode("grid")}
              className={cn("rounded-[6px]", viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              <LayoutGrid className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={viewMode === "list"}
              aria-label="List layout"
              onClick={() => setViewMode("list")}
              className={cn("rounded-[6px]", viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              <List className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        {/* Category chips — favourites first, horizontally scrollable, with counts */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
          {canSave && (
            <button
              type="button"
              onClick={() => {
                setFavouritesOnly((v) => !v);
                setCategory(ALL);
              }}
              aria-pressed={favouritesOnly}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
                favouritesOnly
                  ? "bg-kraft-strong text-white"
                  : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Heart
                className="size-3.5"
                fill={favouritesOnly ? "currentColor" : "none"}
                aria-hidden
              />
              Favourites
              {savedRows.length > 0 && <span className="tnum">{savedRows.length}</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => selectCategory(ALL)}
            aria-pressed={category === ALL && !favouritesOnly}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
              category === ALL && !favouritesOnly
                ? "bg-foreground text-background"
                : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            All categories
            {allProducts !== undefined && <span className="tnum">{countFor(ALL)}</span>}
          </button>
          {(categories ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCategory(c.id)}
              aria-pressed={category === c.id && !favouritesOnly}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
                category === c.id && !favouritesOnly
                  ? "bg-foreground text-background"
                  : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {c.name}
              {allProducts !== undefined && <span className="tnum">{countFor(c.id)}</span>}
            </button>
          ))}
        </div>
        {products !== undefined && (
          <p className="mt-2 text-caption text-muted-foreground">
            {hasFilters ? (
              <>
                Showing {visibleProducts.length} of {favouritesOnly ? savedRows.length : total}{" "}
                {favouritesOnly ? "favourites" : "products"}
                {debouncedSearch && <> for “{debouncedSearch}”</>}
              </>
            ) : (
              <>Showing {visibleProducts.length} products</>
            )}
          </p>
        )}
      </div>

      {error ? (
        <ErrorAlert message="We could not load products." onRetry={() => refetch()} />
      ) : isLoading || !products ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-3 h-8 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleProducts.length === 0 ? (
        <EmptyState
          icon={favouritesOnly && savedRows.length === 0 ? Heart : PackageSearch}
          title={
            favouritesOnly && savedRows.length === 0
              ? "No favourites yet"
              : hasFilters
                ? "No products match"
                : "No products yet"
          }
          action={
            debouncedSearch !== "" && canRequestProduct ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => openProductRequest(debouncedSearch)}>
                  {`Request "${debouncedSearch}"`}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setCategory(ALL);
                    setFavouritesOnly(false);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : favouritesOnly && savedRows.length === 0 ? (
              <Button variant="outline" onClick={() => setFavouritesOnly(false)}>
                Browse products
              </Button>
            ) : hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory(ALL);
                  setFavouritesOnly(false);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate("quotations", { aux: "new" })}>
                Request a quote
              </Button>
            )
          }
        />
      ) : viewMode === "list" ? (
        <div>
          <ul className="divide-y overflow-hidden rounded-[14px] border bg-card shadow-xs">
            {visibleProducts.map((p) => (
              <li key={p.id} className="group relative">
                {/* Stretched link — the whole row opens the product */}
                <button
                  type="button"
                  onClick={() => navigate("product-detail", { id: p.id })}
                  className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35"
                  aria-label={`View ${p.name} (${p.sku}) details`}
                />
                <div className="pointer-events-none relative z-20 flex w-full flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 transition-colors group-hover:bg-accent/70 sm:px-5">
                  <ProductArtwork sku={p.sku} compact className="hidden shrink-0 sm:flex" />
                  <span className="min-w-[140px] flex-1 basis-40">
                    <span className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="text-body-sm font-semibold text-foreground">{p.name}</span>
                      <Mono className="text-muted-foreground">{p.sku}</Mono>
                    </span>
                    {p.shortDescription && (
                      <span className="mt-0.5 block truncate text-caption text-muted-foreground">
                        {p.shortDescription}
                      </span>
                    )}
                  </span>
                  <span className="hidden shrink-0 lg:block" title="Minimum order quantity">
                    <Chip>MOQ {p.minOrderQty.toLocaleString()}</Chip>
                  </span>
                  <span className="w-28 shrink-0 text-right sm:w-32">
                    {p.priceCents !== null ? (
                      <>
                        <Money cents={p.priceCents} className="text-body-sm font-semibold" />
                        <span className="block whitespace-nowrap text-caption text-muted-foreground">
                          per unit · {p.priceSource === "CUSTOMER" ? "your price" : "list"}
                        </span>
                      </>
                    ) : (
                      <QuoteRequiredTag />
                    )}
                  </span>
                  <span className="hidden shrink-0 md:inline-flex">
                    <StockBadge status={p.stockStatus} />
                  </span>
                  {p.priceCents !== null && <QuickAdd product={p} className="shrink-0" />}
                  {canSave && (
                    <span className="pointer-events-auto shrink-0">
                      <FavouriteHeart
                        active={isFavourite(p.id)}
                        busy={favouriteBusy}
                        product={p}
                        onToggle={() => toggle(p, p.minOrderQty)}
                      />
                    </span>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              </li>
            ))}
          </ul>
          {canRequestProduct && (
            <button
              type="button"
              onClick={() => openProductRequest()}
              className="group mt-4 flex w-full items-center gap-3 rounded-[14px] border border-dashed bg-card/60 px-4 py-3.5 text-left shadow-xs transition-colors hover:border-kraft/60 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-kraft/40 bg-kraft-soft text-kraft-ink">
                <PackagePlus className="size-4.5" aria-hidden />
              </span>
              <span className="text-body-sm font-medium text-foreground">Can&apos;t find it?</span>
              <span className="ml-auto text-body-sm font-medium text-primary underline-offset-4 group-hover:underline">
                Request a product
              </span>
            </button>
          )}
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleProducts.map((p, i) => (
            <motion.div key={p.id} variants={i < 8 ? rise : undefined} className="flex">
              <ProductCard
                product={p}
                onOpen={() => navigate("product-detail", { id: p.id })}
                favourite={canSave ? isFavourite(p.id) : null}
                favouriteBusy={favouriteBusy}
                onToggleFavourite={canSave ? () => toggle(p, p.minOrderQty) : null}
              />
            </motion.div>
          ))}
          {canRequestProduct && (
            <motion.div variants={rise} className="flex">
              <button
                type="button"
                onClick={() => openProductRequest()}
                className="group flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-2.5 rounded-[14px] border border-dashed bg-card/60 p-4 text-center shadow-xs transition-all duration-200 hover:-translate-y-px hover:border-kraft/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex size-11 items-center justify-center rounded-full border border-kraft/40 bg-kraft-soft text-kraft-ink">
                  <PackagePlus className="size-5" aria-hidden />
                </span>
                <span className="text-body-sm font-medium text-foreground">Can&apos;t find it?</span>
                <span className="text-body-sm font-medium text-primary underline-offset-4 group-hover:underline">
                  Request a product
                </span>
              </button>
            </motion.div>
          )}
        </motion.div>
      )}

      <ProductRequestSheet
        open={requestSheetOpen}
        onOpenChange={handleRequestSheetChange}
        initialName={requestInitialName}
      />
    </motion.div>
  );
}

// Compact stepper + Add button for quick-add from a card or list row.
// Only rendered for products with an effective price (quote-required keeps its tag).
function QuickAdd({ product, className }: { product: ProductListItem; className?: string }) {
  const navigate = useAppStore((s) => s.navigate);
  const [qty, setQty] = useState(product.minOrderQty);

  const addToCart = () => {
    useCartStore.getState().addLine({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unitPriceCents: product.priceCents ?? 0,
      qty,
      minOrderQty: product.minOrderQty,
      increment: product.increment,
      casePack: product.casePack,
      unit: product.unit,
    });
    toast({
      title: "Added",
      action: (
        <ToastAction altText="View cart" onClick={() => navigate("cart")}>
          View cart
        </ToastAction>
      ),
    });
  };

  return (
    <div className={cn("pointer-events-auto flex flex-wrap items-center gap-2", className)}>
      <QtyStepper
        size="sm"
        value={qty}
        onChange={setQty}
        min={product.minOrderQty}
        increment={product.increment}
        ariaLabel={`Quantity of ${product.name}`}
      />
      <Button
        size="sm"
        className="h-8 shrink-0 gap-1.5"
        aria-label={`Add ${product.name} to cart`}
        onClick={addToCart}
      >
        Add
      </Button>
    </div>
  );
}

function ProductCard({
  product,
  onOpen,
  favourite,
  favouriteBusy,
  onToggleFavourite,
}: {
  product: ProductListItem;
  onOpen: () => void;
  /** null ⇒ hearts hidden (read-only user). */
  favourite: boolean | null;
  favouriteBusy?: boolean;
  onToggleFavourite: (() => void) | null;
}) {
  return (
    <article className="group relative flex h-full w-full flex-col overflow-hidden rounded-[14px] border bg-card shadow-xs transition-all duration-200 hover:-translate-y-px hover:shadow-md">
      {/* Stretched link — the whole card opens the product */}
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 z-10 rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`View ${product.name} (${product.sku}) details`}
      />
      {/* Artwork — wrapper lets the heart sit above the stretched link
          while clicks on the artwork still open the product */}
      <div className="pointer-events-none relative z-20">
        <ProductArtwork
          sku={product.sku}
          className="rounded-none border-0 border-b transition-transform duration-200 group-hover:scale-[1.03]"
        />
        {onToggleFavourite !== null && favourite !== null && (
          <span className="pointer-events-auto absolute right-2 top-2">
            <FavouriteHeart
              active={favourite}
              busy={favouriteBusy}
              product={product}
              onToggle={onToggleFavourite}
              className="size-8 rounded-full border bg-card/90 shadow-xs backdrop-blur-sm hover:bg-card"
            />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-body font-semibold leading-snug text-foreground">{product.name}</h3>
        <Mono className="mt-0.5 block text-muted-foreground">{product.sku}</Mono>
        {product.shortDescription && (
          <p className="mt-1.5 line-clamp-1 text-caption text-muted-foreground">
            {product.shortDescription}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip title="Minimum order quantity">MOQ {product.minOrderQty.toLocaleString()}</Chip>
          {product.dimensions && <Chip title={product.dimensions}>{product.dimensions}</Chip>}
          {product.material && <Chip title={product.material}>{product.material}</Chip>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div className="min-w-0">
            {product.priceCents !== null ? (
              <>
                <Money cents={product.priceCents} className="text-body font-semibold" />
                <p className="text-caption text-muted-foreground">
                  per unit · {product.priceSource === "CUSTOMER" ? "your price" : "list price"}
                </p>
              </>
            ) : (
              <QuoteRequiredTag />
            )}
          </div>
          <StockBadge status={product.stockStatus} />
        </div>
      </div>
      {/* Footer — above the stretched link so its controls stay clickable */}
      {product.priceCents !== null ? (
        <div className="pointer-events-none relative z-20 flex items-center gap-2 border-t bg-surface-sunken/50 px-4 py-2.5 text-caption font-medium text-foreground">
          <span className="hidden truncate md:inline">View product</span>
          <QuickAdd product={product} className="ml-auto" />
        </div>
      ) : (
        <div className="pointer-events-none flex items-center justify-between border-t bg-surface-sunken/50 px-4 py-2.5 text-caption font-medium text-foreground">
          <span>View product</span>
          <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </div>
      )}
    </article>
  );
}
