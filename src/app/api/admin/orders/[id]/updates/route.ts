import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { UPDATE_CATEGORIES } from "@/lib/constants";
import { ORDER_STATUS_SET, audit, notifyCustomer, optionalDate } from "@/lib/server/service";
import { orderUpdateEmail, queueEmailForOrg } from "@/lib/server/email";
import { serializeOrderUpdate } from "@/lib/server/serialize";
import type { AttachmentMeta } from "@/types";

const UPDATE_CATEGORY_SET = new Set<string>(UPDATE_CATEGORIES);

/** Validate the attachment metadata list for an update (max 10 entries). */
function parseAttachmentInputs(v: unknown): AttachmentMeta[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ApiError("Attachments must be a list.", 422);
  if (v.length > 10) throw new ApiError("An update can include at most 10 attachments.", 422);
  return v.map((raw, i) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ApiError(`Attachment ${i + 1} is invalid.`, 422);
    }
    const rec = raw as Record<string, unknown>;
    const name = str(rec.name, `Attachment ${i + 1} name`, { required: true, max: 160 });
    const sizeLabel = str(rec.sizeLabel, `Attachment ${i + 1} size`, { max: 24 }) || "—";
    const note = str(rec.note, `Attachment ${i + 1} note`, { max: 500 });
    return note ? { name, sizeLabel, note } : { name, sizeLabel };
  });
}

/** GET — every update on this order, drafts included, newest first. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { id } = await params;

    const order = await db.order.findUnique({ where: { id }, select: { id: true } });
    if (!order) throw new ApiError("Order not found.", 404);

    const updates = await db.orderUpdate.findMany({ where: { orderId: order.id } });
    const newestFirst = [...updates].sort((a, b) => {
      const at = (u: { publishedAt: Date | null; createdAt: Date }) =>
        (u.publishedAt ?? u.createdAt).getTime();
      return at(b) - at(a);
    });
    return ok(newestFirst.map(serializeOrderUpdate));
  });
}

/**
 * POST — create an update. Default is a draft (isPublished false) visible to
 * admins only; `publish: true` also applies the communicated status/dates to
 * the order and notifies the customer in-app and by email.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);

    const title = str(body.title, "Title", { required: true, max: 160 });
    const category = str(body.category, "Category", { required: true, max: 40 });
    if (!UPDATE_CATEGORY_SET.has(category)) throw new ApiError("Invalid update category.", 422);
    const message = str(body.message, "Message", { required: true, max: 4000 });
    const newStatus = str(body.newStatus, "New status", { max: 30 });
    if (newStatus && !ORDER_STATUS_SET.has(newStatus)) throw new ApiError("Invalid order status.", 422);
    const estimatedDelivery = optionalDate(body.estimatedDelivery, "Estimated delivery");
    const revisedDelivery = optionalDate(body.revisedDelivery, "Revised delivery");
    const nextUpdateDate = optionalDate(body.nextUpdateDate, "Next update date");
    const attachments = parseAttachmentInputs(body.attachments);
    const publish = body.publish === true;
    // templateId is accepted for authoring traceability; rendering is client-side.
    str(body.templateId, "Template", { max: 40 });

    const order = await db.order.findUnique({
      where: { id },
      include: { organization: { select: { name: true } } },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    const update = await db.orderUpdate.create({
      data: {
        orderId: order.id,
        authorId: admin.id,
        authorName: admin.name,
        title,
        category,
        message,
        newStatus: newStatus || null,
        estimatedDelivery: estimatedDelivery ?? null,
        revisedDelivery: revisedDelivery ?? null,
        nextUpdateDate: nextUpdateDate ?? null,
        attachmentsJson: attachments.length ? JSON.stringify(attachments) : null,
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
      },
    });

    if (publish) {
      const appliedStatus = newStatus && newStatus !== order.status ? newStatus : null;
      const orderData: {
        status?: string;
        estimatedDelivery?: Date | null;
        revisedDeliveryDate?: Date | null;
        nextUpdateDate?: Date | null;
      } = {};
      if (appliedStatus) orderData.status = appliedStatus;
      if (estimatedDelivery !== undefined) orderData.estimatedDelivery = estimatedDelivery;
      if (revisedDelivery !== undefined) orderData.revisedDeliveryDate = revisedDelivery;
      if (nextUpdateDate !== undefined) orderData.nextUpdateDate = nextUpdateDate;
      if (Object.keys(orderData).length > 0) {
        await db.order.update({ where: { id: order.id }, data: orderData });
        if (appliedStatus) {
          await db.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: appliedStatus,
              note: title,
              byUserId: admin.id,
              byName: `${admin.name} (Admin)`,
            },
          });
        }
      }

      const excerpt = message.length > 160 ? `${message.slice(0, 160)}…` : message;
      await notifyCustomer(order.orgId, {
        title: `${title} — ${order.orderNumber}`,
        body: `${excerpt} See the full update on your order page.`,
        kind: "UPDATE",
        view: "order-detail",
        relatedId: order.id,
      });
      await queueEmailForOrg(order.orgId, (recipient) => {
        const content = orderUpdateEmail(
          order.organization.name,
          order.orderNumber,
          title,
          message,
          estimatedDelivery ?? revisedDelivery ?? null,
        );
        return {
          to: recipient.email,
          toName: recipient.name,
          ...content,
          kind: "UPDATE",
          relatedId: order.id,
        };
      });
      await audit(admin, "ORDER_UPDATE_PUBLISHED", "Order", { entityId: order.id, detail: title });
    }

    return ok(serializeOrderUpdate(update));
  });
}
