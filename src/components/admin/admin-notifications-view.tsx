"use client";

// Administration — notification centre: the internal activity feed (mark read)
// plus a composer that sends notifications to one customer or every active
// customer, with a live preview of how it will appear.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, Megaphone, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/date";
import { NOTIFICATION_KINDS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import type { NotificationDto, CustomerListItem } from "@/types";
import { InlineError, RowsSkeleton, SectionCard, KindMark, ViewEnter } from "./admin-ui";
import { cn } from "@/lib/utils";

const ALL = "ALL";

export function AdminNotificationsView() {
  const queryClient = useQueryClient();
  const [readPending, setReadPending] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () => api.get<NotificationDto[]>("/api/admin/notifications"),
  });

  const { data: customers } = useQuery({
    queryKey: ["admin", "customers", ""],
    queryFn: () => api.get<CustomerListItem[]>("/api/admin/customers?search="),
  });

  async function markAllRead() {
    setReadPending(true);
    try {
      await api.post("/api/admin/notifications/read", { all: true });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Marked all read" });
    } catch (err) {
      toast({ title: "Could not update notifications", description: err instanceof Error ? err.message : undefined });
    } finally {
      setReadPending(false);
    }
  }

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div>
      <PageHeader title="Notifications" />

      <ViewEnter>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Feed */}
        <SectionCard
          title="Recent activity"
          action={
            unread > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={readPending}
                onClick={markAllRead}
              >
                <CheckCheck className="size-3.5" aria-hidden />
                {readPending ? "Marking…" : `Mark all read (${unread})`}
              </Button>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          {isError ? (
            <div className="p-4 sm:p-5">
              <InlineError message={error instanceof Error ? error.message : "Could not load notifications."} />
            </div>
          ) : isLoading ? (
            <div className="p-4 sm:p-5">
              <RowsSkeleton rows={5} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={BellRing}
                title="No notifications yet"
              />
            </div>
          ) : (
            <ul className="max-h-[620px] divide-y overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id} className={cn("flex gap-3 px-5 py-3.5", !n.isRead && "bg-accent/50")}>
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                      n.isRead ? "bg-secondary/50 text-muted-foreground" : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    <KindMark kind={n.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          "min-w-0 truncate text-body-sm leading-snug",
                          n.isRead ? "font-normal text-muted-foreground" : "font-medium text-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="tnum shrink-0 text-caption text-muted-foreground">{timeAgo(n.createdAt)}</p>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-caption leading-snug text-muted-foreground">{n.body}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-micro text-muted-foreground">
                      {n.kind}
                      {n.isRead ? " · read" : " · unread"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Composer */}
        <SendComposer customers={customers ?? []} />
      </div>
      </ViewEnter>
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

function SendComposer({ customers }: { customers: CustomerListItem[] }) {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string>(ALL);
  const [kind, setKind] = useState<string>("SYSTEM");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>("/api/admin/notifications", {
        orgId: orgId === ALL ? null : orgId,
        title: title.trim(),
        body: body.trim(),
        kind,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      toast({ title: "Notification sent" });
      setTitle("");
      setBody("");
      setSubmitError(null);
      send.reset();
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!title.trim() || !body.trim()) {
      setSubmitError("A title and a short body are required.");
      return;
    }
    send.mutate();
  }

  const audienceName = orgId === ALL ? "All active customers" : (customers.find((c) => c.id === orgId)?.name ?? "Customer");

  return (
    <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-[84px]">
      <SectionCard title="Send a notification">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="notif-audience" className="text-body-sm">Audience</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger id="notif-audience" className="h-9 w-full text-body-sm" aria-label="Notification audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-micro">Broadcast</SelectLabel>
                  <SelectItem value={ALL}>
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" aria-hidden /> All customers
                    </span>
                  </SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-micro">Specific customer</SelectLabel>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">
              {orgId === ALL ? "Sent to every active customer." : "Sent only to this customer."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-kind" className="text-body-sm">Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="notif-kind" className="h-9 w-full text-body-sm" aria-label="Notification kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFICATION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k.charAt(0) + k.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-title" className="text-body-sm">Title</Label>
            <Input id="notif-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Holiday delivery schedule" className="h-9 text-body-sm" maxLength={120} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-body" className="text-body-sm">Message</Label>
            <Textarea id="notif-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What customers should know…" className="text-body-sm" maxLength={600} />
          </div>

          {submitError && <p className="text-caption text-[var(--status-danger-fg)]">{submitError}</p>}

          <Button type="submit" className="w-full gap-1.5" disabled={send.isPending}>
            {send.isPending ? <Send className="size-4 animate-pulse" aria-hidden /> : <Megaphone className="size-4" aria-hidden />}
            {send.isPending ? "Sending…" : "Send notification"}
          </Button>
        </form>
      </SectionCard>

      {/* Live preview */}
      <SectionCard title="Preview">
        <div className="rounded-[14px] border bg-card p-3.5 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-secondary text-secondary-foreground">
              <KindMark kind={kind} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium leading-snug text-foreground">
                {title.trim() || <span className="text-muted-foreground">Notification title…</span>}
              </p>
              <p className="mt-0.5 text-caption leading-snug text-muted-foreground">
                {body.trim() || <span className="text-muted-foreground/60">Your message appears here…</span>}
              </p>
              <p className="mt-1.5 text-caption text-muted-foreground">just now · {audienceName}</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
