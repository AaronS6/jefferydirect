"use client";

// Change request dialog — a three-phase flow: pick what to change, fill in
// the specifics, then review and submit. Honest throughout: a change request
// is a REQUEST — Jeffery Group reviews and approves it before anything on
// the order changes, and the original order information is always preserved.
//
// The flow state lives in an inner component that mounts fresh each time the
// dialog opens (Radix unmounts closed dialog content), so every open starts
// from a clean slate without effects.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { CHANGE_KINDS, CHANGE_KIND_LABELS, type ChangeKind } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import type { ChangeItem, ChangeRequestDto } from "@/types";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QtyStepper } from "./portal-bits";

export type ChangeItemTarget = { productId: string | null; name: string; sku: string; qty: number };
export type RespondAction = "ACCEPT" | "DECLINE" | "WITHDRAW";

const KIND_DESCRIPTIONS: Record<string, string> = {
  QUANTITY: "Adjust the quantity of a product on this order.",
  SPEC: "Change a specification: dimensions, material, printing.",
  ADD: "Add a new product to this order.",
  REMOVE: "Remove a product from this order.",
  ADDRESS: "Ship this order to a different delivery address.",
  DATE: "Request a different delivery date.",
  CANCEL: "Request cancellation of the entire order.",
  OTHER: "Anything else. Describe it in your own words.",
};

/** Human-readable one-line rendering of a requested change. */
export function changeItemText(item: ChangeItem): string {
  switch (item.kind) {
    case "QUANTITY":
      return `Quantity: ${(item.currentQty ?? 0).toLocaleString()} → ${(item.newQty ?? 0).toLocaleString()}${
        item.name ? ` (${item.name})` : ""
      }`;
    case "SPEC":
      return `Specification${item.name ? ` (${item.name})` : ""}: ${item.spec ?? ""}`;
    case "ADD":
      return `Add ${item.name ?? "a product"} × ${(item.newQty ?? 1).toLocaleString()}`;
    case "REMOVE":
      return `Remove ${item.name ?? "a product"}${item.currentQty != null ? ` × ${item.currentQty.toLocaleString()}` : ""}`;
    case "ADDRESS":
      return `New address: ${item.newAddress ?? ""}`;
    case "DATE":
      return `Delivery date → ${formatDate(item.newDate)}`;
    case "CANCEL":
      return "Cancel order";
    default:
      return item.note ? `Other: ${item.note}` : "Other change";
  }
}

