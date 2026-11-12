import { db } from "@/lib/db";
import { handler, ok, requireAdmin } from "@/lib/server/api";
import { queryParam } from "@/lib/server/service";
import type { SearchResultsDto } from "@/types";

const EMPTY: SearchResultsDto = {
  orders: [],
  quotes: [],
  customers: [],
  products: [],
  users: [],
  messages: [],
  changeRequests: [],
};

/**
 * GET /api/admin/search?q= — cross-entity search. SQLite `contains` is
 * case-sensitive, so queries narrow with a raw contains and every set is
 * re-filtered case-insensitively in JS.
 */
export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const q = queryParam(req, "q");
    if (q.length < 2) return ok(EMPTY);
    const ql = q.toLowerCase();

    const [orderRows, quoteRows, orgRows, productRows, userRows, messageRows, changeRows] = await Promise.all([
      db.order.findMany({
        where: { orderNumber: { contains: q } },
        include: { organization: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.quotation.findMany({
        where: { OR: [{ quoteNumber: { contains: q } }, { title: { contains: q } }, { productName: { contains: q } }] },
        include: { organization: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      db.organization.findMany({
        select: { id: true, code: true, name: true, status: true },
        take: 200,
      }),
      db.product.findMany({
        where: { OR: [{ sku: { contains: q } }, { name: { contains: q } }] },
        select: { id: true, sku: true, name: true, isActive: true },
        take: 200,
      }),
      db.user.findMany({
        select: { id: true, name: true, email: true, orgId: true, organization: { select: { name: true } } },
        take: 300,
      }),
      db.message.findMany({
        where: { subject: { contains: q } },
        select: {
          id: true,
          subject: true,
          status: true,
          orderId: true,
          organization: { select: { name: true } },
        },
        take: 200,
      }),
      db.orderChangeRequest.findMany({
        where: { status: "PENDING" },
        include: {
          order: { select: { orderNumber: true, organization: { select: { name: true } } } },
        },
        take: 200,
      }),
    ]);

    const dto: SearchResultsDto = {
      orders: orderRows
        .filter((o) => o.orderNumber.toLowerCase().includes(ql))
        .slice(0, 8)
        .map((o) => ({ id: o.id, orderNumber: o.orderNumber, orgName: o.organization.name, status: o.status })),
      quotes: quoteRows
        .filter(
          (q2) =>
            q2.quoteNumber.toLowerCase().includes(ql) ||
            q2.title.toLowerCase().includes(ql) ||
            (q2.productName ?? "").toLowerCase().includes(ql),
        )
        .slice(0, 8)
        .map((q2) => ({
          id: q2.id,
          quoteNumber: q2.quoteNumber,
          title: q2.title,
          orgName: q2.organization.name,
          status: q2.status,
        })),
      customers: orgRows
        .filter((o) => o.name.toLowerCase().includes(ql) || o.code.toLowerCase().includes(ql))
        .slice(0, 8)
        .map((o) => ({ id: o.id, code: o.code, name: o.name, status: o.status })),
      products: productRows
        .filter((p) => p.sku.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql))
        .slice(0, 8)
        .map((p) => ({ id: p.id, sku: p.sku, name: p.name, isActive: p.isActive })),
      users: userRows
        .filter((u) => u.name.toLowerCase().includes(ql) || u.email.toLowerCase().includes(ql))
        .slice(0, 8)
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          orgName: u.organization ? u.organization.name : null,
          orgId: u.orgId,
        })),
      messages: messageRows
        .filter((m) => m.subject.toLowerCase().includes(ql))
        .slice(0, 8)
        .map((m) => ({
          id: m.id,
          subject: m.subject,
          orgName: m.organization.name,
          status: m.status,
          orderId: m.orderId,
        })),
      changeRequests: changeRows
        .filter(
          (c) =>
            c.order.orderNumber.toLowerCase().includes(ql) ||
            c.order.organization.name.toLowerCase().includes(ql),
        )
        .slice(0, 8)
        .map((c) => ({
          id: c.id,
          orderId: c.orderId,
          orderNumber: c.order.orderNumber,
          orgName: c.order.organization.name,
          status: c.status,
        })),
    };
    return ok(dto);
  });
}
