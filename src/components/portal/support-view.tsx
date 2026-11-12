"use client";

// Messages — an email-paced thread with our team (no fake live chat): one
// chronological feed of customer messages (right, ink bubbles) and staff
// replies (left, sunken surface), with a pinned composer at the bottom.
// Read-only portal users can follow the thread but not send.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { CornerDownRight, LifeBuoy, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { statusTone } from "@/components/shared/status-badge";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { MessageDto, OrderListItem } from "@/types";
import { MESSAGE_CATEGORIES, MESSAGE_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/date";
import { toast } from "@/hooks/use-toast";
import { ErrorAlert, RowsSkeleton } from "./portal-bits";

const NONE = "none";
const EASE = [0.22, 1, 0.36, 1] as const;

type ThreadItem =
  | { key: string; kind: "day"; label: string }
  | { key: string; kind: "message"; message: MessageDto }
  | { key: string; kind: "reply"; message: MessageDto };

function isSameCalendarDay(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return startOf(d) === startOf(new Date());
}

/** "Today" or "14 Nov 2026" — the day separator labels. */
function dayLabel(iso: string): string {
  return isSameCalendarDay(iso) ? "Today" : formatDate(iso);
}

export function SupportView() {
  const navigate = useAppStore((s) => s.navigate);
  const session = useAppStore((s) => s.session);
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const { data: messages, isLoading, error, refetch } = useQuery({
    queryKey: ["messages"],
    queryFn: () => api.get<MessageDto[]>("/api/customer/messages"),
  });

  const { data: orders } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<OrderListItem[]>("/api/customer/orders"),
  });

  const canSend = session?.user.orgRole !== "READONLY";

  // Chronological feed (oldest first) with day separators between days.
  const thread = useMemo(() => {
    const asc = [...(messages ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const items: ThreadItem[] = [];
    let lastDay = "";
    let n = 0;
    const push = (iso: string, make: (key: string) => ThreadItem) => {
      const label = dayLabel(iso);
      if (label && label !== lastDay) {
        items.push({ key: `day-${label}`, kind: "day", label });
        lastDay = label;
      }
      items.push(make(`item-${n++}`));
    };
    for (const m of asc) {
      push(m.createdAt, (key) => ({ key, kind: "message", message: m }));
      if (m.reply) push(m.repliedAt ?? m.createdAt, (key) => ({ key, kind: "reply", message: m }));
    }
    return items;
  }, [messages]);

  const feedRef = useRef<HTMLDivElement>(null);

  // Keep the newest exchange in view when the thread grows.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  return (
    <motion.div {...enter}>
      <PageHeader title="Messages" />

      {error ? (
        <ErrorAlert message="We could not load your message history." onRetry={() => refetch()} />
      ) : isLoading || !messages ? (
        <div className="rounded-[14px] border bg-card p-5 shadow-xs">
          <Skeleton className="h-4 w-44" />
          <RowsSkeleton rows={4} className="mt-4" />
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-[14px] border bg-card shadow-xs">
          {/* Thread feed */}
          <div
            ref={feedRef}
            className="max-h-[min(60vh,560px)] min-h-[180px] overflow-y-auto px-4 py-5 sm:px-6"
            aria-label="Message history"
          >
            {thread.length === 0 ? (
              <div className="py-8">
                <EmptyState icon={LifeBuoy} title="No messages yet" />
              </div>
            ) : (
              <ul className="m-0 space-y-5">
                {thread.map((item) => {
                  if (item.kind === "day") {
                    return (
                      <li key={item.key} className="flex items-center gap-3" aria-hidden>
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-micro text-muted-foreground">{item.label}</span>
                        <span className="h-px flex-1 bg-border" />
                      </li>
                    );
                  }
                  if (item.kind === "reply") {
                    return (
                      <ReplyBubble key={item.key} message={item.message} />
                    );
                  }
                  return (
                    <CustomerBubble
                      key={item.key}
                      message={item.message}
                      onOpenOrder={() =>
                        item.message.orderId && navigate("order-detail", { id: item.message.orderId })
                      }
                    />
                  );
                })}
              </ul>
            )}
          </div>

          {/* Composer — pinned below the feed */}
          {canSend ? (
            <Composer
              orders={orders ?? []}
              authorName={session?.user.name ?? ""}
              onSent={() => {
                queryClient.invalidateQueries({ queryKey: ["messages"] });
                queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
              }}
            />
          ) : (
            <p className="border-t px-5 py-3.5 text-caption text-muted-foreground">Read-only account</p>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Thread bubbles ──────────────────────────────────────────────────────────

function CustomerBubble({ message, onOpenOrder }: { message: MessageDto; onOpenOrder: () => void }) {
  const answered = message.status === "ANSWERED";
  return (
    <li className="flex flex-col items-end">
      <p className="mb-1 flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 gap-y-1 text-caption text-muted-foreground">
        <span className="font-medium text-foreground/80">{message.subject}</span>
        <span className="inline-flex h-[22px] items-center rounded-full border bg-card px-2">
          {MESSAGE_CATEGORY_LABELS[message.category] ?? message.category}
        </span>
        <span className={statusTone(answered ? "done" : "pending")}>
          {answered ? "Answered" : "Awaiting reply"}
        </span>
        {message.orderNumber && (
          <button
            type="button"
            className="tnum font-medium underline-offset-2 transition-colors hover:text-primary hover:underline"
            onClick={onOpenOrder}
          >
            {message.orderNumber}
          </button>
        )}
      </p>
      <div className="max-w-[80%] rounded-[14px] rounded-br-md bg-primary px-4 py-3 shadow-btn">
        <p className="whitespace-pre-line text-body-sm leading-relaxed text-primary-foreground">{message.body}</p>
      </div>
      <p className="mt-1 text-caption text-muted-foreground/80">
        {message.authorName} · {timeAgo(message.createdAt)}
      </p>
    </li>
  );
}

function ReplyBubble({ message }: { message: MessageDto }) {
  return (
    <li className="flex flex-col items-start">
      <div className="max-w-[85%] rounded-[14px] rounded-bl-md border bg-surface-sunken px-4 py-3">
        <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
          <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
          Reply from {message.repliedBy ?? "Jeffery Group"}
        </p>
        <p className="mt-1.5 whitespace-pre-line text-body-sm leading-relaxed text-foreground">{message.reply}</p>
      </div>
      <p className="mt-1 text-caption text-muted-foreground/80">
        {message.repliedBy ?? "Jeffery Group"} · {timeAgo(message.repliedAt)}
      </p>
    </li>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

function Composer({
  orders,
  authorName,
  onSent,
}: {
  orders: OrderListItem[];
  authorName: string;
  onSent: () => void;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("");
  const [orderId, setOrderId] = useState<string>(NONE);
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const sendMutation = useMutation({
    mutationFn: (payload: { subject: string; category: string; orderId?: string; body: string }) =>
      api.post<{ id: string }>("/api/customer/messages", payload),
    // Optimistic append: the bubble appears immediately, replaced by the
    // refetched thread once the server confirms.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["messages"] });
      const previous = queryClient.getQueryData<MessageDto[]>(["messages"]);
      const optimistic: MessageDto = {
        id: `optimistic-${Date.now()}`,
        subject: payload.subject,
        category: payload.category,
        body: payload.body,
        status: "OPEN",
        reply: null,
        repliedAt: null,
        repliedBy: null,
        createdAt: new Date().toISOString(),
        orderId: payload.orderId ?? null,
        orderNumber: payload.orderId
          ? (orders.find((o) => o.id === payload.orderId)?.orderNumber ?? null)
          : null,
        authorName,
      };
      if (previous) queryClient.setQueryData(["messages"], [optimistic, ...previous]);
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["messages"], ctx.previous);
      toast({ title: "Could not send", description: "Please try again." });
    },
    onSuccess: () => {
      onSent();
      setSubject("");
      setCategory("");
      setOrderId(NONE);
      setBody("");
      setFormError(null);
      toast({ title: "Message sent" });
    },
  });

  function send() {
    if (!subject.trim() || !category || !body.trim()) {
      setFormError("Add a subject, a category and your message.");
      return;
    }
    setFormError(null);
    sendMutation.mutate({
      subject: subject.trim(),
      category,
      body: body.trim(),
      ...(orderId !== NONE ? { orderId } : {}),
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="space-y-3 border-t px-4 py-4 sm:px-6"
      aria-label="Send a new message"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Input
          maxLength={160}
          placeholder="Subject"
          aria-label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1"
          disabled={sendMutation.isPending}
        />
        <Select value={category} onValueChange={setCategory} disabled={sendMutation.isPending}>
          <SelectTrigger className="w-full sm:w-[190px]" aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {MESSAGE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {MESSAGE_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orderId} onValueChange={setOrderId} disabled={sendMutation.isPending}>
          <SelectTrigger className="w-full sm:w-[190px]" aria-label="Link an order">
            <SelectValue placeholder="No linked order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No linked order</SelectItem>
            {orders.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.orderNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        rows={3}
        maxLength={4000}
        placeholder="Message"
        aria-label="Message"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter inserts a newline.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        disabled={sendMutation.isPending}
      />
      {formError && (
        <p role="alert" className="text-caption text-[var(--status-danger-fg)]">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-caption text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
        <Button type="submit" size="sm" className="gap-2" disabled={sendMutation.isPending}>
          {sendMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Sending
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden /> Send
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
