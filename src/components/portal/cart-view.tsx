"use client";

// Smart Order Builder — the whole request on ONE page: items (with per-line
// specifications, notes and attachment references, plus custom product
// requests), delivery and reference details on the left, a sticky submission
// summary on the right. Saved lists (drafts) autosave quietly and are managed
// from the page header. Copy is honest throughout: this is a REQUEST that
// Jeffery Group reviews and confirms.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronRight,
  Info,
  List,
  Loader2,
  Package,
  Save,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Money, MoneyWithCode } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useAppStore, useCartStore } from "@/store/app-store";
import type {
  AddressDto,
  AttachmentMeta,
  LineSpecs,
  OrderDraftDto,
  OrderDraftPayload,
} from "@/types";
import { taxFromSubtotalCents } from "@/lib/money";
import { DEFAULT_TAX_RATE_BP } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/date";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Chip, ErrorAlert, Mono, QtyStepper, SectionCard } from "./portal-bits";
import {
  AttachmentChips,
  AttachmentPicker,
  CustomLineForm,
  SpecChips,
  SpecFieldsEditor,
  cleanSpecs,
  newLocalId,
} from "./order-builder-bits";

type LineExtras = { specs: LineSpecs; note: string; attachments: AttachmentMeta[] };

const EMPTY_EXTRAS: LineExtras = { specs: {}, note: "", attachments: [] };
const EMPTY_ADDRESS_FORM = { label: "", line1: "", line2: "", city: "", province: "", postal: "" };

const EASE = [0.22, 1, 0.36, 1] as const;

/** One-shot reorder hint left in sessionStorage by the order view. */
type ReorderNote = { source: string; skipped: number };

function readReorderNote(): ReorderNote | null {
  try {
    const raw = sessionStorage.getItem("clienthub-reorder-note");
    if (!raw) return null;
    sessionStorage.removeItem("clienthub-reorder-note");
    try {
      const parsed = JSON.parse(raw) as { source?: unknown; skipped?: unknown };
      if (parsed && typeof parsed === "object" && typeof parsed.source === "string" && parsed.source) {
        return {
          source: parsed.source,
          skipped: typeof parsed.skipped === "number" && Number.isFinite(parsed.skipped)
            ? Math.max(0, Math.floor(parsed.skipped))
            : 0,
        };
      }
    } catch {
      // Not JSON — treat the raw string as the source.
    }
    return raw.trim() ? { source: raw.trim(), skipped: 0 } : null;
  } catch {
    return null; // sessionStorage unavailable
  }
}

