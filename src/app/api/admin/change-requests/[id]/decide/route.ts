import { db } from "@/lib/db";
import { ApiError, handler, int, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { CHANGE_KINDS } from "@/lib/constants";
import {
  applyChangeItems,
  audit,
  notifyCustomer,
  optionalStr,
} from "@/lib/server/service";
import { changeRequestDecisionEmail, queueEmailForOrg } from "@/lib/server/email";
import { parseChangeItems, serializeChangeRequest } from "@/lib/server/serialize";
import type { ChangeItem } from "@/types";

const CHANGE_KIND_SET = new Set<string>(CHANGE_KINDS);
const DECISIONS = new Set(["ACCEPT", "DECLINE", "COUNTER"]);

/** Validate an administrator's counter-proposal items (1..20, known kinds). */
function parseCounterItems(v: unknown): ChangeItem[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new ApiError("A counter-proposal must include at least one change.", 422);
  }
  if (v.length > 20) {
    throw new ApiError("A counter-proposal can include at most 20 changes.", 422);
  }
  return v.map((raw, i) => {
    const label = `Counter item ${i + 1}`;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ApiError(`${label} is invalid.`, 422);
    }
    const rec = raw as Record<string, unknown>;
    const kind = str(rec.kind, `${label} type`, { required: true, max: 20 });
    if (!CHANGE_KIND_SET.has(kind)) {
      throw new ApiError(`${label} has an invalid change type.`, 422);
    }
    const item: ChangeItem = { kind: kind as ChangeItem["kind"] };
    if (rec.productId !== undefined && rec.productId !== null) {
      item.productId = str(rec.productId, `${label} product`, { max: 40 });
    }
    if (rec.sku !== undefined && rec.sku !== null) {
      item.sku = str(rec.sku, `${label} SKU`, { max: 40 });
    }
    if (rec.name !== undefined && rec.name !== null) {
      item.name = str(rec.name, `${label} name`, { max: 160 });
    }
    if (rec.currentQty !== undefined && rec.currentQty !== null) {
      item.currentQty = int(rec.currentQty, `${label} current quantity`, { min: 0 });
    }
    if (rec.newQty !== undefined && rec.newQty !== null) {
      item.newQty = int(rec.newQty, `${label} new quantity`, { min: 1 });
    }
    if (rec.spec !== undefined && rec.spec !== null) {
      item.spec = str(rec.spec, `${label} specification`, { max: 1000 });
    }
    if (rec.newAddress !== undefined && rec.newAddress !== null) {
      item.newAddress = str(rec.newAddress, `${label} address`, { max: 500 });
    }
    if (rec.newDate !== undefined && rec.newDate !== null) {
      item.newDate = str(rec.newDate, `${label} date`, { max: 10 });
    }
    if (rec.note !== undefined && rec.note !== null) {
      item.note = str(rec.note, `${label} note`, { max: 1000 });
    }
    return item;
  });
}

/**
 * POST — decide a pending customer change request. ACCEPT applies the change
 * to the order; DECLINE leaves the order untouched; COUNTER records an
 * alternative proposal for the customer to accept or decline.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);

    const decision = str(body.decision, "Decision", { required: true, max: 10 });
    if (!DECISIONS.has(decision)) {
      throw new ApiError("Decision must be ACCEPT, DECLINE or COUNTER.", 422);
    }
    const note = optionalStr(body.note, "Note", 1000);

    const request = await db.orderChangeRequest.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orgId: true,
            orderNumber: true,
            organization: { select: { name: true } },
          },
        },
      },
    });
    if (!request) throw new ApiError("Change request not found.", 404);
    if (request.status !== "PENDING") {
      throw new ApiError("This change request has already been decided.", 422);
    }
    const order = request.order;

    if (decision === "ACCEPT") {
      const applied = await applyChangeItems(order.id, order.orgId, parseChangeItems(request.changesJson), {
        id: admin.id,
        name: `${admin.name} (Admin)`,
      });

      const updated = await db.orderChangeRequest.update({
        where: { id: request.id },
        data: {
          status: "ACCEPTED",
          adminId: admin.id,
          adminName: admin.name,
          decisionNote: note ?? null,
          decidedAt: new Date(),
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              organization: { select: { name: true } },
            },
          },
        },
      });

      await notifyCustomer(order.orgId, {
        title: `Change request approved — ${order.orderNumber}`,
        body: `Your requested change was approved and applied.${note ? ` Note: ${note}` : ""} The revision history is preserved on the order page.`,
        kind: "CHANGE",
        view: "order-detail",
        relatedId: order.id,
      });
      await queueEmailForOrg(order.orgId, (recipient) => {
        const content = changeRequestDecisionEmail(order.orderNumber, true, note ?? null);
        return {
          to: recipient.email,
          toName: recipient.name,
          ...content,
          kind: "CHANGE",
          relatedId: order.id,
        };
      });
      await audit(admin, "CHANGE_REQUEST_ACCEPTED", "Order", {
        entityId: order.id,
        detail: applied.summary.join("; ") || undefined,
      });
      return ok(serializeChangeRequest(updated));
    }

    if (decision === "DECLINE") {
      const updated = await db.orderChangeRequest.update({
        where: { id: request.id },
        data: {
          status: "DECLINED",
          adminId: admin.id,
          adminName: admin.name,
          decisionNote: note ?? null,
          decidedAt: new Date(),
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              organization: { select: { name: true } },
            },
          },
        },
      });

      await notifyCustomer(order.orgId, {
        title: `Change request declined — ${order.orderNumber}`,
        body: `Jeffery Group was unable to approve your requested change.${note ? ` Note: ${note}` : ""} Your order is unchanged — you can continue the conversation from the order page.`,
        kind: "CHANGE",
        view: "order-detail",
        relatedId: order.id,
      });
      await queueEmailForOrg(order.orgId, (recipient) => {
        const content = changeRequestDecisionEmail(order.orderNumber, false, note ?? null);
        return {
          to: recipient.email,
          toName: recipient.name,
          ...content,
          kind: "CHANGE",
          relatedId: order.id,
        };
      });
      await audit(admin, "CHANGE_REQUEST_DECLINED", "Order", {
        entityId: order.id,
        detail: note ?? undefined,
      });
      return ok(serializeChangeRequest(updated));
    }

    // COUNTER — propose an alternative; the order is NOT modified yet.
    const counter = parseCounterItems(body.counter);
    const updated = await db.orderChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "COUNTERED",
        adminId: admin.id,
        adminName: admin.name,
        decisionNote: note ?? null,
        decidedAt: new Date(),
        counterJson: JSON.stringify(counter),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            organization: { select: { name: true } },
          },
        },
      },
    });

    await notifyCustomer(order.orgId, {
      title: `Alternative proposed for your change request — ${order.orderNumber}`,
      body: "Jeffery Group proposed an alternative to your requested change. Review it on your order page and accept or decline.",
      kind: "CHANGE",
      view: "order-detail",
      relatedId: order.id,
    });
    await audit(admin, "CHANGE_REQUEST_COUNTERED", "Order", {
      entityId: order.id,
      detail: counter.map((c) => c.kind).join(", "),
    });
    return ok(serializeChangeRequest(updated));
  });
}
