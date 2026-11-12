"use client";

// Administration — order list across all customer organizations: workflow
// status filtering (grouped), saved view chips, per-row action menus, and
// bulk actions (status, publish update, export) on top of the search/filter
// toolbar.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  Clock,
  Download,
  MoreHorizontal,
  PackageCheck,
  PencilLine,
  Phone,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { OrderSourceBadge, StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { api, downloadFile } from "@/lib/api-client";
import { formatDate } from "@/lib/date";
import {
  ORDER_REQUEST_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_TERMINAL_STATUSES,
} from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { OrderDetail, OrderListItem, CustomerListItem } from "@/types";
import { AdminNewOrderDialog } from "./admin-new-order-dialog";
import { PublishUpdateDialog } from "./publish-update-dialog";
import { InlineError, RowsSkeleton, SearchField, SectionCard, Td, Th, Toolbar, useDebouncedValue, ViewEnter } from "./admin-ui";
import { cn } from "@/lib/utils";

const ALL = "ALL";
const REQUEST_SET = new Set<string>(ORDER_REQUEST_STATUSES);
const VALID_STATUS = new Set<string>([...ORDER_STATUSES, "CANCELLED", "REJECTED"]);

type SavedView = "all" | "needs-review" | "delayed" | "dispatching";

type SheetState =
  | { kind: "single"; orderId: string; mode: "standard" | "delay"; presetCategory?: string }
  | { kind: "multi"; orders: OrderListItem[] };

function initialStatus(aux?: string): string {
  if (aux === "requests" || aux === "SUBMITTED") return "SUBMITTED";
  if (aux && VALID_STATUS.has(aux)) return aux;
  return ALL;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Delayed approximation from the loaded rows: ETA passed while still open. */
function isDelayedRow(o: OrderListItem): boolean {
  if (ORDER_TERMINAL_STATUSES.includes(o.status)) return false;
  return o.estimatedDelivery != null && new Date(o.estimatedDelivery).getTime() < startOfToday();
}

function isDispatchingRow(o: OrderListItem): boolean {
  if (o.status !== "READY_FOR_SHIPMENT" && o.status !== "DISPATCHED") return false;
  if (!o.estimatedDelivery) return false;
  return new Date(o.estimatedDelivery).getTime() <= startOfToday() + 7 * 24 * 60 * 60 * 1000;
}

const SAVED_VIEW_CHIPS: { id: SavedView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs-review", label: "Needs review" },
  { id: "delayed", label: "Delayed" },
  { id: "dispatching", label: "Dispatching this week" },
];

export function AdminOrdersView() {
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const aux = useAppStore((s) => s.view.aux);

  const [status, setStatus] = useState<string>(() => initialStatus(aux));
  const [orgId, setOrgId] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [savedView, setSavedView] = useState<SavedView>("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>(ALL);
  const [bulkPending, setBulkPending] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<OrderListItem | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  // Re-sync the status filter when the entry-point changes (KPI drill-down vs
  // the plain sidebar entry) — render-time adjustment so nav always shows the
  // full list.
  const [prevAux, setPrevAux] = useState(aux);
  if (aux !== prevAux) {
    setPrevAux(aux);
    setStatus(initialStatus(aux));
    setOrgId(ALL);
    setSearch("");
    setSavedView("all");
  }

  const { data: customers } = useQuery({
    queryKey: ["admin", "customers", ""],
    queryFn: () => api.get<CustomerListItem[]>("/api/admin/customers?search="),
  });

  // Saved-view chips are quick presets that override the status filter: fetch
  // without a status restriction and narrow client-side.
  const serverStatus = savedView === "all" ? status : ALL;
  const params = new URLSearchParams();
  if (serverStatus !== ALL) params.set("status", serverStatus);
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  if (orgId !== ALL) params.set("orgId", orgId);
  const qs = params.toString();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "orders", { status: serverStatus, search: debouncedSearch.trim(), orgId }],
    queryFn: () => api.get<OrderListItem[]>(`/api/admin/orders${qs ? `?${qs}` : ""}`),
  });

  const orders = data ?? [];
  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const needsReviewCount = useMemo(() => orders.filter((o) => REQUEST_SET.has(o.status)).length, [orders]);
  const delayedCount = useMemo(() => orders.filter(isDelayedRow).length, [orders]);
  const dispatchingCount = useMemo(() => orders.filter(isDispatchingRow).length, [orders]);
  const savedViewCounts: Record<SavedView, number> = {
    all: orders.length,
    "needs-review": needsReviewCount,
    delayed: delayedCount,
    dispatching: dispatchingCount,
  };

  const visibleOrders = useMemo(() => {
    switch (savedView) {
      case "needs-review":
        return orders.filter((o) => REQUEST_SET.has(o.status));
      case "delayed":
        return orders.filter(isDelayedRow);
      case "dispatching":
        return orders.filter(isDispatchingRow);
      default:
        return orders;
    }
  }, [orders, savedView]);

  // Keep the selection anchored to rows that are actually loaded.
  useEffect(() => {
    if (!data) return;
    setSelectedIds((ids) => (ids.length === 0 ? ids : ids.filter((id) => data.some((o) => o.id === id))));
  }, [data]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOrders = useMemo(
    () => selectedIds.map((id) => ordersById.get(id)).filter((o): o is OrderListItem => o != null),
    [selectedIds, ordersById],
  );
  const visibleIds = useMemo(() => visibleOrders.map((o) => o.id), [visibleOrders]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someSelected = visibleIds.some((id) => selectedSet.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((ids) => {
      if (allSelected) return ids.filter((id) => !visibleIds.includes(id));
      return [...new Set([...ids, ...visibleIds])];
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  const filtersActive =
    status !== ALL || orgId !== ALL || search.trim() !== "" || savedView !== "all";

  function resetFilters() {
    setStatus(ALL);
    setOrgId(ALL);
    setSearch("");
    setSavedView("all");
  }

  function invalidateOrderScope() {
    queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "attention"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string; toast: string }) =>
      api.post<{ ok: boolean }>(`/api/admin/orders/${vars.id}/status`, { status: vars.status }),
    onSuccess: (_res, vars) => {
      invalidateOrderScope();
      queryClient.invalidateQueries({ queryKey: ["admin", "order", vars.id] });
      toast({ title: vars.toast });
    },
    onError: (err: Error) => toast({ title: "Could not update status", description: err.message }),
  });

  async function applyBulkStatus() {
    if (bulkStatus === ALL || selectedIds.length === 0) return;
    setBulkPending(true);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) => api.post<{ ok: boolean }>(`/api/admin/orders/${id}/status`, { status: bulkStatus })),
    );
    setBulkPending(false);
    const failed = results.filter((r) => r.status === "rejected");
    invalidateOrderScope();
    setSelectedIds([]);
    setBulkStatus(ALL);
    if (failed.length > 0) {
      toast({ title: "Some statuses failed", description: `${failed.length} of ${ids.length} orders.` });
    } else {
      toast({ title: "Statuses updated" });
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      // With filters active, export exactly what is listed; otherwise the full book.
      const ids = filtersActive ? visibleOrders.map((o) => o.id).join(",") : "";
      await downloadFile(
        `/api/admin/orders/export${ids ? `?ids=${encodeURIComponent(ids)}` : ""}`,
        `clienthub-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast({ title: "Orders exported" });
    } catch (err) {
      toast({
        title: "Could not export",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setExporting(false);
    }
  }

  async function exportSelected() {
    setExporting(true);
    try {
      const ids = selectedIds.join(",");
      await downloadFile(
        `/api/admin/orders/export?format=csv&ids=${encodeURIComponent(ids)}`,
        `clienthub-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast({ title: "Orders exported" });
    } catch (err) {
      toast({
        title: "Could not export",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setExporting(false);
    }
  }

  // ── Publish-update sheet (single order needs the full detail, fetched) ──
  const sheetSingleId = sheet?.kind === "single" ? sheet.orderId : "";
  const {
    data: sheetOrder,
    isError: sheetIsError,
    error: sheetError,
  } = useQuery({
    queryKey: ["admin", "order", sheetSingleId],
    queryFn: () => api.get<OrderDetail>(`/api/admin/orders/${sheetSingleId}`),
    enabled: sheet?.kind === "single",
  });

  useEffect(() => {
    if (sheet?.kind === "single" && sheetIsError) {
      toast({
        title: "Could not load order",
        description: sheetError instanceof Error ? sheetError.message : undefined,
      });
      setSheet(null);
    }
  }, [sheet, sheetIsError, sheetError]);

  function openSheet(
    order: OrderListItem,
    mode: "standard" | "delay",
    presetCategory?: string,
  ) {
    setSheet({ kind: "single", orderId: order.id, mode, presetCategory });
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || orders.length === 0}
              onClick={exportCsv}
            >
              <Download className="size-3.5" aria-hidden />
              {exporting ? "Preparing…" : "Export CSV"}
            </Button>
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <Phone className="size-3.5" aria-hidden />
              Record order
            </Button>
          </div>
        }
      />

      <ViewEnter>
      <Toolbar>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setSavedView("all");
          }}
        >
          <SelectTrigger size="sm" className="h-9 w-full sm:w-[230px] text-body-sm" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectGroup>
              <SelectLabel className="text-micro">Requests awaiting review</SelectLabel>
              {ORDER_REQUEST_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-micro">Fulfilment</SelectLabel>
              {(["CONFIRMED", "PROCESSING", "IN_PRODUCTION", "READY_FOR_SHIPMENT", "DISPATCHED", "DELIVERED"] as const).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </SelectItem>
                ),
              )}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-micro">Closed</SelectLabel>
              {(["CANCELLED", "REJECTED"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger size="sm" className="h-9 w-full sm:w-[230px] text-body-sm" aria-label="Filter by customer">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All customers</SelectItem>
            {(customers ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search order #, product…"
          ariaLabel="Search orders"
          className="sm:max-w-[260px]"
        />

        <div className="ml-auto flex items-center gap-2">
          {orders.length > 0 && (
            <p className="tnum whitespace-nowrap text-caption text-muted-foreground">
              {visibleOrders.length} {visibleOrders.length === 1 ? "order" : "orders"}
            </p>
          )}
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={resetFilters}
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Button>
          )}
        </div>
      </Toolbar>

      {/* Saved views — quick presets that override the status filter */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {SAVED_VIEW_CHIPS.map((chip) => {
          const active = savedView === chip.id;
          const count = savedViewCounts[chip.id];
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSavedView(chip.id);
                if (chip.id !== "all") setStatus(ALL);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-muted-foreground hover:border-ring/40 hover:bg-accent",
              )}
            >
              {chip.label}
              {chip.id !== "all" && count > 0 && (
                <span className={cn("tnum", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isError ? (
        <InlineError message={error instanceof Error ? error.message : "Could not load orders."} />
      ) : isLoading ? (
        <SectionCard>
          <RowsSkeleton rows={7} />
        </SectionCard>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={filtersActive ? "No matching orders" : "No orders yet"}
          action={
            filtersActive ? (
              <Button variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : visibleOrders.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No matching orders" />
      ) : (
        <SectionCard bodyClassName="p-0">
          {/* Desktop table */}
          <div className="hidden max-h-[60vh] overflow-auto md:block">
            <Table className="min-w-[920px]">
              <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <TableRow className="hover:bg-transparent">
                  <Th className="w-10">
                    <Checkbox
                      aria-label="Select all listed orders"
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAll}
                    />
                  </Th>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Placed</Th>
                  <Th>Summary</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                  <Th>Est. delivery</Th>
                  <Th className="w-12" aria-label="Row actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOrders.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => navigate("admin-order-detail", { id: o.id })}
                  >
                    <Td>
                      <Checkbox
                        aria-label={`Select ${o.orderNumber}`}
                        checked={selectedSet.has(o.id)}
                        onCheckedChange={() => toggleSelected(o.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="rounded font-mono text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("admin-order-detail", { id: o.id });
                        }}
                      >
                        {o.orderNumber}
                      </button>
                    </Td>
                    <Td>
                      <p className="max-w-[190px] truncate">{o.orgName ?? "—"}</p>
                      {o.orgCode && <p className="font-mono text-caption text-muted-foreground">{o.orgCode}</p>}
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{formatDate(o.createdAt)}</Td>
                    <Td className="max-w-[210px] truncate text-muted-foreground">{o.itemSummary}</Td>
                    <Td className="text-right font-medium">
                      <Money cents={o.totalCents} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge status={o.status} kind="order" />
                        {o.sourceType && <OrderSourceBadge source={o.sourceType} />}
                      </div>
                      {o.hasPendingChangeRequest && <ChangeRequestedChip />}
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{formatDate(o.estimatedDelivery)}</Td>
                    <Td className="text-right">
                      <OrderRowMenu
                        order={o}
                        onStatus={(statusValue, toastTitle) =>
                          statusMutation.mutate({ id: o.id, status: statusValue, toast: toastTitle })
                        }
                        onDecline={() => setDeclineTarget(o)}
                        onPublish={(mode, presetCategory) => openSheet(o, mode, presetCategory)}
                      />
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <ul className="space-y-3 p-4 md:hidden">
            {visibleOrders.map((o) => (
              <li key={o.id} className="flex items-start gap-2">
                <div className="pt-4">
                  <Checkbox
                    aria-label={`Select ${o.orderNumber}`}
                    checked={selectedSet.has(o.id)}
                    onCheckedChange={() => toggleSelected(o.id)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate("admin-order-detail", { id: o.id })}
                  className="min-w-0 flex-1 rounded-[14px] border bg-card p-4 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-body-sm font-medium">{o.orderNumber}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <StatusBadge status={o.status} kind="order" />
                      {o.sourceType && <OrderSourceBadge source={o.sourceType} />}
                    </div>
                  </div>
                  {o.hasPendingChangeRequest && (
                    <div className="mt-1.5">
                      <ChangeRequestedChip />
                    </div>
                  )}
                  <p className="mt-1.5 truncate text-body-sm font-medium">{o.orgName ?? "—"}</p>
                  <p className="mt-0.5 truncate text-caption text-muted-foreground">
                    {o.itemSummary} · {formatDate(o.createdAt)}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between border-t pt-2.5">
                    <span className="text-caption text-muted-foreground">
                      Est. delivery {formatDate(o.estimatedDelivery)}
                    </span>
                    <Money cents={o.totalCents} className="text-body-sm font-medium" />
                  </div>
                </button>
                <div className="pt-3">
                  <OrderRowMenu
                    order={o}
                    onStatus={(statusValue, toastTitle) =>
                      statusMutation.mutate({ id: o.id, status: statusValue, toast: toastTitle })
                    }
                    onDecline={() => setDeclineTarget(o)}
                    onPublish={(mode, presetCategory) => openSheet(o, mode, presetCategory)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      </ViewEnter>

      {/* Bulk action bar — sticky within the content, never fixed over the shell */}
      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 z-30 mt-4 mb-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border bg-card px-4 py-3 shadow-lg">
            <p className="tnum text-body-sm font-medium">
              {selectedIds.length} {selectedIds.length === 1 ? "order" : "orders"} selected
            </p>
            <div className="flex items-center gap-2">
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger size="sm" className="h-8 w-[170px] text-body-sm" aria-label="Bulk change status">
                  <SelectValue placeholder="Change status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Change status</SelectItem>
                  <SelectGroup>
                    <SelectLabel className="text-micro">Fulfilment workflow</SelectLabel>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ORDER_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-micro text-[var(--status-danger-fg)]">Closed</SelectLabel>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={bulkStatus === ALL || bulkPending}
                onClick={applyBulkStatus}
              >
                {bulkPending ? "Applying…" : "Apply"}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSheet({ kind: "multi", orders: selectedOrders })}
            >
              <Send className="size-3.5" aria-hidden />
              Publish update
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exporting}
              onClick={exportSelected}
            >
              <Download className="size-3.5" aria-hidden />
              {exporting ? "Preparing…" : "Export"}
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <AdminNewOrderDialog open={recordOpen} onOpenChange={setRecordOpen} />

      {/* Decline confirmation */}
      <AlertDialog open={declineTarget !== null} onOpenChange={(v) => !v && setDeclineTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline {declineTarget?.orderNumber}?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              The customer is notified and the order moves to Rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
              disabled={statusMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!declineTarget) return;
                statusMutation.mutate(
                  { id: declineTarget.id, status: "REJECTED", toast: "Order declined" },
                  { onSuccess: () => setDeclineTarget(null) },
                );
              }}
            >
              {statusMutation.isPending ? "Declining…" : "Decline order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish update sheet */}
      {sheet?.kind === "single" && sheetOrder && sheetOrder.id === sheet.orderId && (
        <PublishUpdateDialog
          orderId={sheetOrder.id}
          order={sheetOrder}
          mode={sheet.mode}
          presetCategory={sheet.presetCategory}
          open
          onOpenChange={(v) => {
            if (!v) setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "multi" && sheet.orders.length > 0 && (
        <PublishUpdateDialog
          orders={sheet.orders}
          open
          onOpenChange={(v) => {
            if (!v) setSheet(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Row actions dropdown ────────────────────────────────────────────────────

function OrderRowMenu({
  order,
  onStatus,
  onDecline,
  onPublish,
}: {
  order: OrderListItem;
  onStatus: (status: string, toast: string) => void;
  onDecline: () => void;
  onPublish: (mode: "standard" | "delay", presetCategory?: string) => void;
}) {
  const isRequest = REQUEST_SET.has(order.status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Row actions for ${order.orderNumber}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isRequest && (
          <DropdownMenuItem onClick={() => onStatus("CONFIRMED", "Order accepted")}>
            <Check className="size-3.5" aria-hidden />
            Accept
          </DropdownMenuItem>
        )}
        {isRequest && (
          <DropdownMenuItem variant="destructive" onClick={onDecline}>
            <Ban className="size-3.5" aria-hidden />
            Decline
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onPublish("standard", "INFO")}>
          <PencilLine className="size-3.5" aria-hidden />
          Request changes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onPublish("standard")}>
          <Send className="size-3.5" aria-hidden />
          Publish update
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPublish("delay")}>
          <Clock className="size-3.5" aria-hidden />
          Delay announcement
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">Change status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ORDER_STATUSES.filter((s) => s !== order.status).map((s) => (
              <DropdownMenuItem key={s} onClick={() => onStatus(s, "Status updated")}>
                {ORDER_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {(["CANCELLED", "REJECTED"] as const)
              .filter((s) => s !== order.status)
              .map((s) => (
                <DropdownMenuItem key={s} variant="destructive" onClick={() => onStatus(s, "Status updated")}>
                  {ORDER_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChangeRequestedChip() {
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-kraft-soft px-1.5 py-0.5 text-caption font-medium text-kraft-ink">
      <span className="size-1.5 rounded-full bg-kraft" aria-hidden />
      Change requested
    </span>
  );
}
