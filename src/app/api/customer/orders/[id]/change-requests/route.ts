import { db } from "@/lib/db";
import { ApiError, handler, int, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { CHANGE_KINDS, ORDER_TERMINAL_STATUSES } from "@/lib/constants";
import { audit, notifyAdmin, notifyCustomer, optionalStr, requireOrgWrite } from "@/lib/server/service";
import { serializeChangeRequest } from "@/lib/server/serialize";
import type { ChangeItem } from "@/types";

const CHANGE_KIND_SET = new Set<string>(CHANGE_KINDS);
const MAX_CHANGES = 20;

/**
 * POST /api/customer/orders/:id/change-requests — ask for changes to an open
 * order. Nothing is applied yet: the request is a preserved record of exactly
 * what the customer asked for (pre-change values included), reviewed by
 * Jeffery Group before anything touches the order.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const orgId = user.orgId;
    const { id } = await params;

    const body = await readJson(req);
    const note = optionalStr(body.note, "Request note", 1000) ?? null;

    const rawChanges = body.changes;
    if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
      throw new ApiError("Describe at least one change.", 422);
    }
    if (rawChanges.length > MAX_CHANGES) {
      throw new ApiError(`A change request can include at most ${MAX_CHANGES} changes.`, 422);
    }

    // orgId in the where clause — another org's order is simply "not found".
    const order = await db.order.findFirst({
      where: { id, orgId },
      include: { items: true },
    });
    if (!order) throw new ApiError("Order not found.", 404);
    if ((ORDER_TERMINAL_STATUSES as readonly string[]).includes(order.status)) {
      throw new ApiError("This order is closed — contact Jeffery Group directly for anything urgent.", 422);
    }

    const changes: ChangeItem[] = rawChanges.map((raw, i): ChangeItem => {
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new ApiError(`Change ${i + 1} is invalid.`, 422);
      }
      const rec = raw as Record<string, unknown>;
      const kindText = str(rec.kind, `Change ${i + 1} type`, { required: true, max: 20 });
      if (!CHANGE_KIND_SET.has(kindText)) {
        throw new ApiError(`Change ${i + 1}: unknown change type.`, 422);
      }
      const kind = kindText as ChangeItem["kind"];
      const noteForItem = optionalStr(rec.note, `Change ${i + 1} note`, 500) ?? null;
      const productId = optionalStr(rec.productId, `Change ${i + 1} product`, 40) ?? null;
      const item = productId ? order.items.find((it) => it.productId === productId) : undefined;

      switch (kind) {
        case "QUANTITY": {
          const newQty = int(rec.newQty, `Change ${i + 1} new quantity`, { min: 1 });
          if (!productId || !item) {
            throw new ApiError(`Change ${i + 1}: that product is not on order ${order.orderNumber}.`, 422);
          }
          return { kind, productId, sku: item.sku, name: item.name, currentQty: item.qty, newQty, note: noteForItem };
        }
        case "SPEC": {
          const spec = str(rec.spec, `Change ${i + 1} specification`, { required: true, max: 2000 });
          if (!productId || !item) {
            throw new ApiError(`Change ${i + 1}: that product is not on order ${order.orderNumber}.`, 422);
          }
          return { kind, productId, sku: item.sku, name: item.name, spec, note: noteForItem };
        }
        case "ADD": {
          const name = str(rec.name, `Change ${i + 1} product name`, { required: true, max: 160 });
          const newQty = int(rec.newQty, `Change ${i + 1} quantity`, { min: 1 });
          // productId optional — catalogue product or a custom request.
          return { kind, ...(productId ? { productId } : {}), name, newQty, note: noteForItem };
        }
        case "REMOVE": {
          if (!productId || !item) {
            throw new ApiError(`Change ${i + 1}: that product is not on order ${order.orderNumber}.`, 422);
          }
          return { kind, productId, sku: item.sku, name: item.name, currentQty: item.qty, note: noteForItem };
        }
        case "ADDRESS": {
          const newAddress = str(rec.newAddress, `Change ${i + 1} new address`, { required: true, max: 500 });
          return { kind, newAddress, note: noteForItem };
        }
        case "DATE": {
          const newDate = str(rec.newDate, `Change ${i + 1} new date`, { required: true, max: 10 });
          if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
            throw new ApiError(`Change ${i + 1}: new date must be a date (YYYY-MM-DD).`, 422);
          }
          return { kind, newDate, note: noteForItem };
        }
        case "CANCEL":
        case "OTHER":
        default:
          return { kind, note: noteForItem };
      }
    });

    const created = await db.orderChangeRequest.create({
      data: {
        orderId: order.id,
        requestedById: user.id,
        requestedByName: user.name,
        status: "PENDING",
        requestNote: note,
        changesJson: JSON.stringify(changes),
      },
    });

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    await notifyAdmin({
      title: `Change request — ${order.orderNumber}`,
      body: `${user.name} at ${org?.name ?? "a customer"} requested ${changes.length} change${changes.length === 1 ? "" : "s"} to ${order.orderNumber}. Review it before anything is applied.`,
      kind: "CHANGE",
      view: "admin-order-detail",
      relatedId: order.id,
    });
    await notifyCustomer(orgId, {
      title: `Change request submitted — ${order.orderNumber}`,
      body: "Jeffery Group has been notified. Your order stays unchanged until they review and approve the request.",
      kind: "CHANGE",
      view: "order-detail",
      relatedId: order.id,
    });
    await audit(user, "CHANGE_REQUEST_SUBMITTED", "OrderChangeRequest", {
      entityId: created.id,
      detail: `${changes.length} change(s) requested on ${order.orderNumber}`,
    });

    return ok(
      serializeChangeRequest({ ...created, order: { id: order.id, orderNumber: order.orderNumber } }),
    );
  });
}
