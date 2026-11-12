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

type UpdateEditData = {
  title?: string;
  category?: string;
  message?: string;
  newStatus?: string | null;
  estimatedDelivery?: Date | null;
  revisedDelivery?: Date | null;
  nextUpdateDate?: Date | null;
  attachmentsJson?: string | null;
  isPublished?: boolean;
  publishedAt?: Date;
};

/**
 * PATCH — edit an update. Drafts are fully editable; published updates may
 * edit title/category/message/attachments/dates (their status change is
 * fixed). Passing `publish: true` on a draft publishes it and applies the
 * same side effects as creating a published update (status/dates onto the
 * order, customer notification, email, audit).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id, updateId } = await params;
    const body = await readJson(req);

    const update = await db.orderUpdate.findFirst({ where: { id: updateId, orderId: id } });
    if (!update) throw new ApiError("Update not found.", 404);

    const title = str(body.title, "Title", { max: 160 });
    const category = str(body.category, "Category", { max: 40 });
    if (category && !UPDATE_CATEGORY_SET.has(category)) {
      throw new ApiError("Invalid update category.", 422);
    }
    const message = str(body.message, "Message", { max: 4000 });
    const newStatus = str(body.newStatus, "New status", { max: 30 });
    if (newStatus && !ORDER_STATUS_SET.has(newStatus)) throw new ApiError("Invalid order status.", 422);
    const estimatedDelivery = optionalDate(body.estimatedDelivery, "Estimated delivery");
    const revisedDelivery = optionalDate(body.revisedDelivery, "Revised delivery");
    const nextUpdateDate = optionalDate(body.nextUpdateDate, "Next update date");
    const attachmentsProvided = body.attachments !== undefined;
    const attachments = parseAttachmentInputs(body.attachments);
    const publish = body.publish === true;

    const hasEdits =
      !!title ||
      !!category ||
      !!message ||
      body.newStatus !== undefined ||
      attachmentsProvided ||
      estimatedDelivery !== undefined ||
      revisedDelivery !== undefined ||
      nextUpdateDate !== undefined;
    if (!hasEdits && !publish) throw new ApiError("No changes provided.", 422);

    // The status change of a published update has already been applied.
    if (update.isPublished && newStatus) {
      throw new ApiError("The status change of a published update cannot be edited.", 422);
    }

    const data: UpdateEditData = {};
    if (title) data.title = title;
    if (category) data.category = category;
    if (message) data.message = message;
    if (body.newStatus !== undefined) data.newStatus = newStatus || null;
    if (estimatedDelivery !== undefined) data.estimatedDelivery = estimatedDelivery;
    if (revisedDelivery !== undefined) data.revisedDelivery = revisedDelivery;
    if (nextUpdateDate !== undefined) data.nextUpdateDate = nextUpdateDate;
    if (attachmentsProvided) {
      data.attachmentsJson = attachments.length ? JSON.stringify(attachments) : null;
    }

    const publishing = publish && !update.isPublished;
    if (publishing) {
      data.isPublished = true;
      data.publishedAt = new Date();
    }

    let updated = update;
    if (Object.keys(data).length > 0) {
      updated = await db.orderUpdate.update({ where: { id: update.id }, data });
    }

    if (publishing) {
      const order = await db.order.findUnique({
        where: { id },
        include: { organization: { select: { name: true } } },
      });
      if (!order) throw new ApiError("Order not found.", 404);

      // Final values after this edit — publishing applies them.
      const finalTitle = data.title ?? update.title;
      const finalMessage = data.message ?? update.message;
      const finalNewStatus = data.newStatus !== undefined ? data.newStatus : update.newStatus;
      const finalEstimated =
        data.estimatedDelivery !== undefined ? data.estimatedDelivery : update.estimatedDelivery;
      const finalRevised =
        data.revisedDelivery !== undefined ? data.revisedDelivery : update.revisedDelivery;
      const finalNext =
        data.nextUpdateDate !== undefined ? data.nextUpdateDate : update.nextUpdateDate;

      const appliedStatus = finalNewStatus && finalNewStatus !== order.status ? finalNewStatus : null;
      const orderData: {
        status?: string;
        estimatedDelivery?: Date | null;
        revisedDeliveryDate?: Date | null;
        nextUpdateDate?: Date | null;
      } = {};
      if (appliedStatus) orderData.status = appliedStatus;
      if (finalEstimated) orderData.estimatedDelivery = finalEstimated;
      if (finalRevised) orderData.revisedDeliveryDate = finalRevised;
      if (finalNext) orderData.nextUpdateDate = finalNext;
      if (Object.keys(orderData).length > 0) {
        await db.order.update({ where: { id: order.id }, data: orderData });
        if (appliedStatus) {
          await db.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: appliedStatus,
              note: finalTitle,
              byUserId: admin.id,
              byName: `${admin.name} (Admin)`,
            },
          });
        }
      }

      const excerpt =
        finalMessage.length > 160 ? `${finalMessage.slice(0, 160)}…` : finalMessage;
      await notifyCustomer(order.orgId, {
        title: `${finalTitle} — ${order.orderNumber}`,
        body: `${excerpt} See the full update on your order page.`,
        kind: "UPDATE",
        view: "order-detail",
        relatedId: order.id,
      });
      await queueEmailForOrg(order.orgId, (recipient) => {
        const content = orderUpdateEmail(
          order.organization.name,
          order.orderNumber,
          finalTitle,
          finalMessage,
          finalEstimated ?? finalRevised ?? null,
        );
        return {
          to: recipient.email,
          toName: recipient.name,
          ...content,
          kind: "UPDATE",
          relatedId: order.id,
        };
      });
      await audit(admin, "ORDER_UPDATE_PUBLISHED", "Order", { entityId: order.id, detail: finalTitle });
    }

    const fieldEdited = Object.keys(data).some((k) => k !== "isPublished" && k !== "publishedAt");
    if (fieldEdited) {
      await audit(admin, "ORDER_UPDATE_EDITED", "Order", { entityId: id, detail: updated.title });
    }

    return ok(serializeOrderUpdate(updated));
  });
}

/** DELETE — drafts only; published updates are part of the customer record. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id, updateId } = await params;

    const update = await db.orderUpdate.findFirst({ where: { id: updateId, orderId: id } });
    if (!update) throw new ApiError("Update not found.", 404);
    if (update.isPublished) {
      throw new ApiError("Published updates are retained permanently.", 422);
    }

    await db.orderUpdate.delete({ where: { id: update.id } });
    await audit(admin, "ORDER_UPDATE_DELETED", "Order", { entityId: id, detail: update.title });
    return ok({ ok: true });
  });
}
