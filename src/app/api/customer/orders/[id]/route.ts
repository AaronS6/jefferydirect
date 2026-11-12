import { db } from "@/lib/db";
import { ApiError, handler, ok, requireCustomer } from "@/lib/server/api";
import { serializeOrderDetail } from "@/lib/server/serialize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    const { id } = await params;

    // orgId in the where clause — another org's order is simply "not found".
    // Customers see published updates only (unpublished rows are admin drafts)
    // and their own change requests' full history; internal notes are never
    // fetched here at all.
    const order = await db.order.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        items: true,
        history: true,
        documents: { include: { quotation: { select: { quoteNumber: true } } } },
        organization: true,
        user: { select: { name: true } },
        updates: { where: { isPublished: true } },
        changeRequests: true,
      },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    return ok(serializeOrderDetail(order));
  });
}
