import { db } from "@/lib/db";
import { ApiError, handler, ok, requireAdmin } from "@/lib/server/api";
import { serializeOrderDetail } from "@/lib/server/serialize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: true,
        history: true,
        documents: { include: { quotation: { select: { quoteNumber: true } } } },
        organization: true,
        user: { select: { name: true } },
        updates: true,
        changeRequests: { include: { order: { select: { id: true, orderNumber: true } } } },
        internalNotes: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    // Admin view: updates include drafts; internal notes are never sent to
    // customer-facing endpoints.
    return ok(serializeOrderDetail(order, { includeInternal: true }));
  });
}
