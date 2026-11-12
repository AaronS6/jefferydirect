"use client";

// Announcements strip — unread notifications surfaced prominently at the top
// of the customer dashboard so announcements from the Jeffery Group team
// (order updates, quotations, documents, broadcasts) can't be missed.
// "View" jumps to the relevant record; "Dismiss" marks the item read, which
// also clears it from the bell and the sidebar badge (shared query key).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  Megaphone,
  MessageSquareText,
  PackageCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAppStore, type ViewName } from "@/store/app-store";
import type { NotificationDto } from "@/types";
import { timeAgo } from "@/lib/date";
import { toast } from "@/hooks/use-toast";

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

export function AnnouncementsStrip() {
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", "customer"],
    queryFn: () => api.get<NotificationDto[]>("/api/customer/notifications"),
  });

  const readMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ ok: boolean }>("/api/customer/notifications/read", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () =>
      toast({ title: "Could not update notifications", description: "Please try again." }),
  });

  const unread = (notifications ?? []).filter((n) => !n.isRead);
  // Show up to three; the rest stay one click away behind "See all".
  const visible = unread.slice(0, 3);
  const hiddenCount = unread.length - visible.length;

  if (visible.length === 0) return null;

  function view(item: NotificationDto) {
    readMutation.mutate([item.id]);
    if (item.view) {
      navigate(item.view as ViewName, item.relatedId ? { id: item.relatedId } : undefined);
    } else {
      navigate("notifications");
    }
  }

  function dismiss(item: NotificationDto) {
    readMutation.mutate([item.id]);
  }

  return (
    <motion.section
      aria-label={`New announcements: ${unread.length} unread`}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="mb-8 overflow-hidden rounded-[14px] border border-kraft/45 bg-kraft-soft/70 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-kraft/30 px-5 py-3">
        <p className="flex items-center gap-2 text-micro text-kraft-ink">
          <Megaphone className="size-3.5" aria-hidden />
          New from Jeffery Group
          <span className="tnum rounded-full bg-kraft-strong px-1.5 py-0.5 text-caption font-semibold text-white">
            {unread.length} unread
          </span>
        </p>
        <button
          type="button"
          className="flex items-center gap-0.5 rounded text-caption font-medium text-kraft-ink underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => navigate("notifications")}
        >
          See all notifications <ChevronRight className="size-3.5" aria-hidden />
        </button>
      </div>

      <ul className="divide-y divide-kraft/25">
        {visible.map((item) => (
          <li key={item.id} className="flex items-start gap-3.5 px-5 py-3.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-kraft-strong/15 text-kraft-ink">
              <KindIcon kind={item.kind} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold leading-snug text-kraft-ink">{item.title}</p>
              <p className="mt-0.5 line-clamp-2 text-caption leading-relaxed text-kraft-ink/80">{item.body}</p>
              <p className="mt-1 text-caption text-kraft-ink/75">{timeAgo(item.createdAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-kraft/40 bg-card/60 px-2.5 text-caption hover:bg-card"
                disabled={readMutation.isPending}
                onClick={() => view(item)}
              >
                View
                <ChevronRight className="size-3" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-kraft-ink/70 hover:bg-card/60 hover:text-foreground"
                disabled={readMutation.isPending}
                aria-label={`Dismiss “${item.title}”`}
                onClick={() => dismiss(item)}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <p className="border-t border-kraft/30 bg-kraft-soft/40 px-5 py-2 text-caption text-kraft-ink/80">
          <span className="tnum font-medium">{hiddenCount}</span> more in your notifications.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={() => navigate("notifications")}
          >
            See all
          </button>
        </p>
      )}
    </motion.section>
  );
}
