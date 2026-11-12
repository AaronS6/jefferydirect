"use client";

// Product request sheet — customers ask for a product we do not carry.
// Right-side sheet, three plain sections (Product / Specification / Order),
// submits a NEW_PRODUCT quotation and opens its detail page on success.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { AddressDto } from "@/types";
import { errorMessage } from "./portal-bits";

const PRODUCT_TYPES = [
  "Box or carton",
  "Pizza box",
  "Bag",
  "Cup or lid",
  "Container or tub",
  "Film or wrap",
  "Mailer",
  "Label or sticker",
  "Other",
] as const;

const MATERIALS = ["Kraft paper", "Corrugated board", "Paperboard", "PET", "PP", "Other"] as const;
const PRINTING_OPTIONS = ["None", "1 colour", "2 colours", "Full colour"] as const;
const SIZE_UNITS = ["mm", "cm", "in"] as const;

type FormState = {
  name: string;
  type: string;
  description: string;
  sizeL: string;
  sizeW: string;
  sizeH: string;
  sizeUnit: string;
  material: string;
  printing: string;
  foodContact: boolean;
  quantity: string;
  yearlyVolume: string;
  neededBy: string;
  addressId: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  type: "",
  description: "",
  sizeL: "",
  sizeW: "",
  sizeH: "",
  sizeUnit: "in",
  material: "",
  printing: "None",
  foodContact: true,
  quantity: "",
  yearlyVolume: "",
  neededBy: "",
  addressId: "",
};

type RequestPayload = {
  title: string;
  productName: string;
  category: string;
  dimensions: string;
  material: string;
  printing: string;
  quantity: string;
  neededBy: string;
  destination: string;
  specs: string;
  kind: "NEW_PRODUCT";
};

type FieldErrors = Partial<Record<"name" | "type" | "size" | "quantity" | "yearlyVolume", string>>;

