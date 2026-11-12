"use client";

// Administration — customer profile: overview, contacts & addresses, product
// pricing matrix, orders, quotations, documents and internal notes.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  FileText,
  Lock,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  ReceiptText,
  Save,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import {
  OrgRoleBadge,
  StatusBadge,
  UserStatusBadge,
  DocumentCategoryBadge,
} from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { KpiCell, KpiStrip } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { PricingMatrix } from "./pricing-matrix";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/date";
import {
  ORG_ROLE_DESCRIPTIONS,
  ORG_ROLE_LABELS,
  ORG_ROLES,
} from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { CustomerProfile, MessageDto, OrgPreferences } from "@/types";
import { DefRow, GroupLabel, InlineError, RowsSkeleton, SectionCard, Td, Th, TempPasswordPanel, ViewEnter, dashed } from "./admin-ui";
import { cn } from "@/lib/utils";

export function AdminCustomerDetailView({ customerId }: { customerId: string }) {
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const { data: profile, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "customer", customerId],
    queryFn: () => api.get<CustomerProfile>(`/api/admin/customers/${customerId}`),
  });

  // Health panel — the org's message queue for the unanswered count.
  const { data: messages } = useQuery({
    queryKey: ["admin", "messages", ""],
    queryFn: () => api.get<MessageDto[]>("/api/admin/messages"),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "customer", customerId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: "ACTIVE" | "SUSPENDED") =>
      api.put<{ ok: boolean }>(`/api/admin/customers/${customerId}`, { status }),
    onSuccess: (_res, status) => {
      invalidate();
      setSuspendOpen(false);
      toast({
        title: status === "SUSPENDED" ? "Customer suspended" : "Customer reactivated",
      });
    },
    onError: (err: Error) => toast({ title: "Could not change status", description: err.message }),
  });

  if (isError) {
    return (
      <div>
        <PageHeader title="Customer" onBack={back} />
        <InlineError message={error instanceof Error ? error.message : "Could not load."} />
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div>
        <PageHeader title="Customer" onBack={back} />
        <SectionCard>
          <RowsSkeleton rows={6} />
        </SectionCard>
      </div>
    );
  }

  const { organization: org, users, addresses, orders, quotations, documents, approvedProductCount, pendingChangeRequests } = profile;

  // Health — everything derived from the profile plus the org's messages.
  const lastOrderAt = orders.length
    ? orders.reduce((latest, o) => (o.createdAt > latest.createdAt ? o : latest), orders[0]).createdAt
    : null;
  const openQuotes = quotations.filter((q) => OPEN_QUOTE_STATUSES.has(q.status)).length;
  const pricedOrders = orders.filter((o) => o.totalCents > 0);
  const avgOrderCents = pricedOrders.length
    ? Math.round(pricedOrders.reduce((sum, o) => sum + o.totalCents, 0) / pricedOrders.length)
    : null;
  const unansweredMessages = (messages ?? []).filter(
    (m) => m.status !== "ANSWERED" && messageBelongsToOrg(m, org.id, org.name),
  ).length;
  const suspended = org.status === "SUSPENDED";
  const initials = org.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // Underline tab bar with a kraft indicator — matches the portal's editorial feel.
  const TAB =
    "h-9 flex-none justify-start rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-3 py-2 data-[state=active]:rounded-none data-[state=active]:border-b-kraft data-[state=active]:bg-transparent data-[state=active]:text-kraft-ink data-[state=active]:shadow-none dark:data-[state=active]:text-kraft-ink";

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-kraft-soft text-lead text-kraft-ink"
            >
              {initials}
            </span>
            <span className="text-balance">{org.name}</span>
          </span>
        }
        onBack={back}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pendingChangeRequests > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-kraft-soft px-2 py-1 text-caption font-medium text-kraft-ink"
                title="Customer-submitted change requests awaiting your decision. Review them on the order pages"
              >
                <span className="size-1.5 rounded-full bg-kraft" aria-hidden />
                {pendingChangeRequests} change {pendingChangeRequests === 1 ? "request" : "requests"} pending
              </span>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <PencilLine className="size-3.5" aria-hidden /> Edit info
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-3.5" aria-hidden /> Invite user
            </Button>
            {suspended ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-[var(--status-done-fg)] hover:bg-[var(--status-done-bg)]"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate("ACTIVE")}
              >
                <CheckCircle2 className="size-3.5" aria-hidden /> Reactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                onClick={() => setSuspendOpen(true)}
              >
                <Ban className="size-3.5" aria-hidden /> Suspend
              </Button>
            )}
          </div>
        }
      />

      <ViewEnter>
      <Tabs defaultValue="overview" className="gap-5">
        <TabsList className="h-auto w-full max-w-full flex-wrap justify-start gap-0.5 rounded-none border-b bg-transparent p-0 sm:w-auto sm:flex-nowrap">
          <TabsTrigger value="overview" className={TAB}>Overview</TabsTrigger>
          <TabsTrigger value="contacts" className={TAB}>Contacts &amp; addresses</TabsTrigger>
          <TabsTrigger value="pricing" className={TAB}>Products &amp; pricing</TabsTrigger>
          <TabsTrigger value="orders" className={TAB}>Orders</TabsTrigger>
          <TabsTrigger value="quotes" className={TAB}>Quotes</TabsTrigger>
          <TabsTrigger value="documents" className={TAB}>Documents</TabsTrigger>
          <TabsTrigger value="internal" className={TAB}>Internal</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          <KpiStrip>
            <KpiCell label="Orders" value={orders.length.toLocaleString("en-CA")} />
            <KpiCell label="Quotes" value={quotations.length.toLocaleString("en-CA")} />
            <KpiCell label="Approved products" value={approvedProductCount.toLocaleString("en-CA")} />
            <KpiCell label="Documents" value={documents.length.toLocaleString("en-CA")} />
          </KpiStrip>

          <SectionCard title="Health" bodyClassName="p-0">
            <dl className="grid grid-cols-2 lg:grid-cols-4 [&>*]:border-border/70 [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+2)]:border-l lg:[&>*:nth-child(n+3)]:border-t-0">
              <HealthCell label="Last order" value={lastOrderAt ? formatDate(lastOrderAt) : "No orders yet"} />
              <HealthCell label="Open quotes" value={openQuotes.toLocaleString("en-CA")} />
              <HealthCell
                label="Average order value"
                value={avgOrderCents !== null ? <Money cents={avgOrderCents} /> : "No orders yet"}
              />
              <HealthCell
                label="Unanswered messages"
                value={messages === undefined ? "…" : unansweredMessages.toLocaleString("en-CA")}
              />
            </dl>
          </SectionCard>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <SectionCard title="Billing account">
              <dl>
                <DefRow label="Business" value={org.name} />
                <DefRow label="Customer code" value={<span className="font-mono text-body-sm">{org.code}</span>} />
                <DefRow label="Billing address" value={`${dashed(org.billingLine1)}, ${dashed(org.billingCity)}, ${dashed(org.billingProvince)} ${dashed(org.billingPostal)}`} />
                <DefRow label="Phone" value={dashed(org.phone)} />
              </dl>
            </SectionCard>

            <SectionCard title="Portal users">
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium">
                        {u.name}
                        {u.title && <span className="ml-1.5 text-caption font-normal text-muted-foreground">· {u.title}</span>}
                      </p>
                      <p className="truncate text-caption text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <OrgRoleBadge role={u.orgRole} />
                      <UserStatusBadge status={u.status} />
                    </div>
                  </li>
                ))}
                {users.length === 0 && (
                  <p className="rounded-md border border-dashed bg-surface-sunken/60 px-4 py-6 text-center text-body-sm text-muted-foreground">
                    No portal users yet.
                  </p>
                )}
              </ul>
            </SectionCard>
          </div>
        </TabsContent>

        {/* Contacts & addresses */}
        <TabsContent value="contacts" className="space-y-4 sm:space-y-6">
          <SectionCard
            title="Portal users"
            action={
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-3.5" aria-hidden /> Invite user
              </Button>
            }
            bodyClassName="p-0"
          >
            {users.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState
                  icon={Users}
                  title="No portal users"
                  action={
                    <Button variant="outline" onClick={() => setInviteOpen(true)}>
                      <UserPlus className="size-4" aria-hidden /> Invite user
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[780px]">
                  <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                    <TableRow className="hover:bg-transparent">
                      <Th>Name</Th>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Status</Th>
                      <Th>Last login</Th>
                      <Th className="text-center">Access</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <UserRow key={u.id} user={u} customerId={customerId} onDone={invalidate} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Shipping addresses">
            {addresses.length === 0 ? (
              <p className="rounded-md border border-dashed bg-surface-sunken/60 px-4 py-6 text-center text-body-sm text-muted-foreground">
                No shipping addresses yet.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <AddressCard key={a.id} address={a} />
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        {/* Products & pricing */}
        <TabsContent value="pricing">
          <SectionCard title="Products &amp; pricing">
            <PricingMatrix orgId={customerId} />
          </SectionCard>
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders">
          <SectionCard title="Orders" bodyClassName="p-0">
            {orders.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={ReceiptText} title="No orders yet" />
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <Table className="min-w-[700px]">
                  <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                    <TableRow className="hover:bg-transparent">
                      <Th>Order</Th>
                      <Th>Placed</Th>
                      <Th>Summary</Th>
                      <Th className="text-right">Total</Th>
                      <Th>Status</Th>
                      <Th>Est. delivery</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate("admin-order-detail", { id: o.id })}>
                        <Td>
                          <span className="font-mono text-body-sm font-medium">{o.orderNumber}</span>
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{formatDate(o.createdAt)}</Td>
                        <Td className="max-w-[210px] truncate text-muted-foreground">{o.itemSummary}</Td>
                        <Td className="text-right font-medium">
                          <Money cents={o.totalCents} />
                        </Td>
                        <Td>
                          <StatusBadge status={o.status} kind="order" />
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{formatDate(o.estimatedDelivery)}</Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Quotations */}
        <TabsContent value="quotes">
          <SectionCard title="Quotes" bodyClassName="p-0">
            {quotations.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={FileText} title="No quotes yet" />
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <Table className="min-w-[720px]">
                  <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                    <TableRow className="hover:bg-transparent">
                      <Th>Quote</Th>
                      <Th>Title</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Total</Th>
                      <Th>Created</Th>
                      <Th>Expires</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotations.map((q) => (
                      <TableRow key={q.id} className="cursor-pointer" onClick={() => navigate("admin-quote-detail", { id: q.id })}>
                        <Td>
                          <span className="font-mono text-body-sm font-medium">{q.quoteNumber}</span>
                          {q.revision > 0 && <p className="text-caption text-muted-foreground">Rev {q.revision}</p>}
                        </Td>
                        <Td className="max-w-[260px] truncate">{q.title}</Td>
                        <Td>
                          <StatusBadge status={q.status} kind="quote" />
                        </Td>
                        <Td className="text-right font-medium">
                          {q.itemsTotalCents > 0 ? <Money cents={q.itemsTotalCents} /> : <span className="text-caption text-muted-foreground">Not priced</span>}
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{formatDate(q.createdAt)}</Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{formatDate(q.expiryDate)}</Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <SectionCard title="Documents" bodyClassName="p-0">
            {documents.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={FileText}
                  title="No documents"
                  action={
                    <Button variant="outline" onClick={() => navigate("admin-documents")}>
                      Go to Documents
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-2.5 px-5 py-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium">{doc.title}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        <span className="font-mono">{doc.fileName}</span> · {doc.sizeLabel} · uploaded {formatDate(doc.createdAt)}
                        {doc.orderNumber ? ` · ${doc.orderNumber}` : ""}
                      </p>
                    </div>
                    <DocumentCategoryBadge category={doc.category} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        {/* Internal */}
        <TabsContent value="internal" className="space-y-4 sm:space-y-6">
          <RelationshipPreferencesCard
            customerId={customerId}
            preferences={org.preferences}
            users={users}
            onSaved={invalidate}
          />
          <InternalNotesCard customerId={customerId} initialNotes={org.internalNotes} onSaved={invalidate} />
        </TabsContent>
      </Tabs>
      </ViewEnter>

      {/* Suspend confirm */}
      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {org.name}?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Their portal users will be signed out and unable to sign in, place orders or receive quotes. Historical
              orders, documents and pricing are preserved, and the account can be reactivated at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
              disabled={statusMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                statusMutation.mutate("SUSPENDED");
              }}
            >
              {statusMutation.isPending ? "Suspending…" : "Yes, suspend customer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit info dialog */}
      <EditCustomerDialog open={editOpen} onOpenChange={setEditOpen} profile={profile} onSaved={invalidate} />

      {/* Invite user dialog */}
      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} customerId={customerId} onSaved={invalidate} />
    </div>
  );
}

// ─── Health panel ────────────────────────────────────────────────────────────

/** Quote statuses still in play (the rest are decided or dead). */
const OPEN_QUOTE_STATUSES: ReadonlySet<string> = new Set(["REQUESTED", "UNDER_REVIEW", "ISSUED", "REVISED"]);

/** Message rows carry orgName (no orgId in the DTO) — match either. */
function messageBelongsToOrg(m: MessageDto, orgId: string, orgName: string): boolean {
  const rowOrgId = (m as MessageDto & { orgId?: string }).orgId ?? null;
  return rowOrgId !== null ? rowOrgId === orgId : m.orgName === orgName;
}

function HealthCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-4 sm:p-5">
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd className="tnum mt-2 text-right text-lead font-medium text-foreground">{value}</dd>
    </div>
  );
}

// ─── User access row ──────────────────────────────────────────────────────────

function UserRow({
  user,
  customerId,
  onDone,
}: {
  user: CustomerProfile["users"][number];
  customerId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDisable, setConfirmDisable] = useState(false);

  const roleMutation = useMutation({
    mutationFn: (orgRole: string) =>
      api.patch<{ ok: boolean }>(`/api/admin/customers/${customerId}/users/${user.id}`, { orgRole }),
    onSuccess: (_res, orgRole) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
      onDone();
      toast({
        title: `${user.name} is now ${ORG_ROLE_LABELS[orgRole] ?? orgRole}`,
      });
    },
    onError: (err: Error) => toast({ title: "Could not change role", description: err.message }),
  });

  const toggle = useMutation({
    mutationFn: (status: "ACTIVE" | "DISABLED") =>
      api.put<{ ok: boolean }>(`/api/admin/customers/${customerId}/users/${user.id}`, { status }),
    onSuccess: (_res, status) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
      onDone();
      toast({
        title: status === "ACTIVE" ? `${user.name} can sign in again` : `${user.name} disabled`,
      });
      setConfirmDisable(false);
    },
    onError: (err: Error) => toast({ title: "Could not update user", description: err.message }),
  });

  const enabled = user.status !== "DISABLED";

  return (
    <TableRow>
      <Td>
        <p className="font-medium">{user.name}</p>
        {user.title && <p className="text-caption text-muted-foreground">{user.title}</p>}
      </Td>
      <Td className="text-muted-foreground">{user.email}</Td>
      <Td>
        <Select
          value={user.orgRole}
          onValueChange={(v) => roleMutation.mutate(v)}
          disabled={roleMutation.isPending}
        >
          <SelectTrigger
            className="h-8 w-[180px] text-body-sm"
            aria-label={`Portal role for ${user.name}`}
            title={ORG_ROLE_DESCRIPTIONS[user.orgRole]}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORG_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ORG_ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p
          className="mt-0.5 max-w-[210px] text-caption leading-snug text-muted-foreground line-clamp-2"
          title={ORG_ROLE_DESCRIPTIONS[user.orgRole]}
        >
          {ORG_ROLE_DESCRIPTIONS[user.orgRole]}
        </p>
      </Td>
      <Td>
        <UserStatusBadge status={user.status} />
      </Td>
      <Td className="whitespace-nowrap text-muted-foreground">
        {user.lastLoginAt ? (
          <span>
            {formatDate(user.lastLoginAt)}
            <span className="ml-1.5 tnum text-caption text-muted-foreground">{timeAgo(user.lastLoginAt)}</span>
          </span>
        ) : (
          "Never"
        )}
      </Td>
      <Td className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={enabled}
            disabled={toggle.isPending}
            onCheckedChange={(v) => (v ? toggle.mutate("ACTIVE") : setConfirmDisable(true))}
            aria-label={`Toggle portal access for ${user.name}`}
          />
          <span className="text-caption text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
        </div>
      </Td>
      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {user.name}?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              They will immediately lose access to the customer portal until re-enabled. Orders and messages they
              submitted are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep access</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate("DISABLED")}
            >
              {toggle.isPending ? "Disabling…" : "Yes, disable user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableRow>
  );
}

// ─── Internal notes ────────────────────────────────────────────────────────────

function InternalNotesCard({
  customerId,
  initialNotes,
  onSaved,
}: {
  customerId: string;
  initialNotes: string | null;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const dirty = notes !== (initialNotes ?? "");

  const save = useMutation({
    mutationFn: () => api.put<{ ok: boolean }>(`/api/admin/customers/${customerId}`, { internalNotes: notes.trim() || null }),
    onSuccess: () => {
      onSaved();
      toast({ title: "Internal notes saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save notes", description: err.message }),
  });

  return (
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
      <Textarea
        rows={7}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Rate confirmations, delivery preferences, escalations, credit flags…"
        className="bg-card leading-relaxed"
        aria-label="Internal notes"
      />
      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
        <p className="text-caption text-muted-foreground">
          {notes.trim().length} characters
        </p>
        <Button className="gap-1.5" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          <Save className="size-3.5" aria-hidden />
          {save.isPending ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </SectionCard>
  );
}

// ─── Edit customer dialog ─────────────────────────────────────────────────────

function EditCustomerDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: CustomerProfile;
  onSaved: () => void;
}) {
  const org = profile.organization;
  const [form, setForm] = useState({
    name: org.name,
    phone: org.phone,
    billingLine1: org.billingLine1,
    billingCity: org.billingCity,
    billingProvince: org.billingProvince,
    billingPostal: org.billingPostal,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.put<{ ok: boolean }>(`/api/admin/customers/${org.id}`, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        billingLine1: form.billingLine1.trim() || null,
        billingCity: form.billingCity.trim() || null,
        billingProvince: form.billingProvince.trim() || null,
        billingPostal: form.billingPostal.trim() || null,
      }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
      toast({ title: "Customer details updated" });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSubmitError(null); }}>
      <DialogContent className="sm:max-w-[520px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitError(null);
            if (!form.name.trim()) {
              setSubmitError("Business name is required.");
              return;
            }
            save.mutate();
          }}
          className="space-y-4"
        >
          <DialogHeader className="border-b pb-4">
            <DialogTitle>Edit customer details</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-name" className="text-body-sm">Business name</Label>
              <Input id="edit-name" value={form.name} onChange={set("name")} className="h-9 text-body-sm" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-phone" className="text-body-sm">Phone</Label>
              <Input id="edit-phone" value={form.phone} onChange={set("phone")} placeholder="(416) 555-0182" className="h-9 text-body-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <GroupLabel className="mb-1">Billing address</GroupLabel>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-line1" className="text-body-sm">Street address</Label>
                  <Input id="edit-line1" value={form.billingLine1} onChange={set("billingLine1")} className="h-9 text-body-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-city" className="text-body-sm">City</Label>
                  <Input id="edit-city" value={form.billingCity} onChange={set("billingCity")} className="h-9 text-body-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-province" className="text-body-sm">Province</Label>
                    <Input id="edit-province" value={form.billingProvince} onChange={set("billingProvince")} maxLength={2} className="h-9 text-body-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-postal" className="text-body-sm">Postal</Label>
                    <Input id="edit-postal" value={form.billingPostal} onChange={set("billingPostal")} className="h-9 text-body-sm" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {submitError && <p className="text-caption text-[var(--status-danger-fg)]">{submitError}</p>}

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="gap-1.5" disabled={save.isPending}>
              <PencilLine className="size-4" aria-hidden />
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite user dialog ───────────────────────────────────────────────────────

function InviteUserDialog({
  open,
  onOpenChange,
  customerId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ email: "", name: "", title: "" });
  const [result, setResult] = useState<{ tempPassword: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      api.post<{ tempPassword: string }>(`/api/admin/customers/${customerId}/users`, {
        email: form.email.trim(),
        name: form.name.trim(),
        title: form.title.trim() || undefined,
      }),
    onSuccess: (res) => {
      setResult(res);
      onSaved();
      toast({ title: "User invited" });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function reset() {
    setForm({ email: "", name: "", title: "" });
    setResult(null);
    setSubmitError(null);
    invite.reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-[460px]">
        {result ? (
          <>
            <DialogHeader className="border-b pb-4">
              <DialogTitle>User invited</DialogTitle>
            </DialogHeader>
            <TempPasswordPanel email={form.email.trim()} password={result.tempPassword} />
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={reset}>Invite another</Button>
              <Button onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitError(null);
              if (!form.email.trim() || !form.name.trim()) {
                setSubmitError("Name and email are required.");
                return;
              }
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
                setSubmitError("Enter a valid email address.");
                return;
              }
              invite.mutate();
            }}
            className="space-y-4"
          >
            <DialogHeader className="border-b pb-4">
              <DialogTitle>Invite user</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="invite-name" className="text-body-sm">Full name</Label>
                <Input id="invite-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sofia Lindqvist" className="h-9 text-body-sm" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-email" className="text-body-sm">Email address</Label>
                <Input id="invite-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="sofia@company.com" className="h-9 text-body-sm" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-title" className="text-body-sm">Job title <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="invite-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Operations Manager" className="h-9 text-body-sm" />
              </div>
            </div>
            {submitError && <p className="text-caption text-[var(--status-danger-fg)]">{submitError}</p>}
            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="gap-1.5" disabled={invite.isPending}>
                <Plus className="size-4" aria-hidden />
                {invite.isPending ? "Inviting…" : "Invite user"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Shipping addresses (self-managed by the customer — no review) ──────────

function AddressCard({ address }: { address: CustomerProfile["addresses"][number] }) {
  return (
    <li className="rounded-[14px] border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <GroupLabel>{address.label}</GroupLabel>
        {address.isDefault && (
          <span className="rounded-full bg-[var(--status-done-bg)] px-1.5 py-0.5 text-micro font-medium text-[var(--status-done-fg)]">
            Default
          </span>
        )}
      </div>
      <p className="mt-1.5 text-body-sm leading-relaxed">
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}
        <br />
        {address.city}, {address.province} {address.postal}
      </p>
      {address.requestedByName && (
        <p className="mt-1.5 text-caption leading-snug text-muted-foreground">
          Added by {address.requestedByName}
          {address.requestedAt ? ` · ${formatDate(address.requestedAt)}` : ""}
        </p>
      )}
    </li>
  );
}

// ─── Relationship preferences (internal) ──────────────────────────────────────

const CONTACT_METHODS = [
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "PORTAL", label: "ClientHub portal" },
] as const;

const PREF_NONE = "__none__";

function prefsForm(preferences: OrgPreferences | null) {
  return {
    preferredContactUserId: preferences?.preferredContactUserId ?? "",
    preferredContactMethod: preferences?.preferredContactMethod ?? "",
    deliveryInstructions: preferences?.deliveryInstructions ?? "",
    commonlyOrderedNote: preferences?.commonlyOrderedNote ?? "",
  };
}

function RelationshipPreferencesCard({
  customerId,
  preferences,
  users,
  onSaved,
}: {
  customerId: string;
  preferences: OrgPreferences | null;
  users: CustomerProfile["users"];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => prefsForm(preferences));
  const [prefsKey, setPrefsKey] = useState("");

  // Re-sync the form when the saved preferences change on the server.
  const key = JSON.stringify(preferences ?? null);
  if (prefsKey !== key) {
    setPrefsKey(key);
    setForm(prefsForm(preferences));
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(prefsForm(preferences));

  const save = useMutation({
    mutationFn: () =>
      api.patch<{ ok: boolean }>(`/api/admin/customers/${customerId}`, {
        preferences: {
          preferredContactUserId: form.preferredContactUserId || null,
          preferredContactMethod: form.preferredContactMethod || null,
          deliveryInstructions: form.deliveryInstructions.trim() || null,
          commonlyOrderedNote: form.commonlyOrderedNote.trim() || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "customer", customerId] });
      onSaved();
      toast({ title: "Relationship preferences saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save preferences", description: err.message }),
  });

  return (
    <SectionCard
      title="Relationship preferences"
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pref-contact" className="text-body-sm">
            Preferred contact
          </Label>
          <Select
            value={form.preferredContactUserId === "" ? PREF_NONE : form.preferredContactUserId}
            onValueChange={(v) => setForm((f) => ({ ...f, preferredContactUserId: v === PREF_NONE ? "" : v }))}
          >
            <SelectTrigger id="pref-contact" className="h-9 w-full text-body-sm" aria-label="Preferred contact">
              <SelectValue placeholder="No preference set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PREF_NONE}>No preference set</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pref-method" className="text-body-sm">
            Preferred contact method
          </Label>
          <Select
            value={form.preferredContactMethod === "" ? PREF_NONE : form.preferredContactMethod}
            onValueChange={(v) => setForm((f) => ({ ...f, preferredContactMethod: v === PREF_NONE ? "" : v }))}
          >
            <SelectTrigger id="pref-method" className="h-9 w-full text-body-sm" aria-label="Preferred contact method">
              <SelectValue placeholder="No preference set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PREF_NONE}>No preference set</SelectItem>
              {CONTACT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pref-delivery" className="flex items-center gap-1.5 text-body-sm">
            <Phone className="size-3" aria-hidden /> Delivery instructions
          </Label>
          <Textarea
            id="pref-delivery"
            rows={3}
            value={form.deliveryInstructions}
            onChange={(e) => setForm((f) => ({ ...f, deliveryInstructions: e.target.value }))}
            placeholder="e.g. Dock 3 before 10am, receiving hours 8:00 to 15:00, call on arrival"
            className="leading-relaxed"
            maxLength={1000}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pref-commonly" className="text-body-sm">
            Commonly ordered
          </Label>
          <Input
            id="pref-commonly"
            value={form.commonlyOrderedNote}
            onChange={(e) => setForm((f) => ({ ...f, commonlyOrderedNote: e.target.value }))}
            placeholder="e.g. Carton 12×8×8 white, 2-3 pallets monthly"
            className="h-9 text-body-sm"
            maxLength={200}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
        <p className="text-caption text-muted-foreground">
          Internal only.
        </p>
        <Button size="sm" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          <Save className="size-3.5" aria-hidden />
          {save.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </SectionCard>
  );
}
