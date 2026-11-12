import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { ORDER_TERMINAL_STATUSES } from "@/lib/constants";
import { audit } from "@/lib/server/service";
import { serializeChangeRequest, serializeMessage } from "@/lib/server/serialize";
import type { AttentionCentreDto, AttentionOrderCard } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

const FULFILMENT_STATUSES = new Set([
  "CONFIRMED",
  "PROCESSING",
  "IN_PRODUCTION",
  "READY_FOR_SHIPMENT",
  "DISPATCHED",
]);

const DISMISSABLE_SECTIONS = new Set([
  "NEW_ORDER",
  "NEEDS_UPDATE",
  "OVERDUE_UPDATE",
  "UPDATE_REMINDER",
  "DELAYED",
  "UPCOMING_DELIVERY",
]);

type AttentionOrderRow = {
  id: string;
  orderNumber: string;
  orgId: string;
  status: string;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
  estimatedDelivery: Date | null;
  revisedDeliveryDate: Date | null;
  nextUpdateDate: Date | null;
  sourceType: string;
  items: { id: string }[];
  organization: { name: string; code: string };
  updates: { publishedAt: Date | null; category: string }[]; // published only, newest first
  dismissals: {
    id: string;
    orderId: string;
    section: string;
    dismissedBy: string | null;
    dismissedAt: Date;
  }[];
  changeRequests: { status: string }[];
};

function baseCard(order: AttentionOrderRow): AttentionOrderCard {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orgName: order.organization.name,
    orgId: order.orgId,
    status: order.status,
    itemCount: order.items.length,
    totalCents: order.totalCents,
  };
}

/** Latest published update (the include is already newest-first). */
function lastUpdateAt(order: AttentionOrderRow): Date | null {
  const first = order.updates[0];
  return first && first.publishedAt !== null ? first.publishedAt : null;
}

/** The effective delivery estimate: a revision overrides the original. */
function effectiveDelivery(order: AttentionOrderRow): Date | null {
  return order.revisedDeliveryDate ?? order.estimatedDelivery;
}

/** A dismissal hides the card until the underlying condition changes again. */
function isDismissed(order: AttentionOrderRow, section: string, relevantAt: Date): boolean {
  return order.dismissals.some(
    (d) => d.section === section && d.dismissedAt.getTime() > relevantAt.getTime(),
  );
}

/**
 * GET — the Admin Attention Centre: everything that needs a Jeffery Group
 * hand right now, with dismissed items hidden until their condition changes.
 */
