import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import {
  ORDER_STATUS_SET,
  audit,
  notifyCustomer,
  optionalDate,
  optionalStr,
} from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const body = await readJson(req);
    const status = str(body.status, "Status", { required: true, max: 30 });
    if (!ORDER_STATUS_SET.has(status)) {
      throw new ApiError("Invalid order status.", 422);
    }
    const note = str(body.note, "Note", { max: 1000 });
    const trackingNumber = optionalStr(body.trackingNumber, "Tracking number", 60);
    const estimatedDelivery = optionalDate(body.estimatedDelivery, "Estimated delivery");

    const order = await db.order.findUnique({ where: { id } });
    if (!order) throw new ApiError("Order not found.", 404);

    await db.order.update({
      where: { id: order.id },
      data: {
        status,
        ...(trackingNumber !== undefined ? { trackingNumber } : {}),
        ...(estimatedDelivery !== undefined ? { estimatedDelivery } : {}),
      },
    });

    // History entry — snapshot signed by the admin actor.
    await db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status,
        note: note || null,
        byUserId: admin.id,
        byName: `${admin.name} (Jeffery Group)`,
      },
    });

    await audit({ id: admin.id, name: admin.name }, "ORDER_STATUS_CHANGED", "Order", {
      entityId: order.id,
      detail: `${order.orderNumber} → ${status}`,
    });

    // Notify the owning organization.
    const label = ORDER_STATUS_LABELS[status] ?? status;
    const parts: string[] = [`Your order is now "${label}".`];
    if (note) parts.push(note);
    if (trackingNumber) parts.push(`Tracking: ${trackingNumber}.`);
    if (estimatedDelivery) parts.push(`Estimated delivery: ${formatDate(estimatedDelivery)}.`);
    await notifyCustomer(order.orgId, {
      title: `Order ${order.orderNumber} — ${label}`,
      body: parts.join(" "),
      kind: "ORDER",
      view: "order-detail",
      relatedId: order.id,
    });

    return ok({ ok: true });
  });
}
