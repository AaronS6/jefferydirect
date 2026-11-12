"use client";

// Settings — account overview (read-mostly), delivery address book
// (self-managed, active immediately — no approval workflow), saved-for-reorder
// list, notification preferences and password change. Billing fields are
// admin-managed and clearly labelled as such.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Building2,
  Check,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Money } from "@/components/shared/money";
import { api } from "@/lib/api-client";
import { useCartStore } from "@/store/app-store";
import type { AddressDto, SavedProductDto } from "@/types";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ErrorAlert, DetailRow, Mono, QtyStepper, RowsSkeleton, SectionCard } from "./portal-bits";

type AccountPayload = {
  organization: {
    code: string;
    name: string;
    billingLine1: string;
    billingCity: string;
    billingProvince: string;
    billingPostal: string;
    phone: string;
  } | null;
  notifyPrefs: Record<string, boolean>;
  user: { email: string; name: string; title: string | null; phone: string | null };
};

const NOTIFY_PREFS: { key: string; label: string; description: string }[] = [
  {
    key: "orderUpdates",
    label: "Order updates",
    description: "Confirmations, production progress, dispatch and delivery notices.",
  },
  {
    key: "delayAlerts",
    label: "Delay alerts",
    description: "Delay notices on open orders.",
  },
  {
    key: "documents",
    label: "New documents",
    description: "New invoices, statements and specifications filed to your account.",
  },
  {
    key: "quoteUpdates",
    label: "Quotes",
    description: "When a quote is issued, revised or expiring.",
  },
  {
    key: "messages",
    label: "Messages",
    description: "Replies to your messages.",
  },
];

const EMPTY_ADDRESS = { label: "", line1: "", line2: "", city: "", province: "", postal: "" };
const EASE = [0.22, 1, 0.36, 1] as const;

