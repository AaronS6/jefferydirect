"use client";

// Administration — order detail, upgraded for the Update Centre: the fulfilment
// workflow control (status/tracking/ETA) is preserved, alongside the customer
// update timeline with drafts, change-request review, internal notes and the
// explicit milestone-date editor.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BellRing,
  Building2,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Ban,
  ChevronDown,
  FileText,
  Lock,
  MapPin,
  MessageSquareText,
  Paperclip,
  PencilLine,
  Receipt,
  Send,
  StickyNote,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { ChangeStatusBadge, DocumentCategoryBadge, OrderSourceBadge } from "@/components/shared/status-badge";
import { Money, MoneyWithCode } from "@/components/shared/money";
import { OrderTimeline } from "@/components/shared/order-timeline";
import { UpdateTimeline } from "@/components/shared/update-timeline";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime, timeAgo } from "@/lib/date";
import {
  CHANGE_REQUEST_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { ChangeItem, ChangeRequestDto, LineSpecs, OrderDetail, OrderUpdateDto } from "@/types";
import { DefRow, FieldError, GroupLabel, InlineError, RowsSkeleton, SectionCard, Td, Th, ViewEnter, dashed } from "./admin-ui";
import { PublishUpdateDialog } from "./publish-update-dialog";
import { cn } from "@/lib/utils";

// Underline tab bar with a kraft indicator — matches the customer detail view.
const TAB_TRIGGER =
  "h-9 flex-none justify-start rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-3 py-2 data-[state=active]:rounded-none data-[state=active]:border-b-kraft data-[state=active]:bg-transparent data-[state=active]:text-kraft-ink data-[state=active]:shadow-none";

/** Date-ish ISO → yyyy-mm-dd for <input type="date"> controls. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  return m ? m[0] : "";
}

/** One human-readable sentence for a single requested change. */
function describeChange(item: ChangeItem): string {
  switch (item.kind) {
    case "QUANTITY": {
      const label = item.name ?? item.sku ?? "product";
      return `Quantity, ${label}: ${(item.currentQty ?? 0).toLocaleString()} → ${(item.newQty ?? 0).toLocaleString()}`;
    }
    case "SPEC": {
      const label = item.name ?? item.sku;
      return `Specification, ${label ? `${label}: ` : ""}${item.spec ?? "—"}`;
    }
    case "ADD":
      return `Add ${item.name ?? "product"}${item.newQty ? ` × ${item.newQty.toLocaleString()}` : ""}`;
    case "REMOVE":
      return `Remove ${item.name ?? item.sku ?? "product"}`;
    case "ADDRESS":
      return `Delivery address: ${item.newAddress ?? "—"}`;
    case "DATE":
      return `Delivery date → ${item.newDate ? formatDate(item.newDate) : "—"}`;
    case "CANCEL":
      return "Cancel order";
    case "OTHER":
      return `Other: ${item.note ?? "—"}`;
  }
}

const SPEC_LABELS: Partial<Record<keyof LineSpecs, string>> = {
  dimensions: "Dimensions",
  length: "Length",
  width: "Width",
  height: "Height",
  material: "Material",
  thickness: "Thickness",
  printing: "Printing",
  colour: "Colour",
  qtyPerCase: "Qty per case",
};

function SpecChips({ specs }: { specs: LineSpecs }) {
  const entries = (Object.entries(specs) as [keyof LineSpecs, string | undefined][])
    .filter(([, v]) => v && v.trim())
    .slice(0, 8);
  if (entries.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <li
          key={key}
          className="inline-flex max-w-full items-center rounded-full border bg-card px-2 text-caption text-muted-foreground"
          title={value}
        >
          {key === "custom" ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="truncate">
              {SPEC_LABELS[key] ?? key}: {value}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ItemAttachmentChips({ attachments }: { attachments: { name: string; sizeLabel: string }[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {attachments.map((a, i) => (
        <li
          key={`${a.name}-${i}`}
          className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border bg-card px-2 text-caption text-muted-foreground"
          title={`${a.name} (${a.sizeLabel})`}
        >
          <Paperclip className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{a.name}</span>
        </li>
      ))}
    </ul>
  );
}

type MilestoneForm = {
  requestedDeliveryDate: string;
  estimatedDispatch: string;
  estimatedDelivery: string;
  revisedDeliveryDate: string;
  actualDeliveryDate: string;
  nextUpdateDate: string;
  trackingNumber: string;
};

function initMilestones(order: OrderDetail): MilestoneForm {
  return {
    requestedDeliveryDate: toDateInput(order.requestedDeliveryDate),
    estimatedDispatch: toDateInput(order.estimatedDispatch),
    estimatedDelivery: toDateInput(order.estimatedDelivery),
    revisedDeliveryDate: toDateInput(order.revisedDeliveryDate),
    actualDeliveryDate: toDateInput(order.actualDeliveryDate),
    nextUpdateDate: toDateInput(order.nextUpdateDate),
    trackingNumber: order.trackingNumber ?? "",
  };
}

const EMPTY_MILESTONES: MilestoneForm = {
  requestedDeliveryDate: "",
  estimatedDispatch: "",
  estimatedDelivery: "",
  revisedDeliveryDate: "",
  actualDeliveryDate: "",
  nextUpdateDate: "",
  trackingNumber: "",
};

export function AdminOrderDetailView({ orderId }: { orderId: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "order", orderId],
    queryFn: () => api.get<OrderDetail>(`/api/admin/orders/${orderId}`),
  });

  function invalidateOrderScope() {
    queryClient.invalidateQueries({ queryKey: ["admin", "order", orderId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "attention"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  // ─── Workflow control: header status dropdown ───────────────────────
  const [pendingTerminal, setPendingTerminal] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.post<{ ok: boolean }>(`/api/admin/orders/${orderId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "attention"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setPendingTerminal(null);
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => toast({ title: "Could not update status", description: err.message }),
  });

  // ─── Update Centre state ───────────────────────────────────────────────────
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<OrderUpdateDto | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<OrderUpdateDto | null>(null);

  function openPublish(draft?: OrderUpdateDto) {
    setEditingDraft(draft ?? null);
    setPublishOpen(true);
  }

  const deleteDraft = useMutation({
    mutationFn: (draftId: string) => api.del<{ ok: boolean }>(`/api/admin/orders/${orderId}/updates/${draftId}`),
    onSuccess: () => {
      invalidateOrderScope();
      setDeletingDraft(null);
      toast({ title: "Draft deleted" });
    },
    onError: (err: Error) => toast({ title: "Could not delete draft", description: err.message }),
  });

  // ─── Milestone dates state (re-synced when the order reloads) ─────────────
  const [milestones, setMilestones] = useState<MilestoneForm>(() =>
    order ? initMilestones(order) : EMPTY_MILESTONES,
  );
  const [milestoneKey, setMilestoneKey] = useState<string>("");
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  const saveMilestones = useMutation({
    mutationFn: () =>
      api.patch<{ ok: boolean }>(`/api/admin/orders/${orderId}/fields`, {
        requestedDeliveryDate: milestones.requestedDeliveryDate || null,
        estimatedDispatch: milestones.estimatedDispatch || null,
        estimatedDelivery: milestones.estimatedDelivery || null,
        revisedDeliveryDate: milestones.revisedDeliveryDate || null,
        actualDeliveryDate: milestones.actualDeliveryDate || null,
        nextUpdateDate: milestones.nextUpdateDate || null,
        trackingNumber: milestones.trackingNumber.trim() || null,
      }),
    onSuccess: () => {
      invalidateOrderScope();
      toast({ title: "Milestone dates saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save dates", description: err.message }),
  });

  // ─── Internal notes ────────────────────────────────────────────────────────
  const [noteBody, setNoteBody] = useState("");
  const addNote = useMutation({
    mutationFn: (body: string) => api.post<{ ok: boolean }>(`/api/admin/orders/${orderId}/internal-notes`, { body }),
    onSuccess: () => {
      invalidateOrderScope();
      setNoteBody("");
      toast({ title: "Internal note added" });
    },
    onError: (err: Error) => toast({ title: "Could not add note", description: err.message }),
  });

  if (isError) {
    return (
      <div>
        <PageHeader title="Order" onBack={back} />
        <InlineError message={error instanceof Error ? error.message : "Could not load this order."} />
      </div>
    );
  }

  if (isLoading || !order) {
    return (
      <div>
        <PageHeader title="Order" onBack={back} />
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_360px]">
          <SectionCard>
            <RowsSkeleton rows={4} />
          </SectionCard>
          <SectionCard>
            <RowsSkeleton rows={4} />
          </SectionCard>
        </div>
      </div>
    );
  }

  // Adjust milestone form state when the order identity/revision changes
  // (documented React pattern — assign state during render).
  const orderKey = `${order.id}:${order.updatedAt}`;
  if (milestoneKey !== orderKey) {
    setMilestoneKey(orderKey);
    setMilestones(initMilestones(order));
  }

  const drafts = order.updates.filter((u) => !u.isPublished);
  const milestonesDirty =
    JSON.stringify(milestones) !== JSON.stringify(initMilestones(order));
  const internalNotes = order.internalNotes ?? [];
  const activity = buildActivity(order);

  function submitMilestones() {
    setMilestoneError(null);
    if (milestones.trackingNumber.trim().length > 80) {
      setMilestoneError("Tracking numbers are limited to 80 characters.");
      return;
    }
    saveMilestones.mutate();
  }

  function submitNote(body: string): boolean {
    if (!body.trim()) return false;
    addNote.mutate(body.trim());
    return true;
  }

  return (
    <div>
      <PageHeader
        title={order.orgName}
        onBack={back}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate("admin-customer-detail", { id: order.orgId })}
            >
              <Building2 className="size-3.5" aria-hidden />
              <span className="font-mono text-caption text-muted-foreground">{order.orgCode}</span>
              Profile
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" aria-label="Change order status">
                  <span className="text-caption text-muted-foreground">Status:</span>
                  <span>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
                  <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-micro">Fulfilment workflow</DropdownMenuLabel>
                {ORDER_STATUSES.map((s) => (
                  <DropdownMenuItem key={s} disabled={s === order.status} onClick={() => statusMutation.mutate(s)}>
                    {ORDER_STATUS_LABELS[s]}
                    {s === order.status && (
                      <DropdownMenuShortcut className="text-caption">Current</DropdownMenuShortcut>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-micro text-[var(--status-danger-fg)]">
                  Terminal, notifies customer
                </DropdownMenuLabel>
                {(["CANCELLED", "REJECTED"] as const).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    variant="destructive"
                    disabled={s === order.status}
                    onClick={() => setPendingTerminal(s)}
                  >
                    {ORDER_STATUS_LABELS[s]}
                    {s === order.status && (
                      <DropdownMenuShortcut className="text-caption">Current</DropdownMenuShortcut>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <OrderSourceBadge source={order.sourceType} />
          </div>
        }
      />

      <ViewEnter>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <SectionCard title="Order items">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Product</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Line total</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <Td className="max-w-[320px] whitespace-normal">
                      <p className="font-medium">{item.name}</p>
                      <p className="font-mono text-caption text-muted-foreground">{item.sku}</p>
                      {item.note && <p className="text-caption text-muted-foreground">{item.note}</p>}
                      {!item.productId && (
                        <p className="mt-0.5 text-caption font-medium text-kraft-ink">Pricing to be confirmed</p>
                      )}
                      {item.specs && <SpecChips specs={item.specs} />}
                      <ItemAttachmentChips attachments={item.attachments} />
                    </Td>
                    <Td className="tnum text-right">{item.qty.toLocaleString()}</Td>
                    <Td className="text-right">
                      <Money cents={item.unitPriceCents} />
                    </Td>
                    <Td className="text-right font-medium">
                      <Money cents={item.lineTotalCents} />
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <Td className="text-right text-muted-foreground">Subtotal</Td>
                  <Td />
                  <Td />
                  <Td className="text-right">
                    <Money cents={order.subtotalCents} />
                  </Td>
                </TableRow>
                <TableRow>
                  <Td className="text-right text-muted-foreground">
                    GST ({(order.taxRateBp / 100).toFixed(1)}%)
                  </Td>
                  <Td />
                  <Td />
                  <Td className="text-right">
                    <Money cents={order.taxCents} />
                  </Td>
                </TableRow>
                <TableRow>
                  <Td className="text-right font-medium">Total</Td>
                  <Td />
                  <Td />
                  <Td className="text-right font-semibold">
                    <MoneyWithCode cents={order.totalCents} />
                  </Td>
                </TableRow>
              </TableFooter>
            </Table>
          </SectionCard>

          {/* ── Updates / Internal / Activity ── */}
          <Tabs defaultValue="updates" className="min-w-0 gap-4 sm:gap-5">
            <TabsList className="h-auto w-full max-w-full flex-wrap justify-start gap-0.5 rounded-none border-b bg-transparent p-0 sm:w-auto sm:flex-nowrap">
              <TabsTrigger value="updates" className={TAB_TRIGGER}>
                Updates
              </TabsTrigger>
              <TabsTrigger value="internal" className={TAB_TRIGGER} title="Internal only">
                <Lock className="size-3.5" aria-hidden />
                Internal
              </TabsTrigger>
              <TabsTrigger value="activity" className={TAB_TRIGGER}>
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Updates — the update centre */}
            <TabsContent value="updates" className="space-y-4 sm:space-y-6">
              <SectionCard
                title="Customer updates"
                action={
                  <Button variant="kraft" size="sm" className="gap-1.5" onClick={() => openPublish()}>
                    <Send className="size-3.5" aria-hidden />
                    Publish update
                  </Button>
                }
              >
                <UpdateTimeline updates={order.updates} admin />

                {drafts.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <GroupLabel>Drafts ({drafts.length}), internal only</GroupLabel>
                    <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-md border bg-surface-sunken/70">
                      {drafts.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body-sm font-medium">{d.title}</p>
                            <p className="truncate text-caption text-muted-foreground">
                              Saved {timeAgo(d.createdAt)} · {d.authorName}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-muted-foreground"
                              onClick={() => openPublish(d)}
                            >
                              <PencilLine className="size-3" aria-hidden />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                              onClick={() => setDeletingDraft(d)}
                            >
                              <Trash2 className="size-3" aria-hidden />
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </SectionCard>

              {order.changeRequests.length > 0 && (
                <SectionCard title="Change requests">
                  <div className="space-y-4">
                    {order.changeRequests.map((request) => (
                      <ChangeRequestCard key={request.id} request={request} onDecided={invalidateOrderScope} />
                    ))}
                  </div>
                </SectionCard>
              )}
            </TabsContent>

            {/* Internal — notes never shown to the customer */}
            <TabsContent value="internal" className="space-y-4 sm:space-y-6">
              <SectionCard
                title={
                  <span className="flex items-center gap-2">
                    <Lock className="size-4 shrink-0 text-kraft-ink" aria-hidden />
                    Internal notes
                  </span>
                }
                description="Internal only"
                className="border-l-2 border-l-kraft bg-surface-sunken"
              >
                {internalNotes.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-card/60 px-4 py-5 text-center text-body-sm text-muted-foreground">
                    No internal notes yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {internalNotes.map((n) => (
                      <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-body-sm font-medium">{n.authorName}</p>
                          <p className="tnum shrink-0 text-caption text-muted-foreground">{timeAgo(n.createdAt)}</p>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line text-body-sm leading-relaxed text-foreground/90">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 border-t pt-4">
                  <Textarea
                    rows={3}
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="e.g. Confirmed die-line with plant manager, plate ready Tuesday"
                    className="bg-card leading-relaxed"
                    aria-label="New internal note"
                    maxLength={2000}
                  />
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      Internal only
                    </p>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={!noteBody.trim() || addNote.isPending}
                      onClick={() => submitNote(noteBody)}
                    >
                      <StickyNote className="size-3.5" aria-hidden />
                      {addNote.isPending ? "Adding…" : "Add internal note"}
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </TabsContent>

            {/* Activity — the order timeline as a single log */}
            <TabsContent value="activity" className="space-y-4 sm:space-y-6">
              <SectionCard title="Activity">
                <ActivityTimeline entries={activity} />
              </SectionCard>
            </TabsContent>
          </Tabs>

          {/* ── Fulfilment details ── */}
          <SectionCard title="Fulfilment details">
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <div className="min-w-0">
                <GroupLabel className="mb-1.5 flex items-center gap-1.5">
                  <MapPin className="size-3" aria-hidden /> Ship to
                </GroupLabel>
                <p className="text-body-sm leading-relaxed">{dashed(order.shippingText)}</p>
                <dl className="mt-3 divide-y divide-border/60">
                  <DefRow label="PO number" value={dashed(order.poNumber)} />
                  <DefRow
                    label="Tracking"
                    value={order.trackingNumber ? <span className="font-mono text-body-sm">{order.trackingNumber}</span> : "—"}
                  />
                  <DefRow
                    label="Reorder of"
                    value={order.reorderSource ? <span className="font-mono text-body-sm">{order.reorderSource}</span> : "—"}
                  />
                </dl>
              </div>
              <div className="mt-4 min-w-0 sm:mt-0">
                <GroupLabel className="mb-1.5 flex items-center gap-1.5">
                  <MessageSquareText className="size-3" aria-hidden /> Instructions from customer
                </GroupLabel>
                <p className="text-body-sm leading-relaxed text-muted-foreground">
                  {dashed(order.notes)}
                </p>
                <dl className="mt-3 divide-y divide-border/60">
                  <DefRow label="Requested" value={dashed(order.requestedDelivery)} />
                </dl>
              </div>
            </dl>
            <dl className="mt-4 grid gap-x-8 border-t pt-3 sm:grid-cols-2">
              <div className="divide-y divide-border/60 sm:col-span-2">
                <DefRow label="Requested delivery" value={dashed(formatDate(order.requestedDeliveryDate))} />
                <DefRow label="Est. dispatch" value={dashed(formatDate(order.estimatedDispatch))} />
                <DefRow label="Est. delivery" value={dashed(formatDate(order.estimatedDelivery))} />
                <DefRow
                  label="Revised delivery"
                  value={
                    order.revisedDeliveryDate ? (
                      <span className="font-medium text-kraft-ink">{formatDate(order.revisedDeliveryDate)}</span>
                    ) : (
                      "—"
                    )
                  }
                />
                <DefRow label="Actual delivery" value={dashed(formatDate(order.actualDeliveryDate))} />
                <DefRow label="Next expected update" value={dashed(formatDate(order.nextUpdateDate))} />
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Status history">
            <OrderTimeline status={order.status} history={order.history} />
          </SectionCard>

          {order.documents.length > 0 && (
            <SectionCard title="Related documents">
              <ul className="flex flex-wrap gap-2">
                {order.documents.map((doc) => (
                  <li key={doc.id}>
                    <span className="inline-flex max-w-full items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-caption">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate font-medium">{doc.title}</span>
                      <DocumentCategoryBadge category={doc.category} />
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>

        {/* Right column — milestone facts */}
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:sticky lg:top-[84px]">
          {/* ── Milestone dates ── */}
          <SectionCard title="Milestone dates">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="ms-requested" className="text-body-sm">
                    Requested delivery
                  </Label>
                  <Input
                    id="ms-requested"
                    type="date"
                    value={milestones.requestedDeliveryDate}
                    onChange={(e) => setMilestones((m) => ({ ...m, requestedDeliveryDate: e.target.value }))}
                    className="h-9 text-body-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ms-dispatch" className="text-body-sm">
                    Est. dispatch
                  </Label>
                  <Input
                    id="ms-dispatch"
                    type="date"
                    value={milestones.estimatedDispatch}
                    onChange={(e) => setMilestones((m) => ({ ...m, estimatedDispatch: e.target.value }))}
                    className="h-9 text-body-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ms-eta" className="text-body-sm">
                    Est. delivery
                  </Label>
                  <Input
                    id="ms-eta"
                    type="date"
                    value={milestones.estimatedDelivery}
                    onChange={(e) => setMilestones((m) => ({ ...m, estimatedDelivery: e.target.value }))}
                    className="h-9 text-body-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ms-revised" className="text-body-sm">
                    Revised delivery
                  </Label>
                  <Input
                    id="ms-revised"
                    type="date"
                    value={milestones.revisedDeliveryDate}
                    onChange={(e) => setMilestones((m) => ({ ...m, revisedDeliveryDate: e.target.value }))}
                    className="h-9 text-body-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ms-actual" className="text-body-sm">
                    Actual delivery
                  </Label>
                  <Input
                    id="ms-actual"
                    type="date"
                    value={milestones.actualDeliveryDate}
                    onChange={(e) => setMilestones((m) => ({ ...m, actualDeliveryDate: e.target.value }))}
                    className="h-9 text-body-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ms-next" className="flex items-center gap-1.5 text-body-sm">
                    <CalendarClock className="size-3" aria-hidden /> Next update
                  </Label>
                  <Input
                    id="ms-next"
                    type="date"
                    value={milestones.nextUpdateDate}
                    onChange={(e) => setMilestones((m) => ({ ...m, nextUpdateDate: e.target.value }))}
                    className="h-9 text-body-sm"
                  />
                </div>
              </div>
              <p className="text-caption leading-snug text-muted-foreground">
                The next-update date is an internal reminder. It never notifies the customer.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="ms-tracking" className="flex items-center gap-1.5 text-body-sm">
                  <Truck className="size-3" aria-hidden /> Tracking no.
                </Label>
                <Input
                  id="ms-tracking"
                  value={milestones.trackingNumber}
                  onChange={(e) => setMilestones((m) => ({ ...m, trackingNumber: e.target.value }))}
                  placeholder={order.trackingNumber ?? "Add tracking"}
                  className="h-9 font-mono text-body-sm"
                />
              </div>
              {milestoneError && <FieldError>{milestoneError}</FieldError>}
              <Button
                className="w-full gap-1.5"
                disabled={!milestonesDirty || saveMilestones.isPending}
                onClick={submitMilestones}
              >
                <CalendarDays className="size-4" aria-hidden />
                {saveMilestones.isPending ? "Saving…" : "Save dates"}
              </Button>
              <p className="text-caption leading-snug text-muted-foreground">
                Clear a date to remove it. Saving never notifies the customer.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Summary">
            <dl>
              <DefRow
                label="Customer"
                value={
                  <button
                    type="button"
                    onClick={() => navigate("admin-customer-detail", { id: order.orgId })}
                    className="text-left underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {order.orgName}
                  </button>
                }
              />
              <DefRow label="Order value" value={<MoneyWithCode cents={order.totalCents} />} />
              <DefRow label="Last updated" value={formatDateTime(order.updatedAt)} />
              {order.sourceType !== "PORTAL" && (
                <>
                  <DefRow label="Source" value={ORDER_SOURCE_LABELS[order.sourceType] ?? order.sourceType} />
                  {order.recordedByName && <DefRow label="Recorded by" value={order.recordedByName} />}
                </>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => navigate("admin-notifications")}
              >
                <BellRing className="size-3.5" aria-hidden /> Open message log
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => navigate("admin-documents")}
              >
                <Receipt className="size-3.5" aria-hidden /> Related documents
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
      </ViewEnter>

      {/* ─── Dialogs ─────────────────────────────────────────────────────────── */}
      <PublishUpdateDialog
        orderId={orderId}
        order={order}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        update={editingDraft ?? undefined}
      />

      {/* Terminal status confirmation (header dropdown) */}
      <AlertDialog open={pendingTerminal !== null} onOpenChange={(v) => !v && setPendingTerminal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Set {order.orderNumber} to {pendingTerminal ? ORDER_STATUS_LABELS[pendingTerminal] : "terminal"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              The customer is notified and this is recorded permanently in the order history. Terminal statuses end the
              fulfilment workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order open</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
              disabled={statusMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingTerminal) statusMutation.mutate(pendingTerminal);
              }}
            >
              {statusMutation.isPending
                ? "Updating…"
                : `Yes, mark ${pendingTerminal ? ORDER_STATUS_LABELS[pendingTerminal] : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingDraft !== null} onOpenChange={(v) => !v && setDeletingDraft(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft “{deletingDraft?.title}”?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              The unpublished draft disappears from {order.orderNumber}. The customer never saw it, and published
              updates are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
              disabled={deleteDraft.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingDraft) deleteDraft.mutate(deletingDraft.id);
              }}
            >
              {deleteDraft.isPending ? "Deleting…" : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Activity log (Updates / Internal / Activity tab) ────────────────────────

type ActivityEntry = {
  id: string;
  when: string;
  what: React.ReactNode;
  who: string;
};

function excerpt(body: string, max = 120): string {
  const t = body.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** One chronological list: status changes, published updates, change requests, internal notes. */
function buildActivity(order: OrderDetail): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const h of order.history) {
    entries.push({
      id: `history:${h.id}`,
      when: h.createdAt,
      what: (
        <>
          Status → {ORDER_STATUS_LABELS[h.status] ?? h.status}
          {h.note ? ` · ${h.note}` : ""}
        </>
      ),
      who: h.byName ?? "Jeffery Group",
    });
  }
  for (const u of order.updates) {
    if (!u.isPublished) continue;
    entries.push({
      id: `update:${u.id}`,
      when: u.publishedAt ?? u.createdAt,
      what: <>Update published · {u.title}</>,
      who: u.authorName,
    });
  }
  for (const c of order.changeRequests) {
    entries.push({
      id: `change:${c.id}`,
      when: c.createdAt,
      what: (
        <>
          Change request · {CHANGE_REQUEST_STATUS_LABELS[c.status] ?? c.status.toLowerCase()}
          {c.changes.length > 0 ? ` · ${describeChange(c.changes[0])}` : ""}
          {c.changes.length > 1 ? ` · +${c.changes.length - 1} more` : ""}
        </>
      ),
      who: c.requestedByName,
    });
  }
  for (const n of order.internalNotes ?? []) {
    entries.push({
      id: `note:${n.id}`,
      when: n.createdAt,
      what: <>Internal note · {excerpt(n.body)}</>,
      who: n.authorName,
    });
  }

  return entries.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

/** Vertical timeline mirroring OrderTimeline's visual language: hairline spine, ink dots, dates right. */
function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-card/60 px-4 py-5 text-center text-body-sm text-muted-foreground">
        No activity yet.
      </p>
    );
  }
  return (
    <ol className="relative">
      {entries.map((entry, i) => (
        <li key={entry.id} className="relative flex gap-3.5 pb-4 last:pb-0">
          {i < entries.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[6.5px] top-[18px] h-[calc(100%-14px)] w-px bg-foreground/25"
            />
          )}
          <span className="relative z-10 mt-[2px] flex size-[14px] shrink-0 items-center justify-center rounded-full bg-foreground">
            <span className="size-[4.5px] rounded-full bg-background" />
          </span>
          <div className="min-w-0 flex-1 -translate-y-[2px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="min-w-0 flex-1 text-body-sm leading-relaxed text-foreground/90">{entry.what}</p>
              <p className="tnum shrink-0 text-caption text-muted-foreground">{formatDateTime(entry.when)}</p>
            </div>
            <p className="mt-0.5 text-caption text-muted-foreground">{entry.who}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Change request review card ──────────────────────────────────────────────

function ChangeRequestCard({
  request,
  onDecided,
}: {
  request: ChangeRequestDto;
  onDecided: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [countering, setCountering] = useState(false);
  const [counterQty, setCounterQty] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      request.changes
        .map((c, i) => (c.kind === "QUANTITY" && c.newQty != null ? [i, String(c.newQty)] : null))
        .filter((v): v is [number, string] => v !== null),
    ),
  );
  const [counterDate, setCounterDate] = useState<string>(() => {
    const dateItem = request.changes.find((c) => c.kind === "DATE" && c.newDate);
    return dateItem?.newDate ? toDateInput(dateItem.newDate) : "";
  });
  const [counterNote, setCounterNote] = useState("");
  const [counterError, setCounterError] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: (payload: { decision: "ACCEPT" | "DECLINE" | "COUNTER"; note?: string; counter?: ChangeItem[] }) =>
      api.post<{ ok: boolean }>(`/api/admin/change-requests/${request.id}/decide`, payload),
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "order", request.orderId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "attention"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onDecided();
      setConfirmApprove(false);
      setDeclineOpen(false);
      setDeclineNote("");
      setCountering(false);
      toast({
        title:
          payload.decision === "ACCEPT"
            ? "Change approved and applied"
            : payload.decision === "DECLINE"
              ? "Change request declined"
              : "Alternative proposed",
      });
    },
    onError: (err: Error) => toast({ title: "Could not record decision", description: err.message }),
  });

  const pending = request.status === "PENDING";

  function buildCounter(): ChangeItem[] | null {
    const items: ChangeItem[] = request.changes.map((c, i) => {
      if (c.kind === "QUANTITY" && counterQty[i] !== undefined) {
        const qty = parseInt(counterQty[i], 10);
        if (!Number.isFinite(qty) || qty < 1) return c;
        return { ...c, newQty: qty };
      }
      if (c.kind === "DATE" && counterDate) return { ...c, newDate: counterDate };
      return c;
    });
    const badQty = request.changes.some((c, i) => {
      if (c.kind !== "QUANTITY" || counterQty[i] === undefined) return false;
      const qty = parseInt(counterQty[i], 10);
      return !Number.isFinite(qty) || qty < 1;
    });
    if (badQty) {
      setCounterError("Quantities must be whole numbers of at least 1.");
      return null;
    }
    setCounterError(null);
    return items;
  }

  return (
    <article className="rounded-[14px] border bg-card shadow-xs">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b px-4 py-3 sm:px-4">
        <ChangeStatusBadge status={request.status} />
        <p className="text-body-sm font-medium">
          {request.requestedByName}
          <span className="ml-1 font-normal text-muted-foreground">requested {timeAgo(request.createdAt)}</span>
        </p>
        {request.appliedAt && (
          <span className="rounded-full bg-[var(--status-done-bg)] px-1.5 py-0.5 text-micro font-medium text-[var(--status-done-fg)]">
            applied
          </span>
        )}
      </div>

      <div className="space-y-3 px-4 py-3.5 sm:px-4">
        <ul className="space-y-1.5">
          {request.changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-body-sm leading-relaxed">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
              <span>{describeChange(c)}</span>
            </li>
          ))}
        </ul>

        {request.requestNote && (
          <div className="rounded-md border bg-secondary/50 px-3 py-2.5">
            <GroupLabel>Customer&apos;s note</GroupLabel>
            <p className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-foreground/90">
              {request.requestNote}
            </p>
          </div>
        )}

        {/* Decision trail */}
        {request.status === "ACCEPTED" && (
          <div className="rounded-md bg-[var(--status-done-bg)] px-3 py-2.5">
            <p className="text-caption font-medium text-[var(--status-done-fg)]">
              Approved{request.adminName ? ` by ${request.adminName}` : ""}
              {request.decidedAt ? ` · ${formatDate(request.decidedAt)}` : ""}
              {request.appliedAt ? " · applied" : ""}
            </p>
            {request.decisionNote && (
              <p className="mt-1 text-body-sm leading-relaxed text-[var(--status-done-fg)]">{request.decisionNote}</p>
            )}
          </div>
        )}
        {request.status === "DECLINED" && (
          <div className="rounded-md bg-[var(--status-danger-bg)] px-3 py-2.5">
            <p className="text-caption font-medium text-[var(--status-danger-fg)]">
              Declined{request.adminName ? ` by ${request.adminName}` : ""}
              {request.decidedAt ? ` · ${formatDate(request.decidedAt)}` : ""}
            </p>
            {request.decisionNote && (
              <p className="mt-1 text-body-sm leading-relaxed text-[var(--status-danger-fg)]">{request.decisionNote}</p>
            )}
          </div>
        )}
        {request.status === "WITHDRAWN" && (
          <p className="rounded-md border bg-secondary/50 px-3 py-2.5 text-body-sm text-muted-foreground">
            Withdrawn by {request.requestedByName}. No action needed.
          </p>
        )}

        {/* Counter proposal */}
        {request.status === "COUNTERED" && request.counter && (
          <div className="rounded-md border border-kraft/30 bg-kraft-soft/60 px-3 py-2.5">
            <GroupLabel className="text-kraft-ink">Alternative proposed</GroupLabel>
            <ul className="mt-1.5 space-y-1">
              {request.counter.map((c, i) => (
                <li key={i} className="text-body-sm leading-relaxed text-kraft-ink">
                  {describeChange(c)}
                </li>
              ))}
            </ul>
            {request.counterNote && (
              <p className="mt-1.5 text-body-sm leading-relaxed text-kraft-ink">{request.counterNote}</p>
            )}
            <p className="mt-1.5 text-caption font-medium text-kraft-ink">
              {request.counterDecision
                ? `Customer ${request.counterDecision.toLowerCase()} the alternative`
                : "Awaiting customer response"}
            </p>
          </div>
        )}

        {/* Pending decision controls */}
        {pending && !countering && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={decide.isPending}
              onClick={() => setConfirmApprove(true)}
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              Approve &amp; apply
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
              disabled={decide.isPending}
              onClick={() => setDeclineOpen(true)}
            >
              <Ban className="size-3.5" aria-hidden />
              Decline
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={decide.isPending}
              onClick={() => setCountering(true)}
            >
              <ArrowLeftRight className="size-3.5" aria-hidden />
              Propose alternative
            </Button>
          </div>
        )}

        {/* Counter editor */}
        {pending && countering && (
          <div className="space-y-3 rounded-md border bg-surface-sunken/70 px-3.5 py-3">
            <GroupLabel>Propose an alternative</GroupLabel>
            <ul className="space-y-2">
              {request.changes.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-body-sm">
                  <span className="min-w-0 flex-1 text-muted-foreground">{describeChange(c)}</span>
                  {c.kind === "QUANTITY" && (
                    <span className="flex items-center gap-1.5">
                      <Label htmlFor={`counter-qty-${i}`} className="text-caption text-muted-foreground">
                        Alternative qty
                      </Label>
                      <Input
                        id={`counter-qty-${i}`}
                        inputMode="numeric"
                        value={counterQty[i] ?? ""}
                        onChange={(e) => setCounterQty((q) => ({ ...q, [i]: e.target.value }))}
                        className="tnum h-8 w-24 text-body-sm"
                        placeholder={String(c.newQty ?? "")}
                      />
                    </span>
                  )}
                  {c.kind === "DATE" && (
                    <span className="flex items-center gap-1.5">
                      <Label htmlFor="counter-date" className="text-caption text-muted-foreground">
                        Alternative date
                      </Label>
                      <Input
                        id="counter-date"
                        type="date"
                        value={counterDate}
                        onChange={(e) => setCounterDate(e.target.value)}
                        className="h-8 text-body-sm"
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <Label htmlFor="counter-note" className="text-body-sm">
                Note to the customer <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="counter-note"
                rows={3}
                value={counterNote}
                onChange={(e) => setCounterNote(e.target.value)}
                placeholder="e.g. We can accommodate 600 units at this price, let us know if that works."
                className="bg-card leading-relaxed"
                maxLength={600}
              />
            </div>
            {counterError && <FieldError>{counterError}</FieldError>}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                disabled={decide.isPending}
                onClick={() => {
                  const counter = buildCounter();
                  if (counter) {
                    decide.mutate({
                      decision: "COUNTER",
                      note: counterNote.trim() || undefined,
                      counter,
                    });
                  }
                }}
              >
                <ArrowLeftRight className="size-3.5" aria-hidden />
                {decide.isPending ? "Sending…" : "Send alternative"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setCountering(false)}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Approve confirm */}
      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve and apply this change?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Applying updates quantities and specifications on the order. {request.requestedByName} and the customer
              will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction disabled={decide.isPending} onClick={() => decide.mutate({ decision: "ACCEPT" })}>
              {decide.isPending ? "Applying…" : "Approve & apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline dialog */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              decide.mutate({ decision: "DECLINE", note: declineNote.trim() || undefined });
            }}
            className="space-y-4"
          >
            <DialogHeader className="border-b pb-4">
              <DialogTitle>Decline this change request</DialogTitle>
              <DialogDescription className="leading-relaxed">
                {request.requestedByName} will see the request was declined{declineNote.trim() ? ", with your note" : ""}.
                The order stays exactly as it is.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="decline-note" className="text-body-sm">
                Note to the customer <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="decline-note"
                rows={3}
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="e.g. The print plates are already cut for this run, happy to include it in the next order."
                className="leading-relaxed"
                maxLength={600}
              />
            </div>
            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setDeclineOpen(false)}>
                Keep request open
              </Button>
              <Button type="submit" variant="destructive" className="gap-1.5" disabled={decide.isPending}>
                <Ban className="size-4" aria-hidden />
                {decide.isPending ? "Declining…" : "Decline request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}

