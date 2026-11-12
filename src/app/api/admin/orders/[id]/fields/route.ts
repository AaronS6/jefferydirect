import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin } from "@/lib/server/api";
import { formatDate } from "@/lib/date";
import { audit, notifyCustomer, optionalDate, optionalStr } from "@/lib/server/service";
import { orderUpdateEmail, queueEmailForOrg } from "@/lib/server/email";

function isDate(v: Date | null | undefined): v is Date {
  return v !== null && v !== undefined;
}

/** True when the new value (possibly null = cleared) differs from the stored one. */
function dateChanged(next: Date | null | undefined, prev: Date | null): boolean {
  if (next === undefined) return false;
  if (next === null) return prev !== null;
  return prev === null || prev.getTime() !== next.getTime();
}

/**
 * PATCH — set explicit milestone dates on an order (each optional; null
 * clears). Customers are notified about delivery-estimate changes (in-app +
 * email) and next-update commitments (in-app only); other fields are silent
 * administrative detail.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);

    const requestedDeliveryDate = optionalDate(body.requestedDeliveryDate, "Requested delivery date");
    const estimatedDispatch = optionalDate(body.estimatedDispatch, "Estimated dispatch");
    const estimatedDelivery = optionalDate(body.estimatedDelivery, "Estimated delivery");
    const revisedDeliveryDate = optionalDate(body.revisedDeliveryDate, "Revised delivery date");
    const nextUpdateDate = optionalDate(body.nextUpdateDate, "Next update date");
    const actualDeliveryDate = optionalDate(body.actualDeliveryDate, "Actual delivery date");
    const trackingNumber = optionalStr(body.trackingNumber, "Tracking number", 60);

    const provided =
      requestedDeliveryDate !== undefined ||
      estimatedDispatch !== undefined ||
      estimatedDelivery !== undefined ||
      revisedDeliveryDate !== undefined ||
      nextUpdateDate !== undefined ||
      actualDeliveryDate !== undefined ||
      trackingNumber !== undefined;
    if (!provided) throw new ApiError("No fields to update.", 422);

    const order = await db.order.findUnique({
      where: { id },
      include: { organization: { select: { name: true } } },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    await db.order.update({
      where: { id: order.id },
      data: {
        ...(requestedDeliveryDate !== undefined ? { requestedDeliveryDate } : {}),
        ...(estimatedDispatch !== undefined ? { estimatedDispatch } : {}),
        ...(estimatedDelivery !== undefined ? { estimatedDelivery } : {}),
        ...(revisedDeliveryDate !== undefined ? { revisedDeliveryDate } : {}),
        ...(nextUpdateDate !== undefined ? { nextUpdateDate } : {}),
        ...(actualDeliveryDate !== undefined ? { actualDeliveryDate } : {}),
        ...(trackingNumber !== undefined ? { trackingNumber } : {}),
      },
    });

    const estChanged = dateChanged(estimatedDelivery, order.estimatedDelivery);
    const revisedChanged = dateChanged(revisedDeliveryDate, order.revisedDeliveryDate);
    const nextChanged = dateChanged(nextUpdateDate, order.nextUpdateDate);

    if (estChanged || revisedChanged) {
      await notifyCustomer(order.orgId, {
        title: `Delivery estimate updated — ${order.orderNumber}`,
        body: "Jeffery Group updated the estimated delivery for this order. See the latest dates on your order page.",
        kind: "ORDER",
        view: "order-detail",
        relatedId: order.id,
      });
      const eta = revisedChanged && isDate(revisedDeliveryDate) ? revisedDeliveryDate : estimatedDelivery;
      await queueEmailForOrg(order.orgId, (recipient) => {
        const content = orderUpdateEmail(
          order.organization.name,
          order.orderNumber,
          "Delivery estimate updated",
          "The estimated delivery for your order has been updated. See the order page in ClientHub for the latest dates.",
          isDate(eta) ? eta : null,
        );
        return {
          to: recipient.email,
          toName: recipient.name,
          ...content,
          kind: "UPDATE",
          relatedId: order.id,
        };
      });
    }

    if (nextChanged && isDate(nextUpdateDate)) {
      await notifyCustomer(order.orgId, {
        title: `Next update scheduled — ${order.orderNumber}`,
        body: `Jeffery Group expects to provide another update by ${formatDate(nextUpdateDate.toISOString())}.`,
        kind: "UPDATE",
        view: "order-detail",
        relatedId: order.id,
      });
    }

    const changedFields: string[] = [];
    if (dateChanged(requestedDeliveryDate, order.requestedDeliveryDate)) {
      changedFields.push("requestedDeliveryDate");
    }
    if (dateChanged(estimatedDispatch, order.estimatedDispatch)) changedFields.push("estimatedDispatch");
    if (estChanged) changedFields.push("estimatedDelivery");
    if (revisedChanged) changedFields.push("revisedDeliveryDate");
    if (nextChanged) changedFields.push("nextUpdateDate");
    if (dateChanged(actualDeliveryDate, order.actualDeliveryDate)) changedFields.push("actualDeliveryDate");
    if (trackingNumber !== undefined && trackingNumber !== order.trackingNumber) {
      changedFields.push("trackingNumber");
    }
    await audit(admin, "ORDER_FIELDS_UPDATED", "Order", {
      entityId: order.id,
      detail: changedFields.length ? changedFields.join(", ") : "no material changes",
    });

    return ok({ ok: true });
  });
}
