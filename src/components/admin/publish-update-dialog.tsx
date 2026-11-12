"use client";

// Update Centre composer — publish or draft a customer-facing progress update
// for one order, or the same update to several orders at once. Templates
// pre-fill the message with placeholders; a live preview shows exactly what the
// customer will see. Delay mode shortcuts the delay notice workflow.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, FileText, Paperclip, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpdateCategoryBadge } from "@/components/shared/update-timeline";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/date";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  UPDATE_CATEGORIES,
  UPDATE_CATEGORY_LABELS,
} from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type {
  AttachmentMeta,
  OrderDetail,
  OrderListItem,
  OrderUpdateDto,
  TemplateRenderContext,
  UpdateTemplateDto,
} from "@/types";
import { FieldError, GroupLabel } from "./admin-ui";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const KEEP = "__keep__";

/** Date-ish ISO → yyyy-mm-dd for <input type="date"> controls. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  return m ? m[0] : "";
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Replace {{placeholders}} with values resolved against this order. */
function renderPlaceholders(body: string, ctx: TemplateRenderContext): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) =>
    key in ctx ? ctx[key] : match,
  );
}

// ─── Attachment picker (metadata-only registry) ──────────────────────────────

function AttachmentPicker({
  value,
  onChange,
}: {
  value: AttachmentMeta[];
  onChange: (next: AttachmentMeta[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const existing = new Set(value.map((a) => a.name));
    const added: AttachmentMeta[] = [];
    for (const file of Array.from(files)) {
      if (existing.has(file.name)) continue;
      added.push({ name: file.name, sizeLabel: fileSizeLabel(file.size) });
    }
    if (added.length > 0) onChange([...value, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Attach files"
        onChange={(e) => pick(e.target.files)}
      />
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-caption text-muted-foreground"
            >
              <Paperclip className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{a.name}</span>
              <span className="shrink-0 text-muted-foreground/70">{a.sizeLabel}</span>
              <button
                type="button"
                className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${a.name}`}
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-3.5" aria-hidden />
        {value.length === 0 ? "Attach files" : "Add more"}
      </Button>
      <p className="text-caption leading-snug text-muted-foreground">
        Files are registered by name and size. Attachments live with your document store.
      </p>
    </div>
  );
}

// ─── The composer ────────────────────────────────────────────────────────────

export function PublishUpdateDialog({
  orderId,
  order,
  orderIds,
  orders,
  mode = "standard",
  presetCategory,
  open,
  onOpenChange,
  update,
}: {
  /** Primary order (single-order mode). */
  orderId?: string;
  /** Full order context for single-order mode. */
  order?: OrderDetail;
  /** Bulk mode: publish the same update to each of these orders. */
  orderIds?: string[];
  /** Lightweight row context for bulk mode (placeholders + labels). */
  orders?: OrderListItem[];
  /** Delay mode preselects a DELAY template and focuses the revised date. */
  mode?: "standard" | "delay";
  /** Preselect the first template with this category when the sheet opens. */
  presetCategory?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When provided, the sheet edits an existing (unpublished) update draft. */
  update?: OrderUpdateDto;
}) {
  const session = useAppStore((s) => s.session);
  const queryClient = useQueryClient();

  const targetIds = useMemo(() => {
    if (orders && orders.length > 0) return orders.map((o) => o.id);
    if (orderIds && orderIds.length > 0) return orderIds;
    if (orderId) return [orderId];
    return [];
  }, [orders, orderIds, orderId]);
  const multi = targetIds.length > 1;
  const primaryId = targetIds[0] ?? "";

  const { data: templates } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => api.get<UpdateTemplateDto[]>("/api/admin/templates"),
    enabled: open,
  });

  /** Placeholder context resolved against one order (list row or detail). */
  const contextFor = (id: string): TemplateRenderContext => {
    if (order && order.id === id) {
      return {
        customer_name: order.orgName,
        order_number: order.orderNumber,
        product_name: order.items[0]?.name ?? "",
        quantity: order.items[0] ? order.items[0].qty.toLocaleString() : "",
        estimated_delivery: order.estimatedDelivery ? formatDate(order.estimatedDelivery) : "to be confirmed",
        revised_delivery: order.revisedDeliveryDate ? formatDate(order.revisedDeliveryDate) : "—",
        admin_name: session?.user.name ?? "",
      };
    }
    const row = orders?.find((o) => o.id === id);
    return {
      customer_name: row?.orgName ?? order?.orgName ?? "",
      order_number: row?.orderNumber ?? order?.orderNumber ?? "",
      product_name: "",
      quantity: "",
      estimated_delivery: row?.estimatedDelivery
        ? formatDate(row.estimatedDelivery)
        : order?.estimatedDelivery
          ? formatDate(order.estimatedDelivery)
          : "to be confirmed",
      revised_delivery: order?.revisedDeliveryDate ? formatDate(order.revisedDeliveryDate) : "—",
      admin_name: session?.user.name ?? "",
    };
  };
  const context = contextFor(primaryId);

  function invalidateAll() {
    if (multi) {
      for (const id of targetIds) {
        queryClient.invalidateQueries({ queryKey: ["admin", "order", id] });
      }
    } else {
      queryClient.invalidateQueries({ queryKey: ["admin", "order", primaryId] });
    }
    queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "attention"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        message: form.message.trim(),
        newStatus: !multi && form.newStatus ? form.newStatus : undefined,
        estimatedDelivery: !multi && form.estimatedDelivery ? form.estimatedDelivery : undefined,
        revisedDelivery: form.revisedDelivery || undefined,
        nextUpdateDate: form.nextUpdateDate || undefined,
        attachments: form.attachments.length > 0 ? form.attachments : undefined,
        publish,
      };
      if (update && !multi) {
        return api.patch<OrderUpdateDto>(`/api/admin/orders/${primaryId}/updates/${update.id}`, payload);
      }
      if (!multi) {
        return api.post<OrderUpdateDto>(`/api/admin/orders/${primaryId}/updates`, payload);
      }
      // Bulk mode: the same update to each selected order, placeholders resolved
      // against each order in turn.
      const results = await Promise.allSettled(
        targetIds.map((id) =>
          api.post<OrderUpdateDto>(`/api/admin/orders/${id}/updates`, {
            ...payload,
            message: renderPlaceholders(payload.message, contextFor(id)),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        throw new Error(`${failed.length} of ${targetIds.length} updates failed.`);
      }
      return null;
    },
    onSuccess: (_res, publish) => {
      invalidateAll();
      onOpenChange(false);
      toast({
        title: multi
          ? publish
            ? "Updates published"
            : "Updates saved"
          : publish
            ? "Update published"
            : update
              ? "Draft updated"
              : "Draft saved",
      });
      save.reset();
    },
    onError: (err: Error) => toast({ title: "Could not save update", description: err.message }),
  });

  const removeDraft = useMutation({
    mutationFn: () => api.del<{ ok: boolean }>(`/api/admin/orders/${primaryId}/updates/${update?.id}`),
    onSuccess: () => {
      invalidateAll();
      onOpenChange(false);
      toast({ title: "Draft deleted" });
      removeDraft.reset();
    },
    onError: (err: Error) => toast({ title: "Could not delete draft", description: err.message }),
  });

  // Form state — re-initialized each time the sheet opens (render-time
  // adjustment, the same pattern used for milestone forms elsewhere).
  const [form, setForm] = useState(() => initialForm(update, mode));
  const [templateId, setTemplateId] = useState<string>(NONE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [openSeq, setOpenSeq] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const [presetKey, setPresetKey] = useState("");
  const lastNonDelayCategory = useRef<string>("INFO");
  const revisedRef = useRef<HTMLInputElement>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setOpenSeq((s) => s + 1);
      setForm(initialForm(update, mode));
      setTemplateId(NONE);
      setSubmitError(null);
    }
  }

  // Preselect a template when the sheet opens in delay mode or with a preset
  // category (e.g. "Request changes" → INFO). Applied once per open, as soon
  // as the templates list is available.
  if (open && templates != null) {
    const nextPresetKey = `preset:${openSeq}`;
    if (presetKey !== nextPresetKey) {
      setPresetKey(nextPresetKey);
      const wanted = mode === "delay" ? "DELAY" : presetCategory;
      if (wanted != null) {
        const template = templates.find((t) => t.category === wanted);
        if (template) {
          setTemplateId(template.id);
          setForm((f) => ({
            ...f,
            title: template.title,
            category: template.category,
            message: multi ? template.body : renderPlaceholders(template.body, context),
          }));
        }
      }
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) setConfirmDelete(false);
    onOpenChange(v);
  }

  // Delay mode opens with the revised delivery date focused.
  useEffect(() => {
    if (!open || mode !== "delay") return;
    const t = setTimeout(() => revisedRef.current?.focus(), 180);
    return () => clearTimeout(t);
  }, [open, mode]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (id === NONE) return;
    const template = (templates ?? []).find((t) => t.id === id);
    if (!template) return;
    if (template.category !== "DELAY" && form.category !== "DELAY") {
      lastNonDelayCategory.current = template.category;
    }
    setForm((f) => ({
      ...f,
      title: template.title,
      category: template.category,
      message: multi ? template.body : renderPlaceholders(template.body, context),
    }));
  }

  const delayOn = form.category === "DELAY";

  function toggleDelay(on: boolean) {
    setForm((f) => ({ ...f, category: on ? "DELAY" : lastNonDelayCategory.current }));
    if (on) setTimeout(() => revisedRef.current?.focus(), 60);
  }

  const previewMessage = multi ? renderPlaceholders(form.message, context) : form.message;

  const hasStatusOrDates =
    (!multi && form.newStatus !== "" && form.newStatus !== (order?.status ?? "")) ||
    (!multi && form.estimatedDelivery !== "") ||
    form.revisedDelivery !== "" ||
    form.nextUpdateDate !== "";

  function submit(publish: boolean) {
    setSubmitError(null);
    if (!form.title.trim() || !form.message.trim()) {
      setSubmitError("A title and a message are required before saving.");
      return;
    }
    save.mutate(publish);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-l p-0 sm:max-w-[560px]"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(true);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetHeader className="border-b pr-10">
            <SheetTitle>
              {multi ? `Publish update, ${targetIds.length} orders` : update ? "Edit draft" : "Publish update"}
            </SheetTitle>
            <SheetDescription className="leading-relaxed">
              {multi
                ? `The same update goes to ${targetIds.length} orders.`
                : order
                  ? `Publishing notifies ${order.orgName} immediately. Drafts stay internal.`
                  : "Publishing notifies the customer immediately."}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {/* Template picker */}
            {(templates ?? []).length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="upd-template" className="text-body-sm">
                  Start from a template
                </Label>
                <Select value={templateId} onValueChange={applyTemplate}>
                  <SelectTrigger id="upd-template" className="h-9 w-full text-body-sm" aria-label="Start from a template">
                    <SelectValue placeholder="Start from a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Start from a template…</SelectItem>
                    {(templates ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                        <span className="ml-1.5 text-caption text-muted-foreground">
                          · {UPDATE_CATEGORY_LABELS[t.category] ?? t.category}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-caption leading-snug text-muted-foreground">
                  {multi ? "Placeholders resolve per order on publish." : "Placeholders fill automatically. Edit before publishing."}
                </p>
              </div>
            )}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="upd-title" className="text-body-sm">
                  Title
                </Label>
                <Input
                  id="upd-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Production underway, dispatch Friday"
                  className="h-9 text-body-sm"
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="upd-category" className="text-body-sm">
                  Category
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => {
                    if (v !== "DELAY") lastNonDelayCategory.current = v;
                    setForm((f) => ({ ...f, category: v }));
                  }}
                >
                  <SelectTrigger id="upd-category" className="h-9 w-full text-body-sm" aria-label="Update category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPDATE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {UPDATE_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upd-message" className="text-body-sm">
                Message
              </Label>
              <Textarea
                id="upd-message"
                rows={6}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="What the customer should know about the progress of their order…"
                className="leading-relaxed"
                maxLength={4000}
                required
              />
            </div>

            <div className="space-y-3">
              <GroupLabel>Optional: status &amp; dates applied on publish</GroupLabel>

              {/* Delay notice toggle — shortcuts the delay workflow */}
              <div className="flex items-center justify-between gap-3 rounded-md border bg-secondary/50 px-3 py-2.5">
                <Label htmlFor="upd-delay" className="flex items-center gap-1.5 text-body-sm">
                  <Clock className="size-3.5" aria-hidden />
                  Delay notice
                </Label>
                <Switch
                  id="upd-delay"
                  checked={delayOn}
                  onCheckedChange={toggleDelay}
                  aria-label="Delay notice"
                />
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                {!multi && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="upd-status" className="text-body-sm">
                        New status
                      </Label>
                      <Select
                        value={form.newStatus === "" ? KEEP : form.newStatus}
                        onValueChange={(v) => setForm((f) => ({ ...f, newStatus: v === KEEP ? "" : v }))}
                      >
                        <SelectTrigger id="upd-status" className="h-9 w-full text-body-sm" aria-label="New order status">
                          <SelectValue placeholder="Keep current status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={KEEP}>Keep current status</SelectItem>
                          <SelectGroup>
                            <SelectLabel className="text-micro">Fulfilment workflow</SelectLabel>
                            {ORDER_STATUSES.map((s) => (
                              <SelectItem key={s} value={s} disabled={order != null && s === order.status}>
                                {ORDER_STATUS_LABELS[s]}
                                {order != null && s === order.status ? " (current)" : ""}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel className="text-micro text-[var(--status-danger-fg)]">
                              Terminal, notifies customer
                            </SelectLabel>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                            <SelectItem value="REJECTED">Rejected</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="upd-eta" className="flex items-center gap-1.5 text-body-sm">
                        <CalendarClock className="size-3" aria-hidden /> Estimated delivery
                      </Label>
                      <Input
                        id="upd-eta"
                        type="date"
                        value={form.estimatedDelivery}
                        onChange={(e) => setForm((f) => ({ ...f, estimatedDelivery: e.target.value }))}
                        className="h-9 text-body-sm"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="upd-revised"
                    className={cn("flex items-center gap-1.5 text-body-sm", delayOn && "text-kraft-ink")}
                  >
                    {delayOn && <span className="size-1.5 rounded-full bg-kraft" aria-hidden />}
                    Revised delivery
                  </Label>
                  <Input
                    id="upd-revised"
                    ref={revisedRef}
                    type="date"
                    value={form.revisedDelivery}
                    onChange={(e) => setForm((f) => ({ ...f, revisedDelivery: e.target.value }))}
                    className={cn("h-9 text-body-sm", delayOn && "border-kraft/60")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upd-next" className="text-body-sm">
                    Next expected update
                  </Label>
                  <Input
                    id="upd-next"
                    type="date"
                    value={form.nextUpdateDate}
                    onChange={(e) => setForm((f) => ({ ...f, nextUpdateDate: e.target.value }))}
                    className="h-9 text-body-sm"
                  />
                  <p className="text-caption leading-snug text-muted-foreground">
                    The customer will see this date as the next expected update.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm">Attachments</Label>
              <AttachmentPicker
                value={form.attachments}
                onChange={(attachments) => setForm((f) => ({ ...f, attachments }))}
              />
            </div>

            {submitError && <FieldError>{submitError}</FieldError>}

            {hasStatusOrDates && (
              <p className="flex items-start gap-2 rounded-md border bg-secondary/50 px-3 py-2.5 text-caption leading-relaxed text-muted-foreground">
                <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {multi
                  ? "Publishing applies the revised date to each selected order and notifies every customer."
                  : `Publishing applies the new status and notifies ${order?.orgName ?? "the customer"}.`}
              </p>
            )}

            {/* Live customer preview */}
            <div className="space-y-1.5">
              <GroupLabel>Customer preview</GroupLabel>
              <div className="rounded-[10px] bg-surface-sunken p-4">
                <article
                  className={cn(
                    "rounded-[14px] border bg-card px-4 py-4",
                    delayOn && "border-kraft/40 bg-kraft-soft/60",
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h3 className="text-body font-medium leading-tight text-foreground">
                      {form.title.trim() || "Untitled update"}
                    </h3>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <UpdateCategoryBadge category={form.category} />
                    {!multi && form.newStatus && (
                      <span className="inline-flex h-[22px] items-center rounded-full border bg-card px-2.5 text-caption font-medium text-muted-foreground">
                        Status → {ORDER_STATUS_LABELS[form.newStatus] ?? form.newStatus}
                      </span>
                    )}
                  </div>
                  <p className="mt-2.5 whitespace-pre-line text-body-sm leading-relaxed text-foreground/90">
                    {previewMessage.trim() || "Your message will appear here."}
                  </p>
                  {(form.revisedDelivery || (!multi && form.estimatedDelivery) || form.nextUpdateDate) && (
                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded-[10px] border bg-surface-sunken/70 px-3.5 py-2.5 sm:grid-cols-2">
                      {form.revisedDelivery ? (
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-micro shrink-0 text-muted-foreground">Revised delivery</dt>
                          <dd className="tnum text-body-sm font-medium text-kraft-ink">
                            {formatDate(form.revisedDelivery)}
                          </dd>
                        </div>
                      ) : !multi && form.estimatedDelivery ? (
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-micro shrink-0 text-muted-foreground">Estimated delivery</dt>
                          <dd className="tnum text-body-sm font-medium">{formatDate(form.estimatedDelivery)}</dd>
                        </div>
                      ) : null}
                      {form.nextUpdateDate && (
                        <div className="flex items-baseline gap-1.5">
                          <CalendarClock className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
                          <dt className="text-micro shrink-0 text-muted-foreground">Next update expected</dt>
                          <dd className="tnum text-body-sm font-medium">{formatDate(form.nextUpdateDate)}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {form.attachments.length > 0 && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {form.attachments.map((a, i) => (
                        <li
                          key={`${a.name}-${i}`}
                          className="inline-flex h-[22px] max-w-full items-center gap-1.5 truncate rounded-full border bg-card px-2.5 text-caption text-muted-foreground"
                          title={`${a.name} (${a.sizeLabel})`}
                        >
                          <Paperclip className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{a.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
                {multi && (
                  <p className="mt-2 text-caption text-muted-foreground">
                    Placeholders resolve per order. This preview uses {orders?.[0]?.orderNumber ?? "the first order"}.
                  </p>
                )}
              </div>
            </div>
          </div>

          <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
            {update && !update.isPublished && !multi && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto gap-1.5 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                disabled={removeDraft.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete draft
              </Button>
            )}
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit(false)}>
              {save.isPending && !save.variables ? "Saving…" : multi ? "Save drafts" : update ? "Save changes" : "Save as draft"}
            </Button>
            <Button type="submit" className="gap-1.5" disabled={save.isPending}>
              {save.isPending && save.variables ? "Publishing…" : multi ? "Publish updates" : update ? "Publish now" : "Publish update"}
            </Button>
          </SheetFooter>
        </form>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this draft update?</AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                The unpublished draft disappears from {order?.orderNumber ?? "this order"}. The customer never saw it, and
                published updates are unaffected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep draft</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
                disabled={removeDraft.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  removeDraft.mutate();
                }}
              >
                {removeDraft.isPending ? "Deleting…" : "Delete draft"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function initialForm(update: OrderUpdateDto | undefined, mode: "standard" | "delay") {
  return {
    title: update?.title ?? "",
    category: update?.category ?? (mode === "delay" ? "DELAY" : "INFO"),
    message: update?.message ?? "",
    newStatus: update?.newStatus ?? "",
    estimatedDelivery: toDateInput(update?.estimatedDelivery),
    revisedDelivery: toDateInput(update?.revisedDelivery),
    nextUpdateDate: toDateInput(update?.nextUpdateDate),
    attachments: update?.attachments ? [...update.attachments] : [],
  };
}
