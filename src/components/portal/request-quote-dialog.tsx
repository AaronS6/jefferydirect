"use client";

// Request-new-quotation dialog — used by the quotations view (and opened with
// a product prefill when reached from a product page or the dashboard).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { api } from "@/lib/api-client";
import type { CategoryDto } from "@/types";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "./portal-bits";

const NONE = "none";

type FormState = {
  title: string;
  category: string;
  productName: string;
  dimensions: string;
  material: string;
  colour: string;
  printing: string;
  quantity: string;
  neededBy: string;
  destination: string;
  specs: string;
  comments: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  category: "",
  productName: "",
  dimensions: "",
  material: "",
  colour: "",
  printing: "",
  quantity: "",
  neededBy: "",
  destination: "",
  specs: "",
  comments: "",
};

export function RequestQuoteDialog({
  open,
  onOpenChange,
  prefillProduct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillProduct?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Request a quote</DialogTitle>
          <DialogDescription>
            Tell us what you need. We&apos;ll respond with itemised pricing.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open: fresh state each time, seeded with the prefill */}
        {open ? (
          <RequestQuoteForm
            key={prefillProduct ?? "blank"}
            prefillProduct={prefillProduct}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RequestQuoteForm({
  prefillProduct,
  onOpenChange,
}: {
  prefillProduct?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    productName: prefillProduct ?? "",
  }));
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<CategoryDto[]>("/api/customer/categories"),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string; quoteNumber: string }>("/api/customer/quotations", {
        title: form.title.trim(),
        category: form.category === NONE || !form.category ? "" : form.category,
        productName: form.productName.trim(),
        dimensions: form.dimensions.trim(),
        material: form.material.trim(),
        colour: form.colour.trim(),
        printing: form.printing.trim(),
        quantity: form.quantity.trim(),
        neededBy: form.neededBy.trim(),
        destination: form.destination.trim(),
        specs: form.specs.trim(),
        comments: form.comments.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
      toast({ title: "Quote requested" });
      onOpenChange(false);
    },
    onError: (err) => setError(errorMessage(err, "We could not submit your request. Please try again.")),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Add a short title.");
      return;
    }
    setError(null);
    submitMutation.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* ── Product details ── */}
      <fieldset className="space-y-4" disabled={submitMutation.isPending}>
        <legend className="text-micro mb-3 text-muted-foreground">Product details</legend>
        <div className="space-y-2">
          <Label htmlFor="rq-title">Request title</Label>
          <Input
            id="rq-title"
            maxLength={160}
            placeholder="e.g. 5,000 custom printed 12-inch pizza boxes"
            value={form.title}
            onChange={(e) => set("title")(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rq-category">Category</Label>
            <Select value={form.category || NONE} onValueChange={set("category")}>
              <SelectTrigger id="rq-category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No specific category</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-product">Product</Label>
            <Input
              id="rq-product"
              maxLength={160}
              placeholder="Product or item name"
              value={form.productName}
              onChange={(e) => set("productName")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-dimensions">Dimensions</Label>
            <Input
              id="rq-dimensions"
              maxLength={160}
              placeholder="e.g. 12 × 12 × 1.75 in"
              value={form.dimensions}
              onChange={(e) => set("dimensions")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-material">Material</Label>
            <Input
              id="rq-material"
              maxLength={160}
              placeholder="e.g. Single-wall corrugated kraft"
              value={form.material}
              onChange={(e) => set("material")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-colour">Colour</Label>
            <Input
              id="rq-colour"
              maxLength={80}
              placeholder="e.g. Natural kraft / white liner"
              value={form.colour}
              onChange={(e) => set("colour")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-printing">Printing</Label>
            <Input
              id="rq-printing"
              maxLength={240}
              placeholder="e.g. 2-colour flexo, artwork supplied"
              value={form.printing}
              onChange={(e) => set("printing")(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* ── Order details ── */}
      <fieldset className="space-y-4" disabled={submitMutation.isPending}>
        <legend className="text-micro mb-3 text-muted-foreground">Order details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rq-quantity">Quantity</Label>
            <Input
              id="rq-quantity"
              maxLength={120}
              placeholder="e.g. 5,000 boxes"
              value={form.quantity}
              onChange={(e) => set("quantity")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-neededby">Needed by</Label>
            <Input
              id="rq-neededby"
              maxLength={120}
              placeholder="e.g. 6 weeks / a specific date"
              value={form.neededBy}
              onChange={(e) => set("neededBy")(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rq-destination">Destination</Label>
          <Textarea
            id="rq-destination"
            maxLength={240}
            rows={2}
            placeholder="e.g. 1082 Danforth Ave, Toronto, ON"
            value={form.destination}
            onChange={(e) => set("destination")(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rq-specs">Specs</Label>
          <Textarea
            id="rq-specs"
            maxLength={2000}
            rows={3}
            placeholder="e.g. board grade, venting, stacking strength"
            value={form.specs}
            onChange={(e) => set("specs")(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rq-comments">Comments</Label>
          <Textarea
            id="rq-comments"
            maxLength={2000}
            rows={3}
            placeholder="e.g. artwork supplied as PDF"
            value={form.comments}
            onChange={(e) => set("comments")(e.target.value)}
          />
        </div>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
        >
          {error}
        </div>
      )}

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitMutation.isPending} className="gap-2">
          {submitMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {submitMutation.isPending ? "Submitting…" : "Submit request"}
        </Button>
      </DialogFooter>
    </form>
  );
}
