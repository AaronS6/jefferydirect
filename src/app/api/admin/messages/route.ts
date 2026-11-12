import { db } from "@/lib/db";
import { handler, ok, requireAdmin } from "@/lib/server/api";
import { queryParam } from "@/lib/server/service";
import { serializeMessage } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();
    const status = queryParam(req, "status");

    const messages = await db.message.findMany({
      where: status ? { status } : {},
      include: { user: true, organization: true },
      orderBy: { createdAt: "desc" },
    });

    // Message rows store orderId without a relation — resolve numbers here.
    const orderIds = messages
      .map((m) => m.orderId)
      .filter((oid): oid is string => oid !== null);
    const orders = orderIds.length
      ? await db.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, orderNumber: true },
        })
      : [];
    const orderNumberById = new Map(orders.map((o) => [o.id, o.orderNumber]));

    return ok(
      messages.map((m) =>
        serializeMessage({
          ...m,
          order: m.orderId && orderNumberById.has(m.orderId)
            ? { orderNumber: orderNumberById.get(m.orderId)! }
            : null,
        }),
      ),
    );
  });
}
