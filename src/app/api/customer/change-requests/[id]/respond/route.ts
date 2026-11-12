import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { applyChangeItems, notifyAdmin, requireOrgWrite } from "@/lib/server/service";
import { parseChangeItems, serializeChangeRequest } from "@/lib/server/serialize";

/**
 * POST /api/customer/change-requests/:id/respond — the customer's move.
 * WITHDRAW takes back a pending request; ACCEPT applies the administrator's
 * counter-proposal to the order; DECLINE rejects it. Nothing else is mutable
 * from the customer side.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    const body = await readJson(req);
    const action = str(body.action, "Action", { required: true, max: 16 });
    if (action !== "ACCEPT" && action !== "DECLINE" && action !== "WITHDRAW") {
      throw new ApiError("Action must be ACCEPT, DECLINE or WITHDRAW.", 422);
    }

    // request.order.orgId must match — another org's request is "not found".
    const request = await db.orderChangeRequest.findFirst({
      where: { id },
      include: { order: true },
    });
    if (!request || request.order.orgId !== user.orgId) {
      throw new ApiError("Change request not found.", 404);
    }
    const order = request.order;
    const withOrder = <T extends object>(row: T) => ({
      ...row,
      order: { id: order.id, orderNumber: order.orderNumber },
    });

    if (action === "WITHDRAW") {
      if (request.status !== "PENDING") {
        throw new ApiError("Only a change request still awaiting review can be withdrawn.", 422);
      }
      const updated = await db.orderChangeRequest.update({
        where: { id: request.id },
        data: { status: "WITHDRAWN" },
      });
      await notifyAdmin({
        title: `Change request withdrawn — ${order.orderNumber}`,
        body: `${user.name} withdrew their change request. The order stays exactly as it is.`,
        kind: "CHANGE",
        view: "admin-order-detail",
        relatedId: order.id,
      });
      return ok(serializeChangeRequest(withOrder(updated)));
    }

    if (action === "ACCEPT") {
      if (request.status !== "COUNTERED") {
        throw new ApiError("There is no alternative proposal awaiting your response.", 422);
      }
      // Apply the administrator's counter items — the submitted request row
      // (with the pre-change values) remains the preserved record.
      await applyChangeItems(order.id, order.orgId, parseChangeItems(request.counterJson), {
        id: user.id,
        name: `${user.name} (accepted alternative)`,
      });
      const updated = await db.orderChangeRequest.update({
        where: { id: request.id },
        data: { status: "ACCEPTED", counterDecision: "ACCEPTED", counterDecidedAt: new Date() },
      });
      await notifyAdmin({
        title: `Counter-proposal accepted — ${order.orderNumber}`,
        body: `${user.name} accepted the proposed alternative and it has been applied.`,
        kind: "CHANGE",
        view: "admin-order-detail",
        relatedId: order.id,
      });
      return ok(serializeChangeRequest(withOrder(updated)));
    }

    // DECLINE
    if (request.status !== "COUNTERED") {
      throw new ApiError("There is no alternative proposal awaiting your response.", 422);
    }
    const updated = await db.orderChangeRequest.update({
      where: { id: request.id },
      data: { status: "DECLINED", counterDecision: "DECLINED", counterDecidedAt: new Date() },
    });
    await notifyAdmin({
      title: `Counter-proposal declined — ${order.orderNumber}`,
      body: `${user.name} declined the proposed alternative. The order stays as it stands.`,
      kind: "CHANGE",
      view: "admin-order-detail",
      relatedId: order.id,
    });
    return ok(serializeChangeRequest(withOrder(updated)));
  });
}
