"use client";

// Product detail — artwork, specification table, pricing block, quantity
// selector and add-to-order; quote-only products route to a quotation request.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Check, FileText, Plus, ShoppingCart, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { StockBadge } from "@/components/shared/status-badge";
import { ProductArtwork } from "@/components/shared/product-artwork";
import { api } from "@/lib/api-client";
import { useAppStore, useCartStore } from "@/store/app-store";
import type { ProductDetail } from "@/types";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ErrorAlert, DetailRow, FavouriteHeart, Mono, QtyStepper, SectionCard, useFavourites } from "./portal-bits";

const EASE = [0.22, 1, 0.36, 1] as const;

// Corner crop marks for the artwork stage — registration-style "+" glyphs.
function CropMark({ className }: { className?: string }) {
  return (
    <Plus
      aria-hidden
      className={cn("pointer-events-none absolute size-3 text-foreground/20", className)}
      strokeWidth={1.5}
    />
  );
}

export function ProductDetailView({ productId }: { productId: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const addLine = useCartStore((s) => s.addLine);
  const [qty, setQty] = useState<number | null>(null);
  const [added, setAdded] = useState(false);
  const reduce = useReducedMotion();
  const { canSave, isFavourite, toggle, busy: favouriteBusy } = useFavourites();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const { data: product, isLoading, error, refetch } = useQuery({
    queryKey: ["products", "detail", productId],
    queryFn: () => api.get<ProductDetail>(`/api/customer/products/${productId}`),
  });

  if (error) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Product" onBack={back} />
        <ErrorAlert
          message={error instanceof Error ? error.message : "We could not load this product."}
          onRetry={() => refetch()}
        />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate("catalog")}>
            Back to products
          </Button>
        </div>
      </motion.div>
    );
  }

  if (isLoading || !product) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Product" onBack={back} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Skeleton className="aspect-[4/3] w-full rounded-[14px]" />
            <Skeleton className="h-28 w-full rounded-[14px]" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full rounded-[14px]" />
            <Skeleton className="h-32 w-full rounded-[14px]" />
          </div>
        </div>
      </motion.div>
    );
  }

  // Seed the quantity input once product data arrives.
  const p = product;
  const effectiveQty = qty ?? p.minOrderQty;
  const quoteOnly = p.priceCents === null;

  const addToCart = () => {
    if (quoteOnly || p.priceCents === null) return;
    addLine({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      unitPriceCents: p.priceCents,
      qty: effectiveQty,
      minOrderQty: p.minOrderQty,
      increment: p.increment,
      casePack: p.casePack,
      unit: p.unit,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
    toast({ title: "Added to cart" });
  };

  return (
    <motion.div {...enter}>
      <PageHeader
        title={product.name}
        onBack={back}
        actions={
          <>
            {canSave && (
              <FavouriteHeart
                active={isFavourite(product.id)}
                busy={favouriteBusy}
                product={product}
                onToggle={() => toggle(product, effectiveQty)}
                className="size-9 border shadow-xs"
              />
            )}
            <StockBadge status={product.stockStatus} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        {/* ── Left: artwork stage + details ── */}
        <div className="space-y-8">
          <div className="relative rounded-[14px] bg-surface-sunken p-5 sm:p-8">
            <CropMark className="left-2.5 top-2.5" />
            <CropMark className="right-2.5 top-2.5" />
            <CropMark className="bottom-2.5 left-2.5" />
            <CropMark className="bottom-2.5 right-2.5" />
            <ProductArtwork sku={product.sku} className="rounded-[10px]" />
          </div>
          <SectionCard title="Details">
            <dl className="m-0">
              <DetailRow label="Dimensions">{product.dimensions}</DetailRow>
              <DetailRow label="Material">{product.material}</DetailRow>
              <DetailRow label="Colour">{product.colour}</DetailRow>
              {product.leadTimeNote && <DetailRow label="Lead time">{product.leadTimeNote}</DetailRow>}
            </dl>
          </SectionCard>
        </div>

        {/* ── Right: identity, description, spec, pricing + order controls ── */}
        <div className="min-w-0 space-y-8">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <Mono className="text-muted-foreground">{product.sku}</Mono>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="text-caption text-muted-foreground">
                Case pack of {product.casePack.toLocaleString()} · sold per {product.unit}
              </span>
            </p>
            {product.description && (
              <p className="mt-2.5 max-w-2xl text-body text-pretty leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            )}
          </div>

          <SectionCard title="Specification" contentClassName="px-4 py-1 sm:px-5">
            <dl className="m-0">
              <DetailRow label="Dimensions">{product.dimensions}</DetailRow>
              <DetailRow label="Material">{product.material}</DetailRow>
              <DetailRow label="Colour">{product.colour}</DetailRow>
              <DetailRow label="Printing options">{product.printingOptions}</DetailRow>
              <DetailRow label="Case pack">{product.casePack.toLocaleString()} per case</DetailRow>
              <DetailRow label="Cases per pallet">
                {product.palletPack ? `${product.palletPack.toLocaleString()} cases` : null}
              </DetailRow>
              <DetailRow label="Unit">{product.unit}</DetailRow>
              <DetailRow label="Minimum order">{product.minOrderQty.toLocaleString()}</DetailRow>
              <DetailRow label="Order increment">{product.increment.toLocaleString()}</DetailRow>
              <DetailRow label="Availability">
                <StockBadge status={product.stockStatus} />
              </DetailRow>
            </dl>
          </SectionCard>

          {/* Pricing + order panel */}
          {quoteOnly ? (
            <div className="rounded-[14px] border border-kraft/40 bg-kraft-soft/60 p-5">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-kraft-ink" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-kraft-ink">This product requires a quote</p>
                  <p className="mt-1 text-body-sm text-pretty leading-relaxed text-kraft-ink/80">
                    Pricing is set per order based on quantity, print and freight.
                  </p>
                  <Button
                    className="mt-3.5 gap-2"
                    onClick={() => navigate("quotations", { aux: product.name })}
                  >
                    <FileText className="size-4" aria-hidden />
                    Request a quote
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <SectionCard title="Pricing">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="flex items-baseline gap-2">
                    <Money
                      cents={product.priceCents}
                      className="font-display text-numeral font-normal tracking-[-0.01em]"
                    />
                    <span className="text-caption text-muted-foreground">per {product.unit}</span>
                  </div>
                  <p className="mt-1.5 inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex h-[22px] items-center rounded-full px-2.5 text-caption font-medium",
                        product.priceSource === "CUSTOMER"
                          ? "border border-kraft/40 bg-kraft-soft text-kraft-ink"
                          : "border bg-card text-muted-foreground",
                      )}
                    >
                      {product.priceSource === "CUSTOMER" ? "Your price" : "List price"}
                    </span>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pd-qty" className="block text-micro text-muted-foreground">
                    Quantity
                  </label>
                  <QtyStepper
                    value={effectiveQty}
                    onChange={(n) => setQty(n)}
                    min={product.minOrderQty}
                    increment={product.increment}
                    ariaLabel={`Quantity of ${product.name}`}
                  />
                  <p className="text-caption text-muted-foreground">
                    Minimum {product.minOrderQty.toLocaleString()} · multiples of{" "}
                    {product.increment.toLocaleString()} · case pack {product.casePack.toLocaleString()}
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" className="gap-2" onClick={addToCart}>
                  {added ? (
                    <>
                      <Check className="size-4" aria-hidden /> Added to cart
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="size-4" aria-hidden /> Add to order
                    </>
                  )}
                </Button>
                <Button variant="outline" size="lg" onClick={() => navigate("cart")}>
                  View cart
                </Button>
                <span className="tnum text-caption text-muted-foreground">
                  Est. line total:{" "}
                  <Money cents={effectiveQty * (product.priceCents ?? 0)} className="font-medium text-foreground" />
                </span>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Sticky add-to-order bar — keeps the CTA reachable while scrolling on mobile */}
      {!quoteOnly && (
        <div className="sticky bottom-4 z-30 mt-6 flex items-center justify-between gap-3 rounded-[14px] border bg-card p-3 shadow-lg lg:hidden">
          <div className="min-w-0">
            <Money cents={product.priceCents} className="text-body font-semibold" />
            <p className="text-caption text-muted-foreground">per {product.unit}</p>
          </div>
          <Button className="shrink-0 gap-2" onClick={addToCart}>
            {added ? (
              <>
                <Check className="size-4" aria-hidden /> Added
              </>
            ) : (
              <>
                <ShoppingCart className="size-4" aria-hidden /> Add to order
              </>
            )}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
