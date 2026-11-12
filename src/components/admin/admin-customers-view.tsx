"use client";

// Administration — customer organizations: search, list with trading summary,
// and creating new customers (temporary password shown once).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { OrgStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/date";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import type { CustomerListItem } from "@/types";
import {
  FieldError,
  GroupLabel,
  InlineError,
  RowsSkeleton,
  SearchField,
  SectionCard,
  Td,
  Th,
  Toolbar,
  TempPasswordPanel,
  useDebouncedValue,
  ViewEnter,
} from "./admin-ui";

type CreateResult = { id: string; code: string; tempPassword: string };

const EMPTY_FORM = {
  name: "",
  contactName: "",
  contactEmail: "",
  contactTitle: "",
  phone: "",
  billingLine1: "",
  billingCity: "",
  billingProvince: "",
  billingPostal: "",
};

export function AdminCustomersView() {
  const navigate = useAppStore((s) => s.navigate);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "customers", debouncedSearch.trim()],
    queryFn: () => api.get<CustomerListItem[]>(`/api/admin/customers?search=${encodeURIComponent(debouncedSearch.trim())}`),
  });

  const customers = data ?? [];

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={<CreateCustomerDialog />}
      />

      <ViewEnter>
      <Toolbar>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search business, contact, email…"
          ariaLabel="Search customers"
          className="sm:max-w-[320px]"
        />
        <div className="ml-auto flex items-center gap-2">
          {customers.length > 0 && (
            <p className="tnum whitespace-nowrap text-caption text-muted-foreground">
              {customers.length} {customers.length === 1 ? "customer" : "customers"}
            </p>
          )}
          {search.trim() && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setSearch("")}
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Button>
          )}
        </div>
      </Toolbar>

      {isError ? (
        <InlineError message={error instanceof Error ? error.message : "Could not load customers."} />
      ) : isLoading ? (
        <SectionCard>
          <RowsSkeleton rows={6} />
        </SectionCard>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search.trim() ? "No matching customers" : "No customers yet"}
          action={
            search.trim() ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          {/* Desktop table */}
          <div className="hidden max-h-[60vh] overflow-auto md:block">
            <Table className="min-w-[920px]">
              <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <TableRow className="hover:bg-transparent">
                  <Th>Business</Th>
                  <Th>Primary contact</Th>
                  <Th>Phone</Th>
                  <Th>City / Province</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Orders</Th>
                  <Th>Last order</Th>
                  <Th className="w-10" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate("admin-customer-detail", { id: c.id })}
                  >
                    <Td>
                      <button
                        type="button"
                        className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("admin-customer-detail", { id: c.id });
                        }}
                      >
                        {c.name}
                      </button>
                      <p className="font-mono text-caption text-muted-foreground">{c.code}</p>
                    </Td>
                    <Td>
                      <p className="max-w-[180px] truncate">{c.primaryContact}</p>
                      <p className="max-w-[180px] truncate text-caption text-muted-foreground">{c.contactEmail}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{c.phone || "—"}</Td>
                    <Td className="whitespace-nowrap">
                      {c.city ? `${c.city}${c.province ? `, ${c.province}` : ""}` : "—"}
                    </Td>
                    <Td>
                      <OrgStatusBadge status={c.status} />
                    </Td>
                    <Td className="tnum text-right">{c.orderCount}</Td>
                    <Td className="whitespace-nowrap">
                      {c.lastOrderAt ? (
                        <span>
                          {formatDate(c.lastOrderAt)}
                          <span className="ml-1.5 tnum text-caption text-muted-foreground">{timeAgo(c.lastOrderAt)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <ul className="space-y-3 p-4 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate("admin-customer-detail", { id: c.id })}
                  className="w-full rounded-[14px] border bg-card p-4 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-body-sm font-medium">{c.name}</span>
                    <OrgStatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 font-mono text-caption text-muted-foreground">{c.code}</p>
                  <p className="mt-1.5 truncate text-caption text-muted-foreground">
                    {c.primaryContact} · {c.contactEmail}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-caption text-muted-foreground">
                    <span>{c.orderCount} orders · {c.lastOrderAt ? timeAgo(c.lastOrderAt) : "no orders yet"}</span>
                    <span>{c.city || "—"}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      </ViewEnter>
    </div>
  );
}

// ─── Create customer dialog ──────────────────────────────────────────────────

function CreateCustomerDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [result, setResult] = useState<CreateResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<CreateResult>("/api/admin/customers", {
        name: form.name.trim(),
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactTitle: form.contactTitle.trim() || undefined,
        phone: form.phone.trim() || undefined,
        billingLine1: form.billingLine1.trim() || undefined,
        billingCity: form.billingCity.trim() || undefined,
        billingProvince: form.billingProvince.trim() || undefined,
        billingPostal: form.billingPostal.trim() || undefined,
      }),
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      toast({ title: "Customer created" });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function reset() {
    setForm({ ...EMPTY_FORM });
    setResult(null);
    setSubmitError(null);
    create.reset();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!form.name.trim() || !form.contactName.trim() || !form.contactEmail.trim()) {
      setSubmitError("Business name, contact name and contact email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      setSubmitError("Enter a valid contact email address.");
      return;
    }
    create.mutate();
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <Button className="gap-1.5" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="size-4" aria-hidden />
        New customer
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-[560px]">
          {result ? (
            <>
              <DialogHeader className="border-b pb-4">
                <DialogTitle>Customer created</DialogTitle>
              </DialogHeader>
              <TempPasswordPanel email={form.contactEmail.trim()} password={result.tempPassword} />
              <DialogFooter className="border-t pt-4">
                <Button variant="outline" onClick={() => { reset(); setForm({ ...EMPTY_FORM }); }}>
                  Create another
                </Button>
                <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader className="border-b pb-4">
                <DialogTitle>New customer</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cust-name" className="text-body-sm">Business name</Label>
                  <Input id="cust-name" value={form.name} onChange={set("name")} placeholder="e.g. Maple Leaf Pizzeria Ltd." className="h-9 text-body-sm" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cust-contact" className="text-body-sm">Contact name</Label>
                  <Input id="cust-contact" value={form.contactName} onChange={set("contactName")} placeholder="e.g. Maria Rossi" className="h-9 text-body-sm" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cust-email" className="text-body-sm">Contact email</Label>
                  <Input id="cust-email" type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="maria@company.com" className="h-9 text-body-sm" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cust-title" className="text-body-sm">Job title <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cust-title" value={form.contactTitle} onChange={set("contactTitle")} placeholder="e.g. Purchasing Manager" className="h-9 text-body-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cust-phone" className="text-body-sm">Phone <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cust-phone" value={form.phone} onChange={set("phone")} placeholder="(416) 555-0182" className="h-9 text-body-sm" />
                </div>

                <div className="sm:col-span-2">
                  <GroupLabel className="mb-2 mt-1">Billing address</GroupLabel>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="cust-line1" className="text-body-sm">Street address</Label>
                      <Input id="cust-line1" value={form.billingLine1} onChange={set("billingLine1")} placeholder="2145 Bloor Street West" className="h-9 text-body-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cust-city" className="text-body-sm">City</Label>
                      <Input id="cust-city" value={form.billingCity} onChange={set("billingCity")} placeholder="Toronto" className="h-9 text-body-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <Label htmlFor="cust-province" className="text-body-sm">Province</Label>
                        <Input id="cust-province" value={form.billingProvince} onChange={set("billingProvince")} placeholder="ON" maxLength={2} className="h-9 text-body-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cust-postal" className="text-body-sm">Postal code</Label>
                        <Input id="cust-postal" value={form.billingPostal} onChange={set("billingPostal")} placeholder="M6R 2M3" className="h-9 text-body-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {submitError && <FieldError>{submitError}</FieldError>}

              <DialogFooter className="border-t pt-4">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" className="gap-1.5" disabled={create.isPending}>
                  <Building2 className="size-4" aria-hidden />
                  {create.isPending ? "Creating…" : "Create customer"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
