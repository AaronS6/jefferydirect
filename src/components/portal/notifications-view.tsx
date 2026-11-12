"use client";

// Notifications — unread first, click-through to the relevant view, and a
// mark-all-as-read action.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Bell, CheckCheck, FileText, FolderOpen, Megaphone, MessageSquareText, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useAppStore, type ViewName } from "@/store/app-store";
import type { NotificationDto } from "@/types";
import { timeAgo } from "@/lib/date";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ErrorAlert, RowsSkeleton } from "./portal-bits";

const EASE = [0.22, 1, 0.36, 1] as const;

const KIND_ICONS: Record<string, typeof PackageCheck> = {
  ORDER: PackageCheck,
  QUOTATION: FileText,
  DOCUMENT: FolderOpen,
  MESSAGE: MessageSquareText,
  SYSTEM: Megaphone,
};

function KindIcon({ kind }: { kind: string }) {
  const Icon = KIND_ICONS[kind] ?? Megaphone;
  return <Icon className="size-4" aria-hidden />;
}

// Same-calendar-day check for the Today / Earlier grouping (presentation only).
function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return startOf(d) === startOf(new Date());
}

export function NotificationsView() {
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const { data: notifications, isLoading, error, refetch } = useQuery({
    queryKey: ["notifications", "customer"],
    queryFn: () => api.get<NotificationDto[]>("/api/customer/notifications"),
  });

  const readMutation = useMutation({
    mutationFn: (payload: { ids?: string[]; all?: boolean }) =>
      api.post<{ ok: boolean }>("/api/customer/notifications/read", payload),
    // Optimistic: flip read flags in the cache first, roll back on failure.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["notifications", "customer"] });
      const previous = queryClient.getQueryData<NotificationDto[]>(["notifications", "customer"]);
      if (previous) {
        const markAll = payload.all === true;
        const ids = new Set(payload.ids ?? []);
        queryClient.setQueryData(
          ["notifications", "customer"],
          previous.map((n) => ({ ...n, isRead: markAll ? true : ids.has(n.id) ? true : n.isRead })),
        );
      }
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["notifications", "customer"], ctx.previous);
      }
      toast({ title: "Could not update notifications", description: "Please try again." });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
    },
  });

  const all = notifications ?? [];
  const unread = all.filter((n) => !n.isRead);

  // Today / Earlier grouping (derived, presentation only) — items stay newest-first.
  const groups: { label: string; items: NotificationDto[] }[] = [];
  for (const n of all) {
    const label = isToday(n.createdAt) ? "Today" : "Earlier";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  function open(item: NotificationDto) {
    readMutation.mutate({ ids: [item.id] });
    if (item.view) {
      navigate(item.view as ViewName, item.relatedId ? { id: item.relatedId } : undefined);
    }
  }

  return (
    <motion.div {...enter}>
      <PageHeader
        title="Notifications"
        actions={
          unread.length > 0 ? (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => readMutation.mutate({ all: true })}
              disabled={readMutation.isPending}
            >
              <CheckCheck className="size-4" aria-hidden />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <ErrorAlert message="We could not load your notifications." onRetry={() => refetch()} />
      ) : isLoading || !notifications ? (
        <div className="rounded-[14px] border bg-card p-5 shadow-xs">
          <Skeleton className="h-4 w-40" />
          <RowsSkeleton rows={4} className="mt-4" />
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.label} aria-label={`${group.label} notifications`}>
              <h2 className="text-micro mb-3 text-muted-foreground">
                {group.label}
                {group.label === "Today" && unread.length > 0 && (
                  <span className="tnum ml-2 text-caption text-kraft-ink">{unread.length} unread</span>
                )}
              </h2>
              <ul className="divide-y overflow-hidden rounded-[14px] border bg-card shadow-xs">
                {group.items.map((n) => (
                  <NotificationRow key={n.id} item={n} onOpen={() => open(n)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationDto;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        onClick={onOpen}
        className={cn(
          "flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:bg-accent/70",
          !item.isRead && "bg-kraft-soft/35",
        )}
      >
        {/* kraft dot + kind icon for unread — same pattern as the shell popover */}
        <span
          aria-hidden
          className={cn(
            "mt-1 size-[7px] shrink-0 rounded-full",
            item.isRead ? "bg-border" : "bg-kraft-strong",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            item.isRead ? "bg-muted text-muted-foreground" : "bg-kraft-strong/15 text-kraft-ink",
          )}
        >
          <KindIcon kind={item.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-body-sm leading-snug",
              item.isRead ? "text-muted-foreground" : "font-semibold text-foreground",
            )}
          >
            {item.title}
          </span>
          <span className="mt-0.5 block text-caption leading-relaxed text-muted-foreground">{item.body}</span>
          <span className="mt-1 block text-caption text-muted-foreground/80">
            {timeAgo(item.createdAt)}
            {item.view && <span className="ml-1 font-medium">· View</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