export async function GET() {
  return handler(async () => {
    await requireAdmin();

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const dueInDays = (d: Date): number =>
      Math.floor((d.getTime() - startOfToday.getTime()) / DAY_MS);

    const [orderRows, changeRequests, messages] = await Promise.all([
      db.order.findMany({
        where: { status: { notIn: [...ORDER_TERMINAL_STATUSES] } },
        include: {
          items: { select: { id: true } },
          organization: { select: { name: true, code: true } },
          updates: {
            where: { isPublished: true },
            select: { publishedAt: true, category: true },
            orderBy: { publishedAt: "desc" },
          },
          dismissals: true,
          changeRequests: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.orderChangeRequest.findMany({
        where: { status: "PENDING" },
        include: {
          order: { select: { id: true, orderNumber: true, organization: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      db.message.findMany({
        where: { status: "OPEN" },
        include: { user: { select: { name: true } }, organization: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Structural view of the rows — every include the cards need is present.
    const orders: AttentionOrderRow[] = orderRows;

    // Message rows store orderId without a relation — resolve numbers here.
    const messageOrderIds = messages
      .map((m) => m.orderId)
      .filter((oid): oid is string => oid !== null);
    const messageOrders = messageOrderIds.length
      ? await db.order.findMany({
          where: { id: { in: messageOrderIds } },
          select: { id: true, orderNumber: true },
        })
      : [];
    const orderNumberById = new Map(messageOrders.map((o) => [o.id, o.orderNumber]));

    // ── New order requests (SUBMITTED, awaiting review) ────────────────────
    const newOrderRequests: AttentionOrderCard[] = orders
      .filter((o) => o.status === "SUBMITTED" && !isDismissed(o, "NEW_ORDER", o.createdAt))
      .slice(0, 12)
      .map((o) => ({
        ...baseCard(o),
        requestedAt: o.createdAt.toISOString(),
        sourceType: o.sourceType,
      }));

    // ── Overdue updates (nextUpdateDate has passed) ───────────────────────
    const overdue = orders.filter(
      (o): o is AttentionOrderRow & { nextUpdateDate: Date } =>
        o.nextUpdateDate !== null && o.nextUpdateDate.getTime() < startOfToday.getTime(),
    );
    const overdueIds = new Set(overdue.map((o) => o.id));
    const overdueUpdates: AttentionOrderCard[] = overdue
      .filter((o) => !isDismissed(o, "OVERDUE_UPDATE", o.nextUpdateDate))
      .sort((a, b) => a.nextUpdateDate.getTime() - b.nextUpdateDate.getTime())
      .map((o) => {
        const lu = lastUpdateAt(o);
        return {
          ...baseCard(o),
          nextUpdateDate: o.nextUpdateDate.toISOString(),
          dueInDays: dueInDays(o.nextUpdateDate),
          lastUpdateAt: lu ? lu.toISOString() : null,
        };
      });

    // ── Update reminders due within 3 days ────────────────────────────────
    const upcomingUpdateReminders: AttentionOrderCard[] = orders
      .filter(
        (o): o is AttentionOrderRow & { nextUpdateDate: Date } => {
          if (o.nextUpdateDate === null) return false;
          const d = dueInDays(o.nextUpdateDate);
          return d >= 0 && d <= 3;
        },
      )
      .filter((o) => !isDismissed(o, "UPDATE_REMINDER", o.nextUpdateDate))
      .sort((a, b) => a.nextUpdateDate.getTime() - b.nextUpdateDate.getTime())
      .map((o) => ({
        ...baseCard(o),
        nextUpdateDate: o.nextUpdateDate.toISOString(),
        dueInDays: dueInDays(o.nextUpdateDate),
      }));

    // ── Fulfilment orders with no recent published update ──────────────────
    const staleCutoff = new Date(now.getTime() - 7 * DAY_MS);
    const ordersNeedingUpdates: AttentionOrderCard[] = orders
      .filter((o) => {
        if (!FULFILMENT_STATUSES.has(o.status) || overdueIds.has(o.id)) return false;
        const lu = lastUpdateAt(o);
        return lu === null || lu.getTime() < staleCutoff.getTime();
      })
      .filter((o) => !isDismissed(o, "NEEDS_UPDATE", lastUpdateAt(o) ?? o.createdAt))
      .sort((a, b) => (lastUpdateAt(a) ?? a.createdAt).getTime() - (lastUpdateAt(b) ?? b.createdAt).getTime())
      .map((o) => {
        const lu = lastUpdateAt(o);
        return { ...baseCard(o), lastUpdateAt: lu ? lu.toISOString() : null };
      });

    // ── Delay-flagged orders still open ────────────────────────────────────
    const delayedOrders: AttentionOrderCard[] = orders
      .filter((o) => o.revisedDeliveryDate !== null || o.updates.some((u) => u.category === "DELAY"))
      .filter((o) => !isDismissed(o, "DELAYED", lastUpdateAt(o) ?? o.createdAt))
      .map((o) => {
        const eff = effectiveDelivery(o);
        return {
          ...baseCard(o),
          estimatedDelivery: eff ? eff.toISOString() : null,
          ...(o.nextUpdateDate ? { nextUpdateDate: o.nextUpdateDate.toISOString() } : {}),
        };
      });

    // ── Deliveries expected within 7 days (or already past due) ────────────
    const upcomingDeliveries: AttentionOrderCard[] = orders
      .map((o) => ({ order: o, eff: effectiveDelivery(o) }))
      .filter((p): p is { order: AttentionOrderRow; eff: Date } => p.eff !== null && dueInDays(p.eff) <= 7)
      .filter((p) => !isDismissed(p.order, "UPCOMING_DELIVERY", p.order.updatedAt))
      .sort((a, b) => a.eff.getTime() - b.eff.getTime())
      .map((p) => ({
        ...baseCard(p.order),
        estimatedDelivery: p.eff.toISOString(),
        dueInDays: dueInDays(p.eff),
      }));

    const dto: AttentionCentreDto = {
      newOrderRequests,
      pendingChangeRequests: changeRequests.map((c) => ({
        ...serializeChangeRequest(c),
        orderId: c.order.id,
        orderNumber: c.order.orderNumber,
        orgName: c.order.organization.name,
      })),
      pendingMessages: messages.map((m) =>
        serializeMessage({
          ...m,
          order:
            m.orderId && orderNumberById.has(m.orderId)
              ? { orderNumber: orderNumberById.get(m.orderId) as string }
              : null,
        }),
      ),
      ordersNeedingUpdates,
      overdueUpdates,
      upcomingUpdateReminders,
      delayedOrders,
      upcomingDeliveries,
    };
    return ok(dto);
  });
}

/**
 * POST — dismiss one Attention Centre card. The card reappears automatically
 * once its underlying condition changes after the dismissal.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();
    const body = await readJson(req);

    const orderId = str(body.orderId, "Order", { required: true, max: 40 });
    const section = str(body.section, "Section", { required: true, max: 40 });
    if (!DISMISSABLE_SECTIONS.has(section)) {
      throw new ApiError("This Attention Centre section cannot be dismissed.", 422);
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    await db.attentionDismissal.upsert({
      where: { orderId_section: { orderId: order.id, section } },
      create: {
        orderId: order.id,
        section,
        dismissedBy: `${admin.name} (Admin)`,
        dismissedAt: new Date(),
      },
      update: {
        dismissedBy: `${admin.name} (Admin)`,
        dismissedAt: new Date(),
      },
    });
    await audit(admin, "ATTENTION_DISMISSED", "Order", {
      entityId: order.id,
      detail: `${section} — ${order.orderNumber}`,
    });

    return ok({ ok: true });
  });
}
