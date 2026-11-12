import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { audit } from "@/lib/server/service";
import { serializeInternalNote } from "@/lib/server/serialize";

/**
 * POST — add an internal administrative note to an order. Internal notes are
 * never exposed through customer-facing endpoints.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);

    const note = str(body.body, "Note", { required: true, max: 4000 });

    const order = await db.order.findUnique({ where: { id }, select: { id: true } });
    if (!order) throw new ApiError("Order not found.", 404);

    const created = await db.orderInternalNote.create({
      data: {
        orderId: order.id,
        authorId: admin.id,
        authorName: admin.name,
        body: note,
      },
    });

    const preview = note.length > 120 ? `${note.slice(0, 117)}...` : note;
    await audit(admin, "ORDER_INTERNAL_NOTE", "Order", { entityId: order.id, detail: preview });

    return ok(serializeInternalNote(created));
  });
}