export function ChangeRequestDialog({
  open,
  onOpenChange,
  orderId,
  items,
  initialKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  items: ChangeItemTarget[];
  initialKind?: ChangeKind;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <ChangeRequestFlow orderId={orderId} items={items} initialKind={initialKind} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ChangeRequestFlow({
  orderId,
  items,
  initialKind,
  onClose,
}: {
  orderId: string;
  items: ChangeItemTarget[];
  initialKind?: ChangeKind;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"pick" | "form" | "review">(initialKind ? "form" : "pick");
  const [kind, setKind] = useState<ChangeKind | null>(initialKind ?? null);
  const [targetKey, setTargetKey] = useState("");
  const [newQty, setNewQty] = useState<number | null>(null);
  const [specText, setSpecText] = useState("");
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState<number | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [newDate, setNewDate] = useState("");
  const [kindNote, setKindNote] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const target = targetKey !== "" ? items[Number(targetKey)] : undefined;

  function pickTarget(key: string) {
    setTargetKey(key);
    const it = items[Number(key)];
    setNewQty(it ? it.qty : null);
  }

  function buildChangeItem(): ChangeItem | null {
    switch (kind) {
      case "QUANTITY":
        return target
          ? {
              kind,
              productId: target.productId,
              sku: target.sku,
              name: target.name,
              currentQty: target.qty,
              newQty: newQty ?? target.qty,
            }
          : null;
      case "SPEC":
        return target
          ? { kind, productId: target.productId, sku: target.sku, name: target.name, spec: specText.trim() }
          : null;
      case "ADD":
        return { kind, name: addName.trim(), newQty: addQty ?? 1, note: kindNote.trim() || null };
      case "REMOVE":
        return target
          ? { kind, productId: target.productId, sku: target.sku, name: target.name, currentQty: target.qty }
          : null;
      case "ADDRESS":
        return { kind, newAddress: newAddress.trim() };
      case "DATE":
        return { kind, newDate };
      case "CANCEL":
        return { kind };
      case "OTHER":
        return { kind, note: kindNote.trim() };
      default:
        return null;
    }
  }

  function toReview() {
    setFormError(null);
    switch (kind) {
      case "QUANTITY":
        if (!target) return setFormError("Choose which product's quantity to change.");
        if (newQty == null || newQty < 1) return setFormError("Enter a quantity of at least 1.");
        break;
      case "SPEC":
        if (!target) return setFormError("Choose which product's specification to change.");
        if (!specText.trim()) return setFormError("Describe the specification change.");
        break;
      case "ADD":
        if (!addName.trim()) return setFormError("Name the product you'd like to add.");
        if (addQty == null || addQty < 1) return setFormError("Enter a quantity of at least 1.");
        break;
      case "REMOVE":
        if (!target) return setFormError("Choose which product to remove.");
        break;
      case "ADDRESS":
        if (!newAddress.trim()) return setFormError("Enter the full new delivery address.");
        break;
      case "DATE":
        if (!newDate) return setFormError("Choose the new requested delivery date.");
        break;
      case "OTHER":
        if (!kindNote.trim()) return setFormError("Describe what you'd like to change.");
        break;
      default:
        break;
    }
    setPhase("review");
  }

  const submitMutation = useMutation({
    mutationFn: () => {
      const change = buildChangeItem();
      if (!change) throw new Error("No change selected.");
      return api.post<ChangeRequestDto>(`/api/customer/orders/${orderId}/change-requests`, {
        changes: [change],
        note: requestNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Change request submitted" });
      onClose();
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : "We could not submit your request. Please try again."),
  });

  const change = phase === "review" ? buildChangeItem() : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Request a change</DialogTitle>
        <DialogDescription>
          {phase === "pick"
            ? "Choose what to change."
            : phase === "form"
              ? "Tell us what to change."
              : "Nothing changes until Jeffery Group reviews and approves. The original order information is preserved."}
        </DialogDescription>
      </DialogHeader>

      {/* ── Phase 1: pick what to change ── */}
      {phase === "pick" && (
        <>
          <RadioGroup value={kind ?? ""} onValueChange={(v) => setKind(v as ChangeKind)} className="gap-2">
            {CHANGE_KINDS.map((k) => (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[10px] border bg-card p-3.5 transition-colors hover:border-foreground/25 hover:bg-accent/60",
                  kind === k && "border-kraft-strong bg-kraft-soft/60",
                )}
              >
                <RadioGroupItem value={k} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-foreground">
                    {CHANGE_KIND_LABELS[k]}
                  </span>
                  <span className="mt-0.5 block text-caption leading-relaxed text-muted-foreground">
                    {KIND_DESCRIPTIONS[k]}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button className="gap-1.5" disabled={!kind} onClick={() => setPhase("form")}>
              Continue <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </DialogFooter>
        </>
      )}

      {/* ── Phase 2: per-kind form ── */}
      {phase === "form" && (
        <>
          <div className="space-y-4">
            {(kind === "QUANTITY" || kind === "SPEC" || kind === "REMOVE") && (
              <div className="space-y-2">
                <Label htmlFor="cr-item">Product</Label>
                <Select value={targetKey} onValueChange={pickTarget}>
                  <SelectTrigger id="cr-item" className="w-full">
                    <SelectValue placeholder="Choose a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((it, i) => (
                      <SelectItem key={`${it.productId ?? "custom"}-${i}`} value={String(i)}>
                        {it.name}
                        {it.sku ? ` · ${it.sku}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {kind === "QUANTITY" && (
              <div className="space-y-2">
                <span className="block text-micro text-muted-foreground">
                  New quantity{target ? ` (currently ${target.qty.toLocaleString()})` : ""}
                </span>
                <QtyStepper value={newQty ?? 1} onChange={setNewQty} size="sm" ariaLabel="New quantity" />
              </div>
            )}

            {kind === "SPEC" && (
              <div className="space-y-2">
                <Label htmlFor="cr-spec">What should change?</Label>
                <Textarea
                  id="cr-spec"
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. Change material to B-flute and add 2-colour flexo printing inside…"
                  value={specText}
                  onChange={(e) => setSpecText(e.target.value)}
                />
              </div>
            )}

            {kind === "ADD" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cr-add-name">Product to add</Label>
                  <Input
                    id="cr-add-name"
                    maxLength={160}
                    placeholder="e.g. Carton 14×10×10, printed"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <span className="block text-micro text-muted-foreground">Quantity</span>
                  <QtyStepper value={addQty ?? 1} onChange={setAddQty} size="sm" ariaLabel="Quantity to add" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cr-add-note">Note (optional)</Label>
                  <Input
                    id="cr-add-note"
                    maxLength={500}
                    placeholder="Anything about this line…"
                    value={kindNote}
                    onChange={(e) => setKindNote(e.target.value)}
                  />
                </div>
              </div>
            )}

            {kind === "ADDRESS" && (
              <div className="space-y-2">
                <Label htmlFor="cr-address">New delivery address</Label>
                <Textarea
                  id="cr-address"
                  rows={4}
                  maxLength={500}
                  placeholder="e.g. 1082 Danforth Ave, Toronto, ON M4C 1V2"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
              </div>
            )}

            {kind === "DATE" && (
              <div className="max-w-xs space-y-2">
                <Label htmlFor="cr-date">New requested delivery date</Label>
                <Input id="cr-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                <p className="text-caption text-pretty leading-relaxed text-muted-foreground">
                  Requested, not guaranteed. Jeffery Group confirms the date.
                </p>
              </div>
            )}

            {kind === "OTHER" && (
              <div className="space-y-2">
                <Label htmlFor="cr-other">Describe the change</Label>
                <Textarea
                  id="cr-other"
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. Split the delivery across two locations"
                  value={kindNote}
                  onChange={(e) => setKindNote(e.target.value)}
                />
              </div>
            )}

            {kind === "CANCEL" && (
              <div className="rounded-[10px] bg-[var(--status-danger-bg)] px-4 py-3 text-body-sm leading-relaxed text-[var(--status-danger-fg)]">
                <span className="flex items-start gap-2.5">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    You&apos;re requesting cancellation. Jeffery Group must approve it. Production and
                    dispatch continue as planned until then.
                  </span>
                </span>
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                {formError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setPhase("pick")}>
              <ArrowLeft className="size-3.5" aria-hidden /> Back
            </Button>
            <Button className="gap-1.5" onClick={toReview}>
              Review request <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </DialogFooter>
        </>
      )}

      {/* ── Phase 3: note + review summary ── */}
      {phase === "review" && (
        <>
          <div className="space-y-4">
            <div className="rounded-[10px] border bg-surface-sunken/60 px-4 py-3">
              <p className="text-micro text-muted-foreground">Requested change</p>
              <ul className="mt-1.5 space-y-1">
                {change && (
                  <li className="text-body-sm leading-relaxed text-foreground">
                    {changeItemText(change)}
                  </li>
                )}
              </ul>
            </div>
            {kind === "CANCEL" && (
              <div className="rounded-[10px] bg-[var(--status-danger-bg)] px-4 py-3 text-caption leading-relaxed text-[var(--status-danger-fg)]">
                Cancelling is a request. Jeffery Group must approve it before the order is stopped.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="cr-note">Note for our team (optional)</Label>
              <Textarea
                id="cr-note"
                rows={3}
                maxLength={2000}
                placeholder="e.g. Needed before production starts Nov 14"
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
              />
            </div>
            {formError && (
              <div
                role="alert"
                className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                {formError}
              </div>
            )}
            <p className="text-caption text-pretty leading-relaxed text-muted-foreground">
              Nothing changes until Jeffery Group approves. The original order information is
              preserved. If an alternative is needed, we&apos;ll propose one.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setPhase("form")}>
              <ArrowLeft className="size-3.5" aria-hidden /> Back
            </Button>
            <Button className="gap-2" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Submitting…
                </>
              ) : (
                <>
                  <Check className="size-4" aria-hidden /> Submit request
                </>
              )}
            </Button>
          </DialogFooter>
        </>
      )}
    </>
  );
}