export function CartView() {
  const navigate = useAppStore((s) => s.navigate);
  const session = useAppStore((s) => s.session);
  const lines = useCartStore((s) => s.lines);
  const setQty = useCartStore((s) => s.setQty);
  const removeLine = useCartStore((s) => s.removeLine);
  const clear = useCartStore((s) => s.clear);
  const loadDraft = useCartStore((s) => s.loadDraft);
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const queryClient = useQueryClient();
  const [addressId, setAddressId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  // Per-line builder state (specifications, notes, attachment references).
  const [extras, setExtras] = useState<Record<string, LineExtras>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [customLines, setCustomLines] = useState<
    { localId: string; name: string; description: string; qty: number; note: string; specs: LineSpecs; attachments: AttachmentMeta[] }[]
  >([]);
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const [orderAttachments, setOrderAttachments] = useState<AttachmentMeta[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);

  // Dialogs.
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<OrderDraftDto | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  // Reorder hint (read once) and the quiet autosave indicator.
  const [reorderNote, setReorderNote] = useState<ReorderNote | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const autoSavingRef = useRef(false);
  const lastSavedRef = useRef("");
  const flashTimerRef = useRef<number | null>(null);
  const prefilledRef = useRef(false);

  const canWrite = session?.user.orgRole !== "READONLY";
  const userId = session?.user.id ?? "";
  const lastAddressKey = userId ? `clienthub-last-address-${userId}` : "clienthub-last-address";
  const lastPoKey = userId ? `clienthub-last-po-${userId}` : "clienthub-last-po";

  useEffect(() => {
    setReorderNote(readReorderNote());
  }, []);

  const { data: addressesData, isLoading: addressesLoading, error: addressesError } = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: () => api.get<AddressDto[]>("/api/customer/addresses"),
  });

  const { data: drafts } = useQuery({
    queryKey: ["customer-drafts"],
    queryFn: () => api.get<OrderDraftDto[]>("/api/customer/drafts"),
  });

  const approvedAddresses = addressesData ?? [];
  const selectedAddress =
    approvedAddresses.find((a) => a.id === addressId) ??
    (addressId === "" ? (approvedAddresses.find((a) => a.isDefault) ?? approvedAddresses[0]) : undefined);

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPriceCents, 0);
  const tax = taxFromSubtotalCents(subtotal, DEFAULT_TAX_RATE_BP);
  const total = subtotal + tax;
  const validQtys = lines.every((l) => l.qty >= l.minOrderQty && l.qty % l.increment === 0);
  const totalLineCount = lines.length + customLines.length;
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0) + customLines.reduce((s, c) => s + c.qty, 0);

  // Remember the last-used delivery address and PO once the address book has
  // loaded (preselect only when nothing was chosen yet).
  useEffect(() => {
    if (prefilledRef.current || addressesData === undefined) return;
    prefilledRef.current = true;
    try {
      const rememberedAddress = localStorage.getItem(lastAddressKey);
      if (rememberedAddress && approvedAddresses.some((a) => a.id === rememberedAddress)) {
        setAddressId((current) => (current === "" ? rememberedAddress : current));
      }
      const rememberedPo = localStorage.getItem(lastPoKey);
      if (rememberedPo) setPoNumber((current) => (current === "" ? rememberedPo : current));
    } catch {
      // localStorage unavailable
    }
  }, [addressesData, approvedAddresses, lastAddressKey, lastPoKey]);

  function extrasFor(productId: string): LineExtras {
    return extras[productId] ?? EMPTY_EXTRAS;
  }

  function patchExtras(productId: string, patch: Partial<LineExtras>) {
    setExtras((m) => ({ ...m, [productId]: { ...extrasFor(productId), ...patch } }));
  }

  function hasLineExtras(ex: LineExtras): boolean {
    return Boolean(cleanSpecs(ex.specs)) || ex.note.trim() !== "" || ex.attachments.length > 0;
  }

  function removeCatalogueLine(productId: string) {
    removeLine(productId);
    setExtras((m) => {
      const next = { ...m };
      delete next[productId];
      return next;
    });
    setExpanded((m) => {
      const next = { ...m };
      delete next[productId];
      return next;
    });
  }

  function updateCustomQty(localId: string, qty: number) {
    setCustomLines((cs) => cs.map((c) => (c.localId === localId ? { ...c, qty } : c)));
  }

  function removeCustomLine(localId: string) {
    setCustomLines((cs) => cs.filter((c) => c.localId !== localId));
  }

  function defaultDraftName(): string {
    return `Draft of ${totalLineCount} item${totalLineCount === 1 ? "" : "s"}`;
  }

  function buildDraftPayload(): OrderDraftPayload {
    return {
      lines: [
        ...lines.map((l) => {
          const ex = extrasFor(l.productId);
          return {
            productId: l.productId,
            sku: l.sku,
            name: l.name,
            qty: l.qty,
            unitPriceCents: l.unitPriceCents,
            minOrderQty: l.minOrderQty,
            increment: l.increment,
            casePack: l.casePack,
            unit: l.unit,
            note: ex.note.trim() || null,
            specs: cleanSpecs(ex.specs) ?? null,
            attachments: ex.attachments,
          };
        }),
        ...customLines.map((c) => ({
          productId: null,
          sku: "",
          name: c.name,
          qty: c.qty,
          unitPriceCents: null,
          minOrderQty: 1,
          increment: 1,
          casePack: 0,
          unit: "unit",
          customDescription: c.description || null,
          note: c.note || null,
          specs: cleanSpecs(c.specs) ?? null,
          attachments: c.attachments,
        })),
      ],
      delivery: {
        addressId: selectedAddress?.id ?? null,
        requestedDeliveryDate: requestedDeliveryDate || null,
        notes: orderNotes.trim() || null,
      },
      reference: {
        poNumber: poNumber.trim() || null,
        specialInstructions: specialInstructions.trim() || null,
      },
      attachments: orderAttachments,
    };
  }

  function loadDraftInto(d: OrderDraftDto) {
    const payload = d.payload;
    const catalogueLines = payload.lines.filter((l): l is typeof l & { productId: string } => l.productId !== null);
    const customs = payload.lines.filter((l) => l.productId === null);

    // Catalogue lines go back into the persisted cart store (extras stripped).
    loadDraft(
      catalogueLines.map((l) => ({
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents ?? 0,
        minOrderQty: l.minOrderQty,
        increment: l.increment,
        casePack: l.casePack,
        unit: l.unit,
      })),
    );

    const nextExtras: Record<string, LineExtras> = {};
    for (const l of catalogueLines) {
      if (l.note || cleanSpecs(l.specs) || (l.attachments?.length ?? 0) > 0) {
        nextExtras[l.productId] = {
          specs: l.specs ?? {},
          note: l.note ?? "",
          attachments: l.attachments ?? [],
        };
      }
    }
    setExtras(nextExtras);
    setCustomLines(
      customs.map((c) => ({
        localId: newLocalId(),
        name: c.name,
        description: c.customDescription ?? "",
        qty: c.qty,
        note: c.note ?? "",
        specs: c.specs ?? {},
        attachments: c.attachments ?? [],
      })),
    );
    const approvedIds = new Set(approvedAddresses.map((a) => a.id));
    setAddressId(
      payload.delivery.addressId && approvedIds.has(payload.delivery.addressId)
        ? payload.delivery.addressId
        : "",
    );
    setOrderNotes(payload.delivery.notes ?? "");
    setRequestedDeliveryDate((payload.delivery.requestedDeliveryDate ?? "").slice(0, 10));
    setPoNumber(payload.reference.poNumber ?? "");
    setSpecialInstructions(payload.reference.specialInstructions ?? "");
    setOrderAttachments(payload.attachments ?? []);
    setDraftId(d.id);
    setCustomFormOpen(false);
    setSubmitError(null);
    setAttempted(false);
    // Just-loaded content is already saved — don't autosave it right back.
    lastSavedRef.current = JSON.stringify(payload);
  }

  function requestContinueDraft(d: OrderDraftDto) {
    if (lines.length > 0 || customLines.length > 0) {
      setPendingDraft(d);
      return;
    }
    loadDraftInto(d);
    toast({ title: "List loaded" });
  }

  const newAddressMutation = useMutation({
    mutationFn: () =>
      api.post<AddressDto>("/api/customer/addresses", {
        label: addressForm.label.trim(),
        line1: addressForm.line1.trim(),
        line2: addressForm.line2.trim() || null,
        city: addressForm.city.trim(),
        province: addressForm.province.trim(),
        postal: addressForm.postal.trim(),
      }),
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
      setAddressDialogOpen(false);
      setAddressForm(EMPTY_ADDRESS_FORM);
      setAddressFormError(null);
      // The new location is active immediately — select it for this order.
      setAddressId(a.id);
      toast({ title: "Address added" });
    },
    onError: (err) =>
      setAddressFormError(
        err instanceof Error ? err.message : "We could not add the address. Please try again.",
      ),
  });

  const saveDraftMutation = useMutation({
    mutationFn: () => {
      const payload = buildDraftPayload();
      const name = draftName.trim() || defaultDraftName();
      if (draftId) {
        return api.patch<OrderDraftDto>(`/api/customer/drafts/${draftId}`, { name, payload });
      }
      return api.post<OrderDraftDto>("/api/customer/drafts", { name, payload });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["customer-drafts"] });
      setDraftId(saved.id);
      setDraftDialogOpen(false);
      setDraftError(null);
      lastSavedRef.current = JSON.stringify(buildDraftPayload());
      toast({ title: "List saved" });
    },
    onError: (err) =>
      setDraftError(
        err instanceof Error ? err.message : "We could not save your list. Please try again.",
      ),
  });

  const deleteDraftMutation = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/api/customer/drafts/${id}`),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ["customer-drafts"] });
      if (draftId === id) {
        setDraftId(null);
        lastSavedRef.current = "";
      }
      toast({ title: "List deleted" });
    },
    onError: () =>
      toast({ title: "Could not delete list", description: "Please try again." }),
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const notes = [
        orderNotes.trim() ? `Order notes: ${orderNotes.trim()}` : null,
        specialInstructions.trim() ? `Special instructions: ${specialInstructions.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");
      return api.post<{ id: string; orderNumber: string }>("/api/customer/orders", {
        items: [
          ...lines.map((l) => {
            const ex = extrasFor(l.productId);
            return {
              productId: l.productId,
              qty: l.qty,
              note: ex.note.trim() || undefined,
              specs: cleanSpecs(ex.specs) || undefined,
              attachments: ex.attachments.length > 0 ? ex.attachments : undefined,
            };
          }),
          ...customLines.map((c) => ({
            custom: true as const,
            name: c.name,
            description: c.description || undefined,
            qty: c.qty,
            note: c.note || undefined,
            specs: cleanSpecs(c.specs) || undefined,
            attachments: c.attachments.length > 0 ? c.attachments : undefined,
          })),
        ],
        addressId: selectedAddress?.id,
        poNumber: poNumber.trim() || undefined,
        notes: notes || undefined,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        attachments: orderAttachments.length > 0 ? orderAttachments : undefined,
        draftId: draftId ?? undefined,
      });
    },
    onSuccess: (res) => {
      // Remember the last-used delivery address and PO for next time.
      try {
        if (selectedAddress) localStorage.setItem(lastAddressKey, selectedAddress.id);
        const po = poNumber.trim();
        if (po) localStorage.setItem(lastPoKey, po);
      } catch {
        // localStorage unavailable
      }
      clear();
      setExtras({});
      setExpanded({});
      setCustomLines([]);
      setCustomFormOpen(false);
      setOrderAttachments([]);
      setAddressId("");
      setOrderNotes("");
      setRequestedDeliveryDate("");
      setPoNumber("");
      setSpecialInstructions("");
      setDraftId(null);
      setAttempted(false);
      setSubmitError(null);
      lastSavedRef.current = "";
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["customer-drafts"] });
      toast({ title: "Order submitted" });
      navigate("order-detail", { id: res.id });
    },
    onError: (err) =>
      setSubmitError(
        err instanceof Error ? err.message : "We could not submit your order. Please try again.",
      ),
  });

  // Quiet autosave: after the builder settles, persist the current state as a
  // draft (PATCH the linked draft, or POST once). Failures stay silent — the
  // manual "Save as list" dialog surfaces errors.
  const draftPayloadKey = useMemo(
    () => JSON.stringify(buildDraftPayload()),
    [lines, extras, customLines, selectedAddress, requestedDeliveryDate, orderNotes, poNumber, specialInstructions, orderAttachments],
  );

  useEffect(() => {
    if (!canWrite || totalLineCount === 0) return;
    if (draftPayloadKey === lastSavedRef.current) return;
    const t = window.setTimeout(async () => {
      if (autoSavingRef.current) return;
      const payload = buildDraftPayload();
      const snapshot = JSON.stringify(payload);
      if (snapshot === lastSavedRef.current) return;
      autoSavingRef.current = true;
      try {
        const saved = draftId
          ? await api.patch<OrderDraftDto>(`/api/customer/drafts/${draftId}`, { payload })
          : await api.post<OrderDraftDto>("/api/customer/drafts", { name: defaultDraftName(), payload });
        setDraftId(saved.id);
        lastSavedRef.current = snapshot;
        queryClient.invalidateQueries({ queryKey: ["customer-drafts"] });
        setSavedFlash(true);
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setSavedFlash(false), 2000);
      } catch {
        // Silent — manual save surfaces errors.
      } finally {
        autoSavingRef.current = false;
      }
    }, 2500);
    return () => window.clearTimeout(t);
  }, [draftPayloadKey, canWrite, totalLineCount]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (totalLineCount === 0) {
      setSubmitError("Add at least one item before submitting.");
      return;
    }
    if (!validQtys) {
      setSubmitError("Quantities must respect each product's minimum and multiples.");
      return;
    }
    if (!selectedAddress) {
      setSubmitError(null);
      return;
    }
    setSubmitError(null);
    submitMutation.mutate();
  }

  function submitAddress(e: React.FormEvent) {
    e.preventDefault();
    if (
      !addressForm.label.trim() ||
      !addressForm.line1.trim() ||
      !addressForm.city.trim() ||
      !addressForm.province.trim() ||
      !addressForm.postal.trim()
    ) {
      setAddressFormError("Label, street, city, province and postal code are required.");
      return;
    }
    setAddressFormError(null);
    newAddressMutation.mutate();
  }

  function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    setDraftError(null);
    saveDraftMutation.mutate();
  }

  function openListDialog() {
    const current = draftId ? drafts?.find((d) => d.id === draftId)?.name : undefined;
    setDraftName(current ?? defaultDraftName());
    setDraftError(null);
    setDraftDialogOpen(true);
  }

  function clearCartItems() {
    clear();
    setExtras({});
    setExpanded({});
    setCustomLines([]);
    setCustomFormOpen(false);
    setOrderAttachments([]);
    setClearOpen(false);
    setAttempted(false);
    setSubmitError(null);
  }

  const hasContent = lines.length > 0 || customLines.length > 0 || customFormOpen;
  const showAddressError = attempted && !selectedAddress;
  const draftsList = drafts ?? [];

  if (!hasContent) {
    return (
      <motion.div {...enter}>
        <PageHeader
          title="Cart"
          actions={
            canWrite ? (
              <SavedListsMenu
                drafts={draftsList}
                deletingId={deleteDraftMutation.isPending ? deleteDraftMutation.variables ?? null : null}
                onLoad={requestContinueDraft}
                onDelete={(d) => deleteDraftMutation.mutate(d.id)}
              />
            ) : undefined
          }
        />
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => navigate("catalog")} className="gap-2">
                Browse products <ChevronRight className="size-4" aria-hidden />
              </Button>
              {canWrite && (
                <Button variant="outline" onClick={() => setCustomFormOpen(true)}>
                  Request a custom product
                </Button>
              )}
            </div>
          }
        />
      </motion.div>
    );
  }

  return (
    <motion.div {...enter}>
      <PageHeader
        title={
          savedFlash ? (
            <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
              Cart
              <span role="status" className="font-sans text-caption font-medium text-muted-foreground">
                Draft saved
              </span>
            </span>
          ) : (
            "Cart"
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <SavedListsMenu
                drafts={draftsList}
                deletingId={deleteDraftMutation.isPending ? deleteDraftMutation.variables ?? null : null}
                onLoad={requestContinueDraft}
                onDelete={(d) => deleteDraftMutation.mutate(d.id)}
              />
            )}
            {canWrite && totalLineCount > 0 && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={openListDialog}
                disabled={saveDraftMutation.isPending}
              >
                <Save className="size-4" aria-hidden />
                Save as list
              </Button>
            )}
          </div>
        }
      />

      <form onSubmit={submit} className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Left column: items, delivery, reference ── */}
        <div className="min-w-0 space-y-8">
          {/* Items */}
          <SectionCard title="Items" contentClassName="p-0 sm:p-0">
            {reorderNote && (
              <p className="flex items-start gap-1.5 border-b px-5 py-3 text-caption text-pretty leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Reordered from {reorderNote.source}.
                  {reorderNote.skipped > 0 &&
                    ` ${reorderNote.skipped} item${reorderNote.skipped === 1 ? "" : "s"} unavailable.`}
                </span>
              </p>
            )}

            <ul className="divide-y">
              {lines.map((l) => {
                const ex = extrasFor(l.productId);
                const open = expanded[l.productId] ?? false;
                const qtyInvalid = l.qty < l.minOrderQty || l.qty % l.increment !== 0;
                return (
                  <li key={l.productId} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <div className="min-w-0 flex-1 basis-52">
                        <p className="truncate text-body-sm font-semibold leading-snug text-foreground">{l.name}</p>
                        <p className="mt-0.5">
                          <Mono className="text-caption text-muted-foreground">{l.sku}</Mono>
                        </p>
                        <SpecsToggle
                          open={open}
                          filled={hasLineExtras(ex)}
                          onClick={() => setExpanded((m) => ({ ...m, [l.productId]: !open }))}
                        />
                      </div>
                      <div className="hidden w-24 shrink-0 text-right sm:block">
                        <Money cents={l.unitPriceCents} className="text-body-sm" />
                        <span className="block text-caption text-muted-foreground">per {l.unit}</span>
                      </div>
                      <div className="shrink-0">
                        <QtyStepper
                          value={l.qty}
                          onChange={(q) => setQty(l.productId, q)}
                          min={l.minOrderQty}
                          increment={l.increment}
                          size="sm"
                          ariaLabel={`Quantity of ${l.name}`}
                        />
                        {qtyInvalid ? (
                          <p className="mt-1 max-w-[220px] text-center text-caption leading-relaxed text-[var(--status-danger-fg)]">
                            Minimum {l.minOrderQty.toLocaleString()}, in steps of {l.increment.toLocaleString()}
                          </p>
                        ) : (
                          <p className="mt-1 text-center text-caption text-muted-foreground">
                            min {l.minOrderQty.toLocaleString()} · +{l.increment.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3 sm:ml-0 sm:gap-4">
                        <div className="text-right">
                          <Money cents={l.qty * l.unitPriceCents} className="text-body-sm font-semibold" />
                          <span className="block text-caption text-muted-foreground sm:hidden">
                            <Money cents={l.unitPriceCents} muted /> per {l.unit}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                          onClick={() => removeCatalogueLine(l.productId)}
                          aria-label={`Remove ${l.name} from cart`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                    {open && (
                      <div className="mt-3 rounded-[10px] border bg-surface-sunken/60 p-3.5">
                        <LineExtrasPanel
                          idPrefix={`line-${l.productId}`}
                          extras={ex}
                          onChange={(next) => setExtras((m) => ({ ...m, [l.productId]: next }))}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
              {customLines.map((c) => (
                <li key={c.localId} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1 basis-52">
                      <p className="flex flex-wrap items-center gap-1.5 text-body-sm font-semibold leading-snug text-foreground">
                        <span className="truncate">{c.name}</span>
                        <Chip>Custom request</Chip>
                      </p>
                      {c.description && (
                        <p className="mt-0.5 line-clamp-2 text-caption text-pretty leading-relaxed text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                      <SpecChips specs={c.specs} />
                      <AttachmentChips attachments={c.attachments} />
                    </div>
                    <div className="hidden w-24 shrink-0 text-right sm:block">
                      <span className="text-caption leading-relaxed text-muted-foreground">
                        Pricing to be confirmed
                      </span>
                    </div>
                    <div className="shrink-0">
                      <QtyStepper
                        value={c.qty}
                        onChange={(q) => updateCustomQty(c.localId, q)}
                        size="sm"
                        ariaLabel={`Quantity of ${c.name}`}
                      />
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-3 sm:ml-0 sm:gap-4">
                      <div className="w-28 text-right">
                        <span className="text-caption leading-relaxed text-muted-foreground">
                          Pricing to be confirmed
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                        onClick={() => removeCustomLine(c.localId)}
                        aria-label={`Remove ${c.name} from cart`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Custom product request */}
            <div className="border-t px-5 py-4">
              {customFormOpen ? (
                <CustomLineForm
                  onSubmit={(line) => {
                    setCustomLines((cs) => [...cs, line]);
                    setCustomFormOpen(false);
                    toast({ title: "Custom request added" });
                  }}
                  onCancel={() => setCustomFormOpen(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomFormOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-dashed px-4 py-3 text-body-sm font-medium text-muted-foreground transition-colors hover:border-kraft/60 hover:text-foreground"
                >
                  <Package className="size-4" aria-hidden />
                  Add custom product request
                </button>
              )}
            </div>
          </SectionCard>

          {/* Delivery */}
          <SectionCard title="Delivery">
            {addressesError ? (
              <ErrorAlert message="We could not load your shipping addresses." />
            ) : addressesLoading || addressesData === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                {approvedAddresses.length === 0 ? (
                  <div className="rounded-[10px] border border-kraft/40 bg-kraft-soft/60 px-4 py-3 text-body-sm text-kraft-ink">
                    No shipping addresses yet.
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="cart-address">Shipping address</Label>
                      <Select
                        value={selectedAddress?.id ?? ""}
                        onValueChange={(v) => setAddressId(v)}
                      >
                        <SelectTrigger id="cart-address" className="w-full sm:w-[380px]">
                          <SelectValue placeholder="Choose an address" />
                        </SelectTrigger>
                        <SelectContent>
                          {approvedAddresses.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.label}
                              {a.isDefault ? " (default)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showAddressError && (
                        <p role="alert" className="text-caption text-[var(--status-danger-fg)]">
                          Choose a delivery address
                        </p>
                      )}
                    </div>
                    {selectedAddress && (
                      <div className="rounded-[10px] border bg-surface-sunken/60 px-4 py-3">
                        <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
                          <Truck className="size-3.5" aria-hidden /> Ships to
                        </p>
                        <p className="mt-1.5 text-body-sm font-semibold text-foreground">{selectedAddress.label}</p>
                        <p className="mt-0.5 text-body-sm text-muted-foreground">
                          {selectedAddress.line1}
                          {selectedAddress.line2 ? `, ${selectedAddress.line2}` : ""}
                          <br />
                          {selectedAddress.city}, {selectedAddress.province} {selectedAddress.postal}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {approvedAddresses.length > 0 && (
                  <p className="text-caption text-muted-foreground">
                    Need a different destination? Add it below.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => {
                      setAddressForm(EMPTY_ADDRESS_FORM);
                      setAddressFormError(null);
                      setAddressDialogOpen(true);
                    }}
                  >
                    Add a new address
                  </Button>
                  <button
                    type="button"
                    className="text-caption font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    onClick={() => navigate("settings")}
                  >
                    Manage addresses in Settings
                  </button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cart-notes">Order notes</Label>
                  <Textarea
                    id="cart-notes"
                    rows={3}
                    maxLength={2000}
                    placeholder="e.g. Dock hours 8am to 4pm, receiving contact is Dana"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                  />
                </div>
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="cart-delivery-date">Requested delivery date</Label>
                  <Input
                    id="cart-delivery-date"
                    type="date"
                    value={requestedDeliveryDate}
                    onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                  />
                  <p className="text-caption text-pretty leading-relaxed text-muted-foreground">
                    Requested, not guaranteed. Jeffery Group confirms the date.
                  </p>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Reference */}
          <SectionCard title="Reference">
            <div className="space-y-4">
              <div className="max-w-md space-y-2">
                <Label htmlFor="cart-po">PO reference</Label>
                <Input
                  id="cart-po"
                  maxLength={60}
                  placeholder="e.g. MLP-PO-0918"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                />
                <p className="text-caption text-muted-foreground">Your purchase order number, if one applies.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cart-special">Special instructions</Label>
                <Textarea
                  id="cart-special"
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. Stack no more than 5 high, ship after Nov 14"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-micro text-muted-foreground">Order attachments (optional)</p>
                <AttachmentPicker
                  idPrefix="order"
                  attachments={orderAttachments}
                  onChange={setOrderAttachments}
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right column: sticky summary ── */}
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="Order summary">
          <SectionCard title="Summary">
            <dl className="m-0 space-y-4 text-body-sm">
              <div>
                <dt className="text-micro text-muted-foreground">Items</dt>
                <dd className="mt-1 text-foreground">
                  {lines.length > 0 && (
                    <>
                      {lines.length} product{lines.length === 1 ? "" : "s"}
                    </>
                  )}
                  {lines.length > 0 && customLines.length > 0 && " · "}
                  {customLines.length > 0 &&
                    `${customLines.length} custom request${customLines.length === 1 ? "" : "s"}`}{" "}
                  · {totalUnits.toLocaleString()} units
                </dd>
              </div>
              <div>
                <dt className="text-micro text-muted-foreground">Ship to</dt>
                <dd className="mt-1 text-foreground">
                  {selectedAddress ? (
                    <>
                      {selectedAddress.label}
                      <span className="block text-muted-foreground">
                        {selectedAddress.line1}
                        {selectedAddress.line2 ? `, ${selectedAddress.line2}` : ""}
                        {", "}
                        {selectedAddress.city}, {selectedAddress.province} {selectedAddress.postal}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No address selected</span>
                  )}
                </dd>
              </div>
              {requestedDeliveryDate && (
                <div>
                  <dt className="text-micro text-muted-foreground">Requested delivery date</dt>
                  <dd className="mt-1 text-foreground">
                    {formatDate(`${requestedDeliveryDate}T12:00:00`)}
                    <span className="block text-caption text-muted-foreground">
                      Requested, not guaranteed.
                    </span>
                  </dd>
                </div>
              )}
              {poNumber.trim() && (
                <div>
                  <dt className="text-micro text-muted-foreground">PO reference</dt>
                  <dd className="mt-1 text-foreground">{poNumber.trim()}</dd>
                </div>
              )}
            </dl>

            <CartTotals
              subtotal={subtotal}
              tax={tax}
              total={total}
              customCount={customLines.length}
              className="ml-0 mt-6 max-w-none border-t pt-4"
            />

            {submitError && (
              <div
                role="alert"
                className="mb-4 mt-4 rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                {submitError}
              </div>
            )}
            {showAddressError && (
              <div
                role="alert"
                className="mb-4 mt-4 rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                Choose a delivery address
              </div>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full gap-2"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Submitting…
                </>
              ) : (
                <>
                  <Check className="size-4" aria-hidden /> Submit order
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full gap-1.5 text-muted-foreground hover:text-[var(--status-danger-fg)]"
              onClick={() => setClearOpen(true)}
              disabled={submitMutation.isPending}
            >
              <Trash2 className="size-3.5" aria-hidden /> Clear cart
            </Button>
            <p className="mt-3 text-caption text-pretty leading-relaxed text-muted-foreground">
              Our order desk confirms availability, pricing and delivery before production.
              {customLines.length > 0 && " Custom requests are quoted as part of that review."}
            </p>
          </SectionCard>
        </aside>
      </form>

      {/* ── Save-list dialog ── */}
      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Save as list</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitDraft} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="draft-name">List name</Label>
              <Input
                id="draft-name"
                maxLength={120}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Weekly restock"
              />
            </div>
            {draftError && (
              <div
                role="alert"
                className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                {draftError}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraftDialogOpen(false)}
                disabled={saveDraftMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="gap-2" disabled={saveDraftMutation.isPending}>
                {saveDraftMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden /> Save list
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add address dialog ── */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add address</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAddress} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newaddr-label">Label</Label>
              <Input
                id="newaddr-label"
                maxLength={80}
                placeholder="e.g. Second Store, Danforth"
                value={addressForm.label}
                onChange={(e) => setAddressForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newaddr-line1">Street address</Label>
              <Input
                id="newaddr-line1"
                maxLength={160}
                placeholder="1082 Danforth Avenue"
                value={addressForm.line1}
                onChange={(e) => setAddressForm((f) => ({ ...f, line1: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newaddr-line2">Unit / line 2 (optional)</Label>
              <Input
                id="newaddr-line2"
                maxLength={80}
                value={addressForm.line2}
                onChange={(e) => setAddressForm((f) => ({ ...f, line2: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="newaddr-city">City</Label>
                <Input
                  id="newaddr-city"
                  maxLength={80}
                  value={addressForm.city}
                  onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newaddr-province">Province</Label>
                <Input
                  id="newaddr-province"
                  maxLength={40}
                  placeholder="ON"
                  value={addressForm.province}
                  onChange={(e) => setAddressForm((f) => ({ ...f, province: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newaddr-postal">Postal code</Label>
                <Input
                  id="newaddr-postal"
                  maxLength={20}
                  placeholder="M4C 1V2"
                  value={addressForm.postal}
                  onChange={(e) => setAddressForm((f) => ({ ...f, postal: e.target.value }))}
                />
              </div>
            </div>
            {addressFormError && (
              <div
                role="alert"
                className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                {addressFormError}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddressDialogOpen(false)}
                disabled={newAddressMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="gap-2" disabled={newAddressMutation.isPending}>
                {newAddressMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Adding…
                  </>
                ) : (
                  <>
                    <Check className="size-4" aria-hidden /> Add address
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Load-list confirm (cart would be replaced) ── */}
      <AlertDialog open={pendingDraft !== null} onOpenChange={(o) => !o && setPendingDraft(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Continue with “{pendingDraft?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Items currently in your cart will be replaced by this list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep cart</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmLoadDraft()}>Load list</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Clear-cart confirm ── */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear cart?</AlertDialogTitle>
            <AlertDialogDescription>
              Items in your cart will be removed. Saved lists are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep items</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearCartItems();
                toast({ title: "Cart cleared" });
              }}
            >
              Clear cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );

  function confirmLoadDraft() {
    if (pendingDraft) {
      loadDraftInto(pendingDraft);
      toast({ title: "List loaded" });
    }
    setPendingDraft(null);
  }
}

// ─── Local presentational bits ───────────────────────────────────────────────

/** Saved lists (drafts) menu — load an earlier cart, or delete it. */
function SavedListsMenu({
  drafts,
  deletingId,
  onLoad,
  onDelete,
}: {
  drafts: OrderDraftDto[];
  deletingId: string | null;
  onLoad: (draft: OrderDraftDto) => void;
  onDelete: (draft: OrderDraftDto) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <List className="size-4" aria-hidden />
          Saved lists
          {drafts.length > 0 && (
            <span className="tnum text-caption text-muted-foreground">{drafts.length}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {drafts.length === 0 ? (
          <p className="px-2 py-2 text-caption text-muted-foreground">No saved lists</p>
        ) : (
          drafts.map((d) => (
            <DropdownMenuItem
              key={d.id}
              className="flex cursor-pointer items-center gap-2 py-2"
              onSelect={() => onLoad(d)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-foreground">{d.name}</span>
                <span className="block text-caption text-muted-foreground">
                  {d.lineCount.toLocaleString()} item{d.lineCount === 1 ? "" : "s"} · saved {timeAgo(d.updatedAt)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                disabled={deletingId === d.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(d);
                }}
                aria-label={`Delete list ${d.name}`}
              >
                {deletingId === d.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
              </Button>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpecsToggle({
  open,
  filled,
  onClick,
}: {
  open: boolean;
  filled: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        "mt-1 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded text-caption transition-colors",
        open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <SlidersHorizontal className="size-3.5" aria-hidden />
      Specifications & note
      {filled && (
        <>
          <span className="size-1.5 rounded-full bg-kraft-strong" aria-hidden />
          <span className="sr-only">(details added)</span>
        </>
      )}
    </button>
  );
}

function LineExtrasPanel({
  idPrefix,
  extras,
  onChange,
}: {
  idPrefix: string;
  extras: LineExtras;
  onChange: (next: LineExtras) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-micro text-muted-foreground">Specifications (optional)</p>
        <SpecFieldsEditor
          idPrefix={idPrefix}
          specs={extras.specs}
          onChange={(specs) => onChange({ ...extras, specs })}
        />
      </div>
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor={`${idPrefix}-note`} className="text-caption text-muted-foreground">
          Line note (optional)
        </Label>
        <Input
          id={`${idPrefix}-note`}
          maxLength={500}
          placeholder="e.g. Partial deliveries acceptable"
          value={extras.note}
          onChange={(e) => onChange({ ...extras, note: e.target.value })}
        />
      </div>
      <AttachmentPicker
        idPrefix={idPrefix}
        attachments={extras.attachments}
        onChange={(attachments) => onChange({ ...extras, attachments })}
      />
    </div>
  );
}

function CartTotals({
  subtotal,
  tax,
  total,
  customCount,
  className,
}: {
  subtotal: number;
  tax: number;
  total: number;
  customCount: number;
  className?: string;
}) {
  const rateLabel = useMemo(() => `${DEFAULT_TAX_RATE_BP / 100}%`, []);
  return (
    <div className={cn("ml-auto w-full max-w-xs space-y-1.5", className)}>
      <div className="flex items-baseline justify-between text-body-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <MoneyWithCode cents={subtotal} />
      </div>
      <div className="flex items-baseline justify-between text-body-sm">
        <span className="text-muted-foreground">Estimated GST ({rateLabel})</span>
        <MoneyWithCode cents={tax} />
      </div>
      <Separator className="my-2" />
      <div className="flex items-baseline justify-between">
        <span className="text-body-sm font-medium">Estimated total</span>
        <MoneyWithCode cents={total} className="font-display text-title font-normal" />
      </div>
      <p className="pt-1 text-right text-caption text-pretty text-muted-foreground">
        Estimated only. Final tax is computed on the confirmed order.
        {customCount > 0 && " Custom requests are priced after review."}
      </p>
    </div>
  );
}
