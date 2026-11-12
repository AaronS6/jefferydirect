import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { MESSAGE_CATEGORIES } from "@/lib/constants";
import { notifyAdmin, queryParam, requireOrgWrite } from "@/lib/server/service";
import { serializeMessage } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const status = queryParam(req, "status");

    const messages = await db.message.findMany({
      where: { orgId: user.orgId, ...(status ? { status } : {}) },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    // Message rows store orderId without a relation — resolve numbers here,
    // scoped to this org.
    const orderIds = messages
      .map((m) => m.orderId)
      .filter((oid): oid is string => oid !== null);
    const orders = orderIds.length
      ? await db.order.findMany({
          where: { id: { in: orderIds }, orgId: user.orgId },
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

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    // Read-only portal users can review, but not correspond.
    requireOrgWrite(user);
    const orgId = user.orgId;

    const body = await readJson(req);
    const subject = str(body.subject, "Subject", { required: true, max: 160 });
    const category = str(body.category, "Category", { required: true, max: 20 });
    if (!MESSAGE_CATEGORIES.includes(category as (typeof MESSAGE_CATEGORIES)[number])) {
      throw new ApiError("Choose a valid message category.", 422);
    }
    const messageBody = str(body.body, "Message", { required: true, max: 4000 });
    const orderId = str(body.orderId, "Order", { max: 40 });
    const quotationId = str(body.quotationId, "Quotation", { max: 40 });

    // Referenced records must belong to this org.
    if (orderId) {
      const order = await db.order.findFirst({ where: { id: orderId, orgId }, select: { id: true } });
      if (!order) throw new ApiError("Referenced order not found.", 404);
    }
    if (quotationId) {
      const quotation = await db.quotation.findFirst({
        where: { id: quotationId, orgId },
        select: { id: true },
      });
      if (!quotation) throw new ApiError("Referenced quotation not found.", 404);
    }

    const message = await db.message.create({
      data: {
        orgId,
        userId: user.id,
        subject,
        category,
        orderId: orderId || null,
        quotationId: quotationId || null,
        body: messageBody,
        status: "OPEN",
      },
    });

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    await notifyAdmin({
      title: `Message received — ${org?.name ?? "Customer"}`,
      body: `${user.name}: ${subject}`,
      kind: "MESSAGE",
      view: "admin-messages",
      relatedId: message.id,
    });

    return ok({ id: message.id });
  });
}
