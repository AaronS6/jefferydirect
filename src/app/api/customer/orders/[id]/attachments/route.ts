import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer } from "@/lib/server/api";
import { audit, notifyAdmin, requireOrgWrite } from "@/lib/server/service";
import { parseAttachmentMetas } from "../../../_validation";

/**
 * POST /api/customer/orders/:id/attachments — register additional file
 * references against an order (metadata only — name, size, optional note).
 * One notification for the batch, one audit entry for the batch.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    const body = await readJson(req);
    const attachments = parseAttachmentMetas(body.attachments, "Attachments", 10);
    if (attachments.length === 0) {
      throw new ApiError("Choose at least one attachment reference to add.", 422);
    }

    // orgId in the where clause — another org's order is "not found".
    const order = await db.order.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, orderNumber: true },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    await db.document.createMany({
      data: attachments.map((a) => ({
        orgId: user.orgId,
        orderId: order.id,
        category: "OTHER",
        title: a.name,
        description: a.note ?? null,
        fileName: a.name,
        sizeLabel: a.sizeLabel,
        uploadedBy: user.name,
      })),
    });

    await notifyAdmin({
      title: `Order attachments added — ${order.orderNumber}`,
      body: `${user.name} added ${attachments.length} attachment reference${attachments.length === 1 ? "" : "s"} to ${order.orderNumber}.`,
      kind: "DOCUMENT",
      view: "admin-order-detail",
      relatedId: order.id,
    });
    await audit(user, "DOCUMENT_UPLOADED", "Document", {
      entityId: order.id,
      detail: `${attachments.length} attachment reference(s) added to ${order.orderNumber} by customer`,
    });

    return ok({ count: attachments.length });
  });
}
