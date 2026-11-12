import { db } from "@/lib/db";
import { handler, ok, requireAdmin } from "@/lib/server/api";
import { ORDER_REQUEST_STATUSES } from "@/lib/constants";
import { auditActionLabel } from "@/lib/server/service";
import { serializeOrderListItem } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    await requireAdmin();

    const [
      activeCustomers,
      newOrderRequests,
      pendingQuotations,
      confirmedOrders,
      inProduction,
      openMessages,
      outstandingInvoiceAggregate,
      recentOrders,
      pendingOrderRows,
      pendingQuoteRows,
      adminNotifications,
      auditLogs,
    ] = await Promise.all([
      db.organization.count({ where: { status: "ACTIVE" } }),
      db.order.count({ where: { status: "SUBMITTED" } }),
      db.quotation.count({ where: { status: { in: ["REQUESTED", "UNDER_REVIEW"] } } }),
      db.order.count({ where: { status: "CONFIRMED" } }),
      db.order.count({ where: { status: "IN_PRODUCTION" } }),
      db.message.count({ where: { status: "OPEN" } }),
      db.order.aggregate({ where: { status: "DELIVERED" }, _sum: { totalCents: true } }),
      db.order.findMany({
        include: { items: true, organization: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      db.order.findMany({
        where: { status: { in: ORDER_REQUEST_STATUSES } },
        include: { organization: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.quotation.findMany({
        where: { status: { in: ["REQUESTED", "UNDER_REVIEW"] } },
        include: { organization: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.notification.findMany({
        where: { audience: "ADMIN" },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ]);

    // ─── ordersByWeek: last 8 weeks (Monday-start), requests vs confirmations ──
    const now = new Date();
    const mondayStart = new Date(now);
    mondayStart.setHours(0, 0, 0, 0);
    mondayStart.setDate(mondayStart.getDate() - ((now.getDay() + 6) % 7));
    const weeks: { start: Date; end: Date; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(mondayStart);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      weeks.push({
        start,
        end,
        label: start.toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      });
    }
    const windowStart = weeks[0].start;
    const [submittedOrders, confirmations] = await Promise.all([
      db.order.findMany({ where: { createdAt: { gte: windowStart } }, select: { createdAt: true } }),
      db.orderStatusHistory.findMany({
        where: { status: "CONFIRMED", createdAt: { gte: windowStart } },
        select: { createdAt: true },
      }),
    ]);
    const ordersByWeek = weeks.map((w) => ({
      label: w.label,
      orders: confirmations.filter((h) => h.createdAt >= w.start && h.createdAt < w.end).length,
      requests: submittedOrders.filter((o) => o.createdAt >= w.start && o.createdAt < w.end).length,
    }));

    // ─── pending tasks: open order requests + quotation requests ──────────────
    const tasks = [
      ...pendingOrderRows.map((o) => ({
        ts: o.createdAt.getTime(),
        task: {
          id: o.id,
          kind: "order",
          label: `Order request ${o.orderNumber} — ${o.organization.name}`,
          view: "admin-order-detail",
          relatedId: o.id,
        },
      })),
      ...pendingQuoteRows.map((q) => ({
        ts: q.createdAt.getTime(),
        task: {
          id: q.id,
          kind: "quotation",
          label: `Quotation request ${q.quoteNumber} — ${q.organization.name}`,
          view: "admin-quote-detail",
          relatedId: q.id,
        },
      })),
    ]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10)
      .map((t) => t.task);

    // ─── activity feed: admin notifications + audit log, newest first ────────
    const activity = [
      ...adminNotifications.map((n) => ({
        ts: n.createdAt.getTime(),
        entry: {
          id: n.id,
          title: n.title,
          detail: n.body,
          kind: n.kind,
          createdAt: n.createdAt.toISOString(),
        },
      })),
      ...auditLogs.map((a) => ({
        ts: a.createdAt.getTime(),
        entry: {
          id: a.id,
          title: auditActionLabel(a.action),
          detail: `${a.actorName}${a.detail ? ` — ${a.detail}` : ""}`,
          kind: "SYSTEM",
          createdAt: a.createdAt.toISOString(),
        },
      })),
    ]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 12)
      .map((t) => t.entry);

    return ok({
      activeCustomers,
      newOrderRequests,
      pendingQuotations,
      confirmedOrders,
      inProduction,
      openMessages,
      outstandingInvoiceCents: outstandingInvoiceAggregate._sum.totalCents ?? 0,
      recentOrders: recentOrders.map(serializeOrderListItem),
      pendingTasks: tasks,
      activity,
      ordersByWeek,
    });
  });
}