export function SettingsView() {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const { data: account, isLoading, error, refetch } = useQuery({
    queryKey: ["customer-account"],
    queryFn: () => api.get<AccountPayload>("/api/customer/account"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customer-account"] });

  const mutateError = (err: unknown) =>
    err instanceof Error ? err.message : "We could not save your change. Please try again.";

  if (error) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Settings" />
        <ErrorAlert message="We could not load your account." onRetry={() => refetch()} />
      </motion.div>
    );
  }

  if (isLoading || !account) {
    return (
      <motion.div {...enter}>
        <PageHeader title="Settings" />
        <div className="space-y-8">
          <Skeleton className="h-10 w-72" />
          <div className="rounded-[14px] border bg-card p-5 shadow-xs">
            <Skeleton className="h-4 w-40" />
            <div className="mt-3 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full max-w-md" />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...enter}>
      <PageHeader title="Settings" />

      <Tabs defaultValue="account" className="gap-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        {/* Left sub-nav — vertical on desktop, scrollable chips on mobile */}
        <TabsList className="flex h-auto w-full flex-row gap-1 overflow-x-auto rounded-[14px] border bg-card p-1.5 shadow-xs lg:sticky lg:top-24 lg:flex-col lg:items-stretch lg:overflow-visible">
          <TabsTrigger value="account" className="flex-none justify-start whitespace-nowrap px-3 py-2 data-[state=active]:bg-accent">Account</TabsTrigger>
          <TabsTrigger value="addresses" className="flex-none justify-start whitespace-nowrap px-3 py-2 data-[state=active]:bg-accent">Shipping addresses</TabsTrigger>
          <TabsTrigger value="notifications" className="flex-none justify-start whitespace-nowrap px-3 py-2 data-[state=active]:bg-accent">Notifications</TabsTrigger>
          <TabsTrigger value="security" className="flex-none justify-start whitespace-nowrap px-3 py-2 data-[state=active]:bg-accent">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-0 min-w-0">
          <AccountTab account={account} onDone={invalidate} mutateError={mutateError} />
        </TabsContent>
        <TabsContent value="addresses" className="mt-0 min-w-0">
          <div className="space-y-8">
            <AddressesTab />
            <SavedForReorderSection />
          </div>
        </TabsContent>
        <TabsContent value="notifications" className="mt-0 min-w-0">
          <NotificationsTab prefs={account.notifyPrefs} onDone={invalidate} />
        </TabsContent>
        <TabsContent value="security" className="mt-0 min-w-0">
          <SecurityTab mutateError={mutateError} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

/** Warn before a browser close/refresh discards an edited form. */
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/** Small inline warning shown in a section header while a form is edited. */
function UnsavedNote({
  onSave,
  onDiscard,
  saving,
  saveDisabled,
}: {
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
  saveDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="text-caption font-medium text-kraft-ink">You have unsaved changes</p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-caption"
          onClick={onDiscard}
          disabled={saving}
        >
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 px-3"
          onClick={onSave}
          disabled={saving || saveDisabled}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

function AccountTab({
  account,
  onDone,
  mutateError,
}: {
  account: AccountPayload;
  onDone: () => void;
  mutateError: (err: unknown) => string;
}) {
  const [phone, setPhone] = useState(account.user.phone ?? "");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const dirty = phone.trim() !== (account.user.phone ?? "");
  useUnsavedGuard(dirty);

  const phoneMutation = useMutation({
    mutationFn: () => api.put<{ ok: boolean }>("/api/customer/account", { phone: phone.trim() }),
    onSuccess: () => {
      onDone();
      setPhoneError(null);
      toast({ title: "Phone updated" });
    },
    onError: (err) => setPhoneError(mutateError(err)),
  });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <SectionCard title="Account overview" contentClassName="p-0 sm:p-0">
        <dl className="m-0 px-4 py-2 sm:px-5">
          <DetailRow label="Business name">{account.organization?.name}</DetailRow>
          <DetailRow label="Customer code">
            <Mono className="text-body-sm">{account.organization?.code}</Mono>
          </DetailRow>
          <DetailRow label="Contact person">
            {account.user.name}
            {account.user.title ? <span className="text-muted-foreground"> · {account.user.title}</span> : null}
          </DetailRow>
          <DetailRow label="Email">
            <span className="break-all">{account.user.email}</span>
          </DetailRow>
          <DetailRow label="Billing address">
            {account.organization ? (
              <span className="leading-relaxed">
                {account.organization.billingLine1}
                <br />
                {account.organization.billingCity}, {account.organization.billingProvince}{" "}
                {account.organization.billingPostal}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow label="Company phone">{account.organization?.phone}</DetailRow>
        </dl>
        <div className="flex items-start gap-2.5 border-t bg-surface-sunken/60 px-4 py-3 text-caption leading-relaxed text-muted-foreground sm:px-5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Managed by Jeffery Group. Contact your account manager to change business details or the
            billing address.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Contact phone"
        actions={
          dirty ? (
            <UnsavedNote
              saving={phoneMutation.isPending}
              onDiscard={() => {
                setPhone(account.user.phone ?? "");
                setPhoneError(null);
              }}
              onSave={() => phoneMutation.mutate()}
            />
          ) : undefined
        }
      >
        <div className="max-w-sm space-y-3">
          <div className="space-y-2">
            <Label htmlFor="settings-phone">Phone number</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="settings-phone"
                className="pl-9"
                maxLength={40}
                placeholder="(416) 555-0183"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={phoneMutation.isPending}
              />
            </div>
          </div>
          {phoneError && (
            <div
              role="alert"
              className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
            >
              {phoneError}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Addresses tab (self-managed delivery address book — active immediately) ──

function AddressesTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AddressDto | null>(null);

  const { data: addresses, isLoading, error, refetch } = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: () => api.get<AddressDto[]>("/api/customer/addresses"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<AddressDto>("/api/customer/addresses", {
        label: form.label.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim() || null,
        city: form.city.trim(),
        province: form.province.trim(),
        postal: form.postal.trim(),
      }),
    onSuccess: (a) => {
      invalidate();
      setDialogOpen(false);
      setForm(EMPTY_ADDRESS);
      setFormError(null);
      toast({ title: "Address added" });
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : "We could not add the address. Please try again."),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => api.patch<AddressDto>(`/api/customer/addresses/${id}`, { isDefault: true }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Default address updated" });
    },
    onError: (err) =>
      toast({
        title: "Could not update address",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/api/customer/addresses/${id}`),
    onSuccess: () => {
      invalidate();
      setRemoving(null);
      toast({ title: "Address removed" });
    },
    onError: (err) =>
      toast({
        title: "Could not remove address",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  function submitAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.line1.trim() || !form.city.trim() || !form.province.trim() || !form.postal.trim()) {
      setFormError("Label, street, city, province and postal code are required.");
      return;
    }
    setFormError(null);
    addMutation.mutate();
  }

  return (
    <SectionCard
      title="Delivery addresses"
      actions={
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setForm(EMPTY_ADDRESS);
            setFormError(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-3.5" aria-hidden /> Add address
        </Button>
      }
    >
      {error ? (
        <ErrorAlert message="We could not load your addresses." onRetry={() => refetch()} />
      ) : isLoading || addresses === undefined ? (
        <RowsSkeleton rows={3} />
      ) : addresses.length === 0 ? (
        <div className="flex items-start gap-2.5 rounded-[10px] border border-kraft/40 bg-kraft-soft/60 px-4 py-3 text-body-sm text-kraft-ink">
          <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>No delivery addresses yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="rounded-[14px] border bg-card p-4 shadow-xs transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-foreground">
                    {a.label}
                    {a.isDefault && (
                      <span className="inline-flex h-[22px] items-center rounded-full border bg-card px-2.5 text-caption font-medium text-muted-foreground">
                        Default
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-body-sm leading-relaxed text-muted-foreground">
                    {a.line1}
                    {a.line2 ? <>, {a.line2}</> : null}
                    <br />
                    {a.city}, {a.province} {a.postal}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {!a.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2.5"
                    disabled={setDefaultMutation.isPending}
                    onClick={() => setDefaultMutation.mutate(a.id)}
                  >
                    <Check className="size-3.5" aria-hidden /> Make default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-caption text-muted-foreground hover:text-foreground"
                  disabled={removeMutation.isPending || a.isDefault}
                  title={a.isDefault ? "Set another default first, then remove this one" : undefined}
                  onClick={() => setRemoving(a)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-caption text-pretty leading-relaxed text-muted-foreground">
        Canada only. New addresses are usable immediately. Jeffery Group is notified when a location is
        added.
      </p>

      {/* Add address dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add address</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAddress} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addr-label">Label</Label>
              <Input
                id="addr-label"
                maxLength={80}
                placeholder="e.g. Second Store, Danforth"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-line1">Street address</Label>
              <Input
                id="addr-line1"
                maxLength={160}
                placeholder="1082 Danforth Avenue"
                value={form.line1}
                onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-line2">Unit / line 2 (optional)</Label>
              <Input
                id="addr-line2"
                maxLength={80}
                value={form.line2}
                onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="addr-city">City</Label>
                <Input
                  id="addr-city"
                  maxLength={80}
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr-province">Province</Label>
                <Input
                  id="addr-province"
                  maxLength={40}
                  placeholder="ON"
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr-postal">Postal code</Label>
                <Input
                  id="addr-postal"
                  maxLength={20}
                  placeholder="M4C 1V2"
                  value={form.postal}
                  onChange={(e) => setForm((f) => ({ ...f, postal: e.target.value }))}
                />
              </div>
            </div>
            {formError && (
              <div
                role="alert"
                className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                {formError}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={addMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="gap-2" disabled={addMutation.isPending}>
                {addMutation.isPending ? (
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

      {/* Remove confirm */}
      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This address will no longer be offered at checkout. Past orders keep their recorded
              address. You can add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep address</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) removeMutation.mutate(removing.id);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Remove address
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

// ─── Saved for reorder ───────────────────────────────────────────────────────

function SavedForReorderSection() {
  const queryClient = useQueryClient();
  const addLine = useCartStore((s) => s.addLine);

  const { data: saved } = useQuery({
    queryKey: ["customer-saved-products"],
    queryFn: () => api.get<SavedProductDto[]>("/api/customer/saved-products"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customer-saved-products"] });

  const updateQtyMutation = useMutation({
    mutationFn: (vars: { id: string; qty: number }) =>
      api.patch<SavedProductDto>(`/api/customer/saved-products/${vars.id}`, { qty: vars.qty }),
    onSuccess: invalidate,
    onError: () =>
      toast({ title: "Could not update quantity", description: "Please try again." }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/api/customer/saved-products/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Removed from reorder list" });
    },
    onError: () =>
      toast({ title: "Could not remove item", description: "Please try again." }),
  });

  if (!saved || saved.length === 0) return null;

  function addToCart(sp: SavedProductDto) {
    if (sp.priceCents === null) {
      toast({
        title: "Quote required",
        description: "Request a quote first, then order.",
      });
      return;
    }
    addLine({
      productId: sp.productId,
      sku: sp.sku,
      name: sp.name,
      unitPriceCents: sp.priceCents ?? 0,
      qty: sp.qty,
      minOrderQty: sp.minOrderQty,
      increment: sp.increment,
      casePack: sp.casePack,
      unit: sp.unit,
    });
    toast({ title: "Added to cart" });
  }

  return (
    <SectionCard title="Saved for reorder">
      <ul className="divide-y">
        {saved.map((sp) => (
          <li
            key={sp.id}
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5",
              !sp.available && "opacity-60",
            )}
          >
            <div className="min-w-0 flex-1 basis-52">
              <p className="truncate text-body-sm font-semibold leading-snug text-foreground">{sp.name}</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                <Mono>{sp.sku}</Mono>
                {sp.note ? <span className="text-muted-foreground/80"> · {sp.note}</span> : null}
              </p>
              {!sp.available && (
                <p className="mt-1 text-caption leading-relaxed text-kraft-ink">
                  Currently unavailable.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-micro text-muted-foreground">Qty</span>
              <QtyStepper
                value={sp.qty}
                onChange={(qty) => updateQtyMutation.mutate({ id: sp.id, qty })}
                min={Math.max(1, sp.minOrderQty)}
                increment={sp.increment}
                size="sm"
                ariaLabel={`Reorder quantity of ${sp.name}`}
                disabled={updateQtyMutation.isPending}
              />
            </div>
            <div className="w-28 text-right">
              {sp.priceCents !== null ? (
                <Money cents={sp.priceCents} className="text-body-sm font-medium" />
              ) : (
                <span className="text-caption text-muted-foreground">Quote required</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5"
                disabled={!sp.available}
                onClick={() => addToCart(sp)}
              >
                <ShoppingCart className="size-3.5" aria-hidden /> Add to cart
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(sp.id)}
                aria-label={`Remove ${sp.name} from reorder list`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsTab({
  prefs,
  onDone,
}: {
  prefs: Record<string, boolean>;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of NOTIFY_PREFS) initial[p.key] = prefs[p.key] ?? true;
    return initial;
  });

  // Optimistic per-switch save: the full preference object (including keys
  // this UI does not show) is merged and sent on every toggle.
  const prefsMutation = useMutation({
    mutationFn: (next: Record<string, boolean>) =>
      api.put<{ ok: boolean }>("/api/customer/account", { notifyPrefs: next }),
    onSuccess: () => {
      onDone();
      toast({ title: "Preferences saved" });
    },
  });

  function toggle(key: string, checked: boolean) {
    const previous = values;
    const next = { ...previous, [key]: checked };
    setValues(next);
    prefsMutation.mutate({ ...prefs, ...next }, {
      onError: () => {
        setValues(previous);
        toast({ title: "Could not save", description: "Please try again." });
      },
    });
  }

  return (
    <SectionCard
      title="Notification preferences"
      className="max-w-2xl"
    >
      <ul className="space-y-1">
        {NOTIFY_PREFS.map((p) => (
          <li key={p.key} className="flex items-start justify-between gap-4 border-b border-border/60 py-3.5 last:border-b-0">
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-foreground">{p.label}</p>
              <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{p.description}</p>
            </div>
            <div className="flex shrink-0 items-center">
              <Switch
                id={`pref-${p.key}`}
                checked={values[p.key] ?? true}
                onCheckedChange={(v) => toggle(p.key, v)}
                disabled={prefsMutation.isPending}
                aria-label={`${p.label} notifications`}
              />
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ─── Security tab ──────────────────────────────────────────────────────────────

function SecurityTab({ mutateError }: { mutateError: (err: unknown) => string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dirty = current !== "" || next !== "" || confirm !== "";
  useUnsavedGuard(dirty);

  const pwMutation = useMutation({
    mutationFn: () =>
      api.put<{ ok: boolean }>("/api/customer/account/password", {
        currentPassword: current,
        newPassword: next,
      }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      toast({ title: "Password updated" });
    },
    onError: (err) => setError(mutateError(err)),
  });

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (next === current) {
      setError("Choose a password different from your current one.");
      return;
    }
    setError(null);
    pwMutation.mutate();
  }

  function discard() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  return (
    <SectionCard
      title="Password"
      className="max-w-2xl"
      actions={
        dirty ? (
          <UnsavedNote
            saving={pwMutation.isPending}
            saveDisabled={!current || !next || !confirm}
            onDiscard={discard}
            onSave={() => submit()}
          />
        ) : undefined
      }
    >
      <form onSubmit={submit} className="max-w-sm space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pw-current">Current password</Label>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={pwMutation.isPending}
            required
          />
        </div>
        <Separator />
        <div className="space-y-2">
          <Label htmlFor="pw-new">New password</Label>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={pwMutation.isPending}
            required
          />
          <p className="text-caption text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-confirm">Confirm new password</Label>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={pwMutation.isPending}
            required
          />
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
          >
            {error}
          </div>
        )}
      </form>
    </SectionCard>
  );
}
