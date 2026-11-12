"use client";

// Administration — internal staff accounts (admins). Customer users are
// managed from each customer's profile (Contacts & addresses).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, UserCog, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { UserStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/date";
import { toast } from "@/hooks/use-toast";
import type { InternalUser } from "@/types";
import { FieldError, InlineError, RowsSkeleton, SectionCard, Td, Th, TempPasswordPanel, ViewEnter } from "./admin-ui";

export function AdminUsersView() {
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<InternalUser[]>("/api/admin/users"),
  });

  const users = data ?? [];

  return (
    <div>
      <PageHeader
        title="Users"
        actions={
          <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" aria-hidden />
            Add internal user
          </Button>
        }
      />

      <ViewEnter>
      <div className="mb-4 flex items-start gap-2.5 rounded-md border bg-secondary/50 px-4 py-3 text-body-sm leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Accounts created here sign in to the <span className="font-medium text-foreground">administration portal</span>{" "}
          with full access. Customer users are managed from each customer&apos;s profile.
        </p>
      </div>

      {isError ? (
        <InlineError message={error instanceof Error ? error.message : "Could not load internal users."} />
      ) : isLoading ? (
        <SectionCard>
          <RowsSkeleton rows={4} />
        </SectionCard>
      ) : users.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No internal users"
          action={
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <UserPlus className="size-4" aria-hidden /> Add internal user
            </Button>
          }
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          {/* Desktop table */}
          <div className="hidden max-h-[60vh] overflow-auto md:block">
            <Table className="min-w-[860px]">
              <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <TableRow className="hover:bg-transparent">
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Last login</Th>
                  <Th>Created</Th>
                  <Th className="text-center">Access</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <InternalUserRow key={u.id} user={u} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <ul className="space-y-3 p-4 md:hidden">
            {users.map((u) => (
              <InternalUserCard key={u.id} user={u} />
            ))}
          </ul>
        </SectionCard>
      )}
      </ViewEnter>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

// ─── Row / card with enable-disable ──────────────────────────────────────────

function InternalUserRow({ user }: { user: InternalUser }) {
  return (
    <TableRow>
      <Td className="font-medium">{user.name}</Td>
      <Td className="text-muted-foreground">{user.email}</Td>
      <Td>
        <RoleBadge />
      </Td>
      <Td className="text-muted-foreground">{user.title ?? "—"}</Td>
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
      <Td className="whitespace-nowrap text-muted-foreground">{formatDate(user.createdAt)}</Td>
      <Td className="text-center">
        <AccessSwitch user={user} />
      </Td>
    </TableRow>
  );
}

function InternalUserCard({ user }: { user: InternalUser }) {
  return (
    <li className="rounded-[14px] border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">{user.name}</p>
          <p className="truncate text-caption text-muted-foreground">{user.email}</p>
        </div>
        <UserStatusBadge status={user.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <RoleBadge />
        {user.title && <span>{user.title}</span>}
        <span className="tnum">Last login {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "never"}</span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-caption text-muted-foreground">
          {user.status === "DISABLED" ? "Access disabled" : "Portal access enabled"}
        </span>
        <AccessSwitch user={user} />
      </div>
    </li>
  );
}

function RoleBadge() {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-[var(--status-active-bg)] px-2.5 text-caption font-medium text-[var(--status-active-fg)]">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      Administrator
    </span>
  );
}

function AccessSwitch({ user }: { user: InternalUser }) {
  const queryClient = useQueryClient();
  const [confirmDisable, setConfirmDisable] = useState(false);

  const toggle = useMutation({
    mutationFn: (status: "ACTIVE" | "DISABLED") =>
      api.put<{ ok: boolean }>(`/api/admin/users/${user.id}`, { status }),
    onSuccess: (_res, status) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: status === "ACTIVE" ? `${user.name} re-enabled` : `${user.name} disabled`,
      });
      setConfirmDisable(false);
    },
    onError: (err: Error) => toast({ title: "Could not update user", description: err.message }),
  });

  const enabled = user.status !== "DISABLED";

  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <Switch
          checked={enabled}
          disabled={toggle.isPending}
          onCheckedChange={(v) => (v ? toggle.mutate("ACTIVE") : setConfirmDisable(true))}
          aria-label={`Toggle administration access for ${user.name}`}
        />
        <span className="text-caption text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
      </div>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {user.name}?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              They will immediately lose access to the administration portal until re-enabled. Their audit history is
              preserved.
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
    </>
  );
}

// ─── Add internal user dialog ─────────────────────────────────────────────────

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", title: "" });
  const [result, setResult] = useState<{ tempPassword: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ tempPassword: string }>("/api/admin/users", {
        email: form.email.trim(),
        name: form.name.trim(),
        role: "ADMIN",
        title: form.title.trim() || undefined,
      }),
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "User created" });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function reset() {
    setForm({ name: "", email: "", title: "" });
    setResult(null);
    setSubmitError(null);
    create.reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-[460px]">
        {result ? (
          <>
            <DialogHeader className="border-b pb-4">
              <DialogTitle>User created</DialogTitle>
            </DialogHeader>
            <TempPasswordPanel
              email={form.email.trim()}
              password={result.tempPassword}
            />
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={reset}>Add another</Button>
              <Button onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitError(null);
              if (!form.name.trim() || !form.email.trim()) {
                setSubmitError("Name and email are required.");
                return;
              }
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
                setSubmitError("Enter a valid email address.");
                return;
              }
              create.mutate();
            }}
            className="space-y-4"
          >
            <DialogHeader className="border-b pb-4">
              <DialogTitle>Add internal user</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="staff-name" className="text-body-sm">Full name</Label>
                <Input id="staff-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Nair" className="h-9 text-body-sm" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-email" className="text-body-sm">Email address</Label>
                <Input id="staff-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="priya@jefferygroup.com" className="h-9 text-body-sm" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-title" className="text-body-sm">Job title <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="staff-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Customer Success Lead" className="h-9 text-body-sm" />
              </div>
            </div>
            {submitError && <FieldError>{submitError}</FieldError>}
            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="gap-1.5" disabled={create.isPending}>
                <UserPlus className="size-4" aria-hidden />
                {create.isPending ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