export function ProductRequestSheet({
  open,
  onOpenChange,
  initialName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-[480px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Request a product</SheetTitle>
        </SheetHeader>
        {/* Mounted only while open: fresh state each time, seeded with the name */}
        {open ? (
          <ProductRequestForm
            key={initialName ?? "blank"}
            initialName={initialName}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-micro text-muted-foreground">{children}</p>;
}

function FieldErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-caption text-[var(--status-danger-fg)]">{children}</p>;
}

function ProductRequestForm({
  initialName,
  onOpenChange,
}: {
  initialName?: string;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    name: (initialName ?? "").slice(0, 160),
  }));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  const { data: account } = useQuery({
    queryKey: ["customer-account"],
    queryFn: () => api.get<{ addresses: AddressDto[] }>("/api/customer/account"),
  });
  const addresses = account?.addresses ?? [];
  // Default-select the isDefault address (or the first) until the user picks one.
  const defaultAddressId =
    addresses.length > 0 ? (addresses.find((a) => a.isDefault) ?? addresses[0]).id : "";
  const addressId = form.addressId || defaultAddressId;

  const submitMutation = useMutation({
    mutationFn: (payload: RequestPayload) =>
      api.post<{ id: string; quoteNumber: string }>("/api/customer/quotations", payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
      toast({ title: "Request sent" });
      onOpenChange(false);
      navigate("quote-detail", { id: res.id });
    },
    onError: (err) => setError(errorMessage(err, "We could not submit your request. Please try again.")),
  });

  const set =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((f) => ({ ...f, [key]: value }));
  const setDigits = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value.replace(/[^\d]/g, "") }));
  const setDecimal = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value.replace(/[^\d.]/g, "") }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = "Product name is required.";
    if (!form.type) errors.type = "Type is required.";
    if (!form.quantity.trim()) {
      errors.quantity = "Quantity per order is required.";
    } else if (!(Number.parseInt(form.quantity, 10) >= 1)) {
      errors.quantity = "Quantity per order must be a whole number of 1 or more.";
    }
    if (form.yearlyVolume.trim() !== "" && !(Number.parseInt(form.yearlyVolume, 10) >= 1)) {
      errors.yearlyVolume = "Yearly volume must be a whole number of 1 or more.";
    }
    if ((form.sizeL.trim() === "") !== (form.sizeW.trim() === "")) {
      errors.size = "Enter both length and width to include a size.";
    }
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    const name = form.name.trim();
    const l = form.sizeL.trim();
    const w = form.sizeW.trim();
    const h = form.sizeH.trim();
    const dimensions = l && w ? `${[l, w, ...(h ? [h] : [])].join(" x ")} ${form.sizeUnit}` : "";
    const address = addresses.find((a) => a.id === addressId);
    const specs = [
      form.description.trim() || null,
      `Food contact: ${form.foodContact ? "yes" : "no"}`,
      form.yearlyVolume.trim() ? `Yearly volume: ${form.yearlyVolume.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    submitMutation.mutate({
      title: name,
      productName: name,
      category: form.type,
      dimensions,
      material: form.material,
      printing: form.printing,
      quantity: form.quantity.trim(),
      neededBy: form.neededBy,
      destination: address ? `${address.label}, ${address.city}, ${address.province}` : "",
      specs,
      kind: "NEW_PRODUCT",
    });
  }

  const pending = submitMutation.isPending;

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <fieldset className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5" disabled={pending}>
        {/* ── Product ── */}
        <section className="space-y-4">
          <SectionTitle>Product</SectionTitle>
          <div className="space-y-1.5">
            <Label htmlFor="pr-name">Product name</Label>
            <Input
              id="pr-name"
              maxLength={160}
              placeholder="e.g. 12-inch printed pizza box"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              aria-invalid={fieldErrors.name ? true : undefined}
            />
            {fieldErrors.name && <FieldErrorText>{fieldErrors.name}</FieldErrorText>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-type">Type</Label>
            <Select value={form.type} onValueChange={set("type")}>
              <SelectTrigger id="pr-type" className="w-full">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.type && <FieldErrorText>{fieldErrors.type}</FieldErrorText>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-description">Description</Label>
            <Textarea
              id="pr-description"
              rows={3}
              maxLength={1900}
              placeholder="What is it used for?"
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
            />
          </div>
        </section>

        {/* ── Specification ── */}
        <section className="space-y-4">
          <SectionTitle>Specification</SectionTitle>
          <div className="space-y-2">
            <Label>Size</Label>
            <div className="grid grid-cols-[1fr_1fr_1fr_84px] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="pr-size-l" className="text-caption text-muted-foreground">
                  L
                </Label>
                <Input
                  id="pr-size-l"
                  inputMode="decimal"
                  value={form.sizeL}
                  onChange={(e) => setDecimal("sizeL")(e.target.value)}
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-size-w" className="text-caption text-muted-foreground">
                  W
                </Label>
                <Input
                  id="pr-size-w"
                  inputMode="decimal"
                  value={form.sizeW}
                  onChange={(e) => setDecimal("sizeW")(e.target.value)}
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-size-h" className="text-caption text-muted-foreground">
                  H
                </Label>
                <Input
                  id="pr-size-h"
                  inputMode="decimal"
                  value={form.sizeH}
                  onChange={(e) => setDecimal("sizeH")(e.target.value)}
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-size-unit" className="text-caption text-muted-foreground">
                  Unit
                </Label>
                <Select value={form.sizeUnit} onValueChange={set("sizeUnit")}>
                  <SelectTrigger id="pr-size-unit" className="w-full" aria-label="Size unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {fieldErrors.size && <FieldErrorText>{fieldErrors.size}</FieldErrorText>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pr-material">Material</Label>
              <Select value={form.material} onValueChange={set("material")}>
                <SelectTrigger id="pr-material" className="w-full">
                  <SelectValue placeholder="Select a material" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIALS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-printing">Printing</Label>
              <Select value={form.printing} onValueChange={set("printing")}>
                <SelectTrigger id="pr-printing" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRINTING_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="pr-food-contact">Food contact</Label>
            <Switch
              id="pr-food-contact"
              checked={form.foodContact}
              onCheckedChange={(v) => setForm((f) => ({ ...f, foodContact: v }))}
            />
          </div>
        </section>

        {/* ── Order ── */}
        <section className="space-y-4">
          <SectionTitle>Order</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pr-quantity">Quantity per order</Label>
              <Input
                id="pr-quantity"
                inputMode="numeric"
                maxLength={120}
                placeholder="e.g. 500"
                value={form.quantity}
                onChange={(e) => setDigits("quantity")(e.target.value)}
                aria-invalid={fieldErrors.quantity ? true : undefined}
                className="tnum"
              />
              {fieldErrors.quantity && <FieldErrorText>{fieldErrors.quantity}</FieldErrorText>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-yearly">Expected yearly volume</Label>
              <Input
                id="pr-yearly"
                inputMode="numeric"
                maxLength={120}
                placeholder="e.g. 6,000"
                value={form.yearlyVolume}
                onChange={(e) => setDigits("yearlyVolume")(e.target.value)}
                aria-invalid={fieldErrors.yearlyVolume ? true : undefined}
                className="tnum"
              />
              {fieldErrors.yearlyVolume && <FieldErrorText>{fieldErrors.yearlyVolume}</FieldErrorText>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-neededby">Needed by</Label>
            <Input
              id="pr-neededby"
              type="date"
              value={form.neededBy}
              onChange={(e) => set("neededBy")(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-address">Delivery address</Label>
            {addresses.length > 0 ? (
              <Select value={addressId} onValueChange={set("addressId")}>
                <SelectTrigger id="pr-address" className="w-full">
                  <SelectValue placeholder="Select an address" />
                </SelectTrigger>
                <SelectContent>
                  {addresses.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}, {a.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-caption text-muted-foreground">No saved addresses</p>
            )}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
          >
            {error}
          </div>
        )}
      </fieldset>

      <SheetFooter className="mt-0 flex-row justify-end gap-2 border-t px-5 py-4">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {pending ? "Sending…" : "Send request"}
        </Button>
      </SheetFooter>
    </form>
  );
}
