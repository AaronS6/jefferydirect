"use client";

// Product create / edit dialog — extracted from the products view so other
// admin screens can reuse it (quote detail's "Add to catalogue" flow).
// Loads its own categories, validates, then POSTs or PUTs to /api/admin/products.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { centsToInputValue, parseDollarsToCents } from "@/lib/money";
import { STOCK_STATUSES, STOCK_STATUS_LABELS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import type { AdminProduct, CategoryDto } from "@/types";
import { FieldError, GroupLabel } from "./admin-ui";

const UNITS = ["each", "case"] as const;

type ProductForm = {
  sku: string;
  name: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  material: string;
  dimensions: string;
  colour: string;
  printingOptions: string;
  casePack: string;
  palletPack: string;
  minOrderQty: string;
  increment: string;
  unit: string;
  defaultPrice: string;
  stockStatus: string;
  leadTimeNote: string;
};

const EMPTY_PRODUCT_FORM: ProductForm = {
  sku: "",
  name: "",
  categoryId: "",
  shortDescription: "",
  description: "",
  material: "",
  dimensions: "",
  colour: "",
  printingOptions: "",
  casePack: "100",
  palletPack: "",
  minOrderQty: "500",
  increment: "100",
  unit: "each",
  defaultPrice: "",
  stockStatus: "IN_STOCK",
  leadTimeNote: "",
};

/** Values used to seed a fresh create form (a product prop still wins when editing). */
export type ProductFormPrefill = {
  name?: string;
  categoryId?: string;
  shortDescription?: string;
  description?: string;
  material?: string;
  dimensions?: string;
};

export function ProductFormDialog({
  open,
  onClose,
  product,
  onSaved,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  product?: AdminProduct;
  /** Called with the saved product's id (after invalidations, before the dialog closes). */
  onSaved?: (saved: { id: string }) => void;
  prefill?: ProductFormPrefill;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(product);

  const { data: settings } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.get<{ categories: CategoryDto[] }>("/api/admin/settings"),
  });
  const categories = settings?.categories ?? [];

  const [form, setForm] = useState<ProductForm>(() =>
    product
      ? {
          sku: product.sku,
          name: product.name,
          categoryId: product.categoryId,
          shortDescription: product.shortDescription,
          description: product.description,
          material: product.material ?? "",
          dimensions: product.dimensions ?? "",
          colour: product.colour ?? "",
          printingOptions: product.printingOptions ?? "",
          casePack: String(product.casePack),
          palletPack: product.palletPack != null ? String(product.palletPack) : "",
          minOrderQty: String(product.minOrderQty),
          increment: String(product.increment),
          unit: product.unit,
          defaultPrice: product.defaultPriceCents != null ? centsToInputValue(product.defaultPriceCents) : "",
          stockStatus: product.stockStatus,
          leadTimeNote: product.leadTimeNote ?? "",
        }
      : prefill
        ? {
            ...EMPTY_PRODUCT_FORM,
            name: prefill.name ?? "",
            categoryId: prefill.categoryId ?? "",
            shortDescription: prefill.shortDescription ?? "",
            description: prefill.description ?? "",
            material: prefill.material ?? "",
            dimensions: prefill.dimensions ?? "",
          }
        : { ...EMPTY_PRODUCT_FORM },
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const parsedPrice = form.defaultPrice.trim() === "" ? null : parseDollarsToCents(form.defaultPrice);
  const priceInvalid = form.defaultPrice.trim() !== "" && parsedPrice === null;

  const save = useMutation<{ ok: boolean } | { id: string }, Error>({
    mutationFn: async (): Promise<{ ok: boolean } | { id: string }> => {
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),
        material: form.material.trim() || null,
        dimensions: form.dimensions.trim() || null,
        colour: form.colour.trim() || null,
        printingOptions: form.printingOptions.trim() || null,
        casePack: Number.parseInt(form.casePack, 10),
        palletPack: form.palletPack.trim() === "" ? null : Number.parseInt(form.palletPack, 10),
        minOrderQty: Number.parseInt(form.minOrderQty, 10),
        increment: Number.parseInt(form.increment, 10),
        unit: form.unit,
        defaultPriceCents: form.defaultPrice.trim() === "" ? null : parsedPrice,
        stockStatus: form.stockStatus,
        leadTimeNote: form.leadTimeNote.trim() || null,
      };
      return isEdit
        ? api.put<{ ok: boolean }>(`/api/admin/products/${product!.id}`, payload)
        : api.post<{ id: string }>("/api/admin/products", payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      onSaved?.({ id: isEdit ? product!.id : (res as { id: string }).id });
      onClose();
      toast({
        title: isEdit ? "Product updated" : "Product created",
      });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const set =
    (key: keyof ProductForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!form.sku.trim() || !form.name.trim() || !form.categoryId || !form.shortDescription.trim() || !form.description.trim()) {
      setSubmitError("SKU, name, category and both descriptions are required.");
      return;
    }
    for (const [label, raw] of [
      ["Case pack", form.casePack],
      ["Minimum order quantity", form.minOrderQty],
      ["Quantity increment", form.increment],
    ] as const) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) {
        setSubmitError(`${label} must be a whole number of 1 or more.`);
        return;
      }
    }
    if (form.palletPack.trim() !== "" && !(Number.parseInt(form.palletPack, 10) >= 1)) {
      setSubmitError("Pallet pack must be a whole number of 1 or more.");
      return;
    }
    if (priceInvalid) {
      setSubmitError("Default price must be a valid dollar amount (e.g. 0.42), or blank for quote-required.");
      return;
    }
    save.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSubmitError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>
              {isEdit ? `Edit product, ${product!.sku}` : "New product"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prod-sku" className="text-body-sm">SKU</Label>
              <Input id="prod-sku" value={form.sku} onChange={set("sku")} placeholder="JG-CB-MAI4" className="h-9 font-mono text-body-sm" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-name" className="text-body-sm">Product name</Label>
              <Input id="prod-name" value={form.name} onChange={set("name")} placeholder="White Mailer Carton 10 × 7 × 4 in" className="h-9 text-body-sm" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prod-category" className="text-body-sm">Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger id="prod-category" className="h-9 w-full text-body-sm" aria-label="Product category">
                  <SelectValue placeholder="Choose a category…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prod-short" className="text-body-sm">Short description <span className="text-muted-foreground">(catalogue card)</span></Label>
              <Input id="prod-short" value={form.shortDescription} onChange={set("shortDescription")} placeholder="Standard 10-inch pizza box, lock-corner, kraft." className="h-9 text-body-sm" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prod-desc" className="text-body-sm">Full description</Label>
              <Textarea id="prod-desc" rows={3} value={form.description} onChange={set("description")} placeholder="Construction, performance and packaging details…" className="text-body-sm" required />
            </div>

            <GroupLabel className="sm:col-span-2">Specifications</GroupLabel>
            <div className="space-y-1.5">
              <Label htmlFor="prod-dimensions" className="text-body-sm">Dimensions</Label>
              <Input id="prod-dimensions" value={form.dimensions} onChange={set("dimensions")} placeholder="10 × 10 × 1.75 in" className="h-9 text-body-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-material" className="text-body-sm">Material</Label>
              <Input id="prod-material" value={form.material} onChange={set("material")} placeholder="Single-wall corrugated kraft" className="h-9 text-body-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-colour" className="text-body-sm">Colour</Label>
              <Input id="prod-colour" value={form.colour} onChange={set("colour")} placeholder="Natural kraft" className="h-9 text-body-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-printing" className="text-body-sm">Printing options</Label>
              <Input id="prod-printing" value={form.printingOptions} onChange={set("printingOptions")} placeholder="1 to 4 colour flexo on volume" className="h-9 text-body-sm" />
            </div>

            <GroupLabel className="sm:col-span-2">Ordering rules</GroupLabel>
            <div className="space-y-1.5">
              <Label htmlFor="prod-casepack" className="text-body-sm">Case pack</Label>
              <Input id="prod-casepack" inputMode="numeric" value={form.casePack} onChange={set("casePack")} placeholder="100" className="tnum h-9 text-body-sm" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-palletpack" className="text-body-sm">Pallet pack <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="prod-palletpack" inputMode="numeric" value={form.palletPack} onChange={set("palletPack")} placeholder="1200" className="tnum h-9 text-body-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-moq" className="text-body-sm">Minimum order qty</Label>
              <Input id="prod-moq" inputMode="numeric" value={form.minOrderQty} onChange={set("minOrderQty")} placeholder="500" className="tnum h-9 text-body-sm" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-increment" className="text-body-sm">Quantity increment</Label>
              <Input id="prod-increment" inputMode="numeric" value={form.increment} onChange={set("increment")} placeholder="100" className="tnum h-9 text-body-sm" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-unit" className="text-body-sm">Sold per</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger id="prod-unit" className="h-9 w-full text-body-sm" aria-label="Selling unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u === "each" ? "Each (per piece)" : "Case"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-stock" className="text-body-sm">Stock status</Label>
              <Select value={form.stockStatus} onValueChange={(v) => setForm((f) => ({ ...f, stockStatus: v }))}>
                <SelectTrigger id="prod-stock" className="h-9 w-full text-body-sm" aria-label="Stock status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STOCK_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <GroupLabel className="sm:col-span-2">Pricing</GroupLabel>
            <div className="space-y-1.5">
              <Label htmlFor="prod-price" className="text-body-sm">
                Default price <span className="text-muted-foreground">(blank = quote required)</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-body-sm text-muted-foreground" aria-hidden>$</span>
                <Input
                  id="prod-price"
                  inputMode="decimal"
                  value={form.defaultPrice}
                  onChange={set("defaultPrice")}
                  placeholder="0.42"
                  aria-invalid={priceInvalid || undefined}
                  className="tnum h-9 pl-6 text-body-sm"
                />
              </div>
              {priceInvalid ? <FieldError>Enter a valid amount, e.g. 0.42</FieldError> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-lead" className="text-body-sm">Lead time note <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="prod-lead" value={form.leadTimeNote} onChange={set("leadTimeNote")} placeholder="2 weeks from artwork approval" className="h-9 text-body-sm" />
            </div>
          </div>

          {submitError && <FieldError>{submitError}</FieldError>}

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => onClose()}>Cancel</Button>
            <Button type="submit" className="gap-1.5" disabled={save.isPending}>
              {save.isPending ? "Saving…" : isEdit ? "Save product" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
