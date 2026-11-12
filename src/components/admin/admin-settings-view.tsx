"use client";

// Administration — settings: catalogue category management, the order status
// workflow reference and company facts. Statuses are fixed in this release.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Building2, CircleDot, Layers, Loader2, Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/date";
import { CURRENCY, DEFAULT_TAX_RATE_BP, ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import type { CategoryDto, EmailLogDto } from "@/types";
import { cn } from "@/lib/utils";
import { DefRow, FieldError, InlineError, RowsSkeleton, SectionCard, Td, Th, ViewEnter } from "./admin-ui";

export function AdminSettingsView() {
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.get<{ categories: CategoryDto[] }>("/api/admin/settings"),
  });

  const categories = data?.categories ?? [];

  return (
    <div>
      <PageHeader
        title="Settings"
        actions={
          <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New category
          </Button>
        }
      />

      <ViewEnter>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          {/* Categories */}
          {isError ? (
            <InlineError message={error instanceof Error ? error.message : "Could not load settings."} />
          ) : isLoading ? (
            <SectionCard title="Product categories">
              <RowsSkeleton rows={5} />
            </SectionCard>
          ) : (
            <SectionCard
              title="Product categories"
              bodyClassName="p-0"
            >
              {categories.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={Layers}
                    title="No categories yet"
                    action={
                      <Button variant="outline" onClick={() => setAddOpen(true)}>
                        <Plus className="size-4" aria-hidden /> New category
                      </Button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <Th>Name</Th>
                      <Th>Slug</Th>
                      <Th>Description</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((c) => (
                      <TableRow key={c.id}>
                        <Td className="font-medium">{c.name}</Td>
                        <Td>
                          <span className="font-mono text-caption text-muted-foreground">{c.slug}</span>
                        </Td>
                        <Td className="max-w-[380px] whitespace-normal text-muted-foreground">
                          {c.description ?? "—"}
                        </Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>
          )}

          {/* Order workflow reference */}
          <SectionCard
            title="Order status workflow"
          >
            <ol className="grid gap-x-6 gap-y-0 sm:grid-cols-2">
              {ORDER_STATUSES.map((s, i) => (
                <li key={s} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                  <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-caption font-semibold text-secondary-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-foreground">{ORDER_STATUS_LABELS[s]}</p>
                    <p className="font-mono text-micro text-muted-foreground">{s}</p>
                  </div>
                  {i < ORDER_STATUSES.length - 1 && (
                    <CircleDot className="ml-auto size-3.5 shrink-0 text-muted-foreground/40 sm:hidden" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex items-start gap-2.5 rounded-md border bg-secondary/50 px-3.5 py-2.5 text-caption leading-relaxed text-muted-foreground">
              <Boxes className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <p>
                Two terminal outcomes sit outside the sequence, <span className="font-medium text-foreground">Cancelled</span>{" "}
                and <span className="font-medium text-foreground">Rejected</span>. Both notify the customer immediately.
                This workflow is fixed in the current release.
              </p>
            </div>
          </SectionCard>
          {/* Email delivery */}
          <EmailDeliveryCard />
        </div>

        {/* Company card */}
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <SectionCard title="Company">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Building2 className="size-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-body font-semibold leading-tight tracking-tight">Jeffery Group Ltd.</p>
                <p className="mt-0.5 text-micro text-muted-foreground">Packaging Manufacturing &amp; Supply</p>
              </div>
            </div>
            <dl className="mt-4">
              <DefRow label="Address" value="40 Concession Road, Hamilton, ON L8V 1B4" />
              <DefRow label="Phone" value="(905) 555-0100" />
              <DefRow label="Email" value="orders@jefferygroup.com" />
              <DefRow label="Currency" value={`${CURRENCY}, all prices and totals in Canadian dollars`} />
              <DefRow
                label="Tax"
                value={`${(DEFAULT_TAX_RATE_BP / 100).toFixed(1)}% GST applied to order totals at confirmation`}
              />
            </dl>
          </SectionCard>

          <SectionCard title="Demo environment">
            <p className="text-body-sm leading-relaxed text-muted-foreground">
              Credentials are fixed for evaluation and shown on the sign-in screen. All customers, orders, quotes and
              documents are demonstration records. Category and company settings become editable in production.
            </p>
          </SectionCard>
        </div>
      </div>
      </ViewEnter>

      <AddCategoryDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

// ─── Email delivery (integration-ready outbox) ──────────────────────────────

function EmailDeliveryCard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "email-log"],
    queryFn: () => api.get<EmailLogDto[]>("/api/admin/email-log"),
  });

  const logs = data ?? [];

  return (
    <SectionCard
      title="Email delivery"
    >
      <div className="flex items-start gap-2.5 rounded-md border bg-secondary/50 px-3.5 py-2.5 text-caption leading-relaxed text-muted-foreground">
        <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          Branded notification emails are rendered and queued here. Outbound delivery activates once an SMTP provider
          or email API key is configured, see{" "}
          <code className="rounded-full bg-muted px-1.5 font-mono text-caption text-foreground/80">src/lib/server/email.ts</code> for
          the setup. Until then, nothing is sent and nothing is lost.
        </p>
      </div>

      {isError ? (
        <div className="mt-4">
          <InlineError message={error instanceof Error ? error.message : "Could not load the email queue."} />
        </div>
      ) : isLoading ? (
        <div className="mt-4">
          <RowsSkeleton rows={4} />
        </div>
      ) : logs.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed bg-surface-sunken/60 px-4 py-6 text-center text-body-sm text-muted-foreground">
          No notifications queued yet.
        </p>
      ) : (
        <ul className="mt-4 max-h-96 divide-y overflow-y-auto rounded-md border">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium leading-snug">{log.subject}</p>
                <p className="truncate text-caption text-muted-foreground">
                  to {log.toName ? `${log.toName} · ` : ""}
                  <span className="font-mono">{log.toEmail}</span> · {log.kind}
                </p>
              </div>
              <span className="tnum shrink-0 text-caption text-muted-foreground">{timeAgo(log.createdAt)}</span>
              <EmailStatusBadge status={log.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function EmailStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    QUEUED: "bg-kraft-soft text-kraft-ink",
    SENT: "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
    FAILED: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  };
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-micro font-medium", styles[status] ?? "bg-secondary text-muted-foreground")}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ─── Add category dialog ──────────────────────────────────────────────────────

function AddCategoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/admin/settings/categories", {
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast({ title: "Category created" });
      setName("");
      setDescription("");
      setSubmitError(null);
      create.reset();
      onOpenChange(false);
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSubmitError(null); create.reset(); } }}>
      <DialogContent className="sm:max-w-[440px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitError(null);
            if (!name.trim()) {
              setSubmitError("Category name is required.");
              return;
            }
            create.mutate();
          }}
          className="space-y-4"
        >
          <DialogHeader className="border-b pb-4">
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name" className="text-body-sm">Category name</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Labels &amp; Stickers" className="h-9 text-body-sm" required maxLength={60} />
              {name.trim() && (
                <p className="text-caption text-muted-foreground">
                  Slug preview: <span className="font-mono">{slugify(name)}</span>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc" className="text-body-sm">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="cat-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What belongs in this category…" className="text-body-sm" />
            </div>
          </div>
          {submitError && <FieldError>{submitError}</FieldError>}
          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="gap-1.5" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              {create.isPending ? "Creating…" : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
