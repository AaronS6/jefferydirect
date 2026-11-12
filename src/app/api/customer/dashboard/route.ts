import { db } from "@/lib/db";
import { handler, ok, requireCustomer } from "@/lib/server/api";
import { ORDER_TERMINAL_STATUSES } from "@/lib/constants";
import {
  customerPriceMap,
  resolveEffectivePrice,
} from "@/lib/server/service";
import { serializeOrderListItem } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    const user = await requireCustomer();
    const orgId = user.orgId;

    const [
      activeOrders,
      pendingQuotes,
      outstandingInvoices,
      openMessages,
      recentOrders,
      notifications,
      nextUpdateOrders,
      latestUpdates,
    ] = await Promise.all([
      db.order.count({ where: { orgId, status: { notIn: ORDER_TERMINAL_STATUSES } } }),
      db.quotation.count({
        where: { orgId, status: { in: ["REQUESTED", "UNDER_REVIEW", "ISSUED", "REVISED"] } },
      }),
      db.document.count({ where: { orgId, category: "INVOICE" } }),
      db.message.count({ where: { orgId, status: "OPEN" } }),
      db.order.findMany({
        where: { orgId },
        include: { items: true, organization: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.notification.findMany({
        where: { audience: "CUSTOMER", orgId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      // Update Centre — when the customer should next hear from us.
      db.order.findMany({
        where: { orgId, status: { notIn: ORDER_TERMINAL_STATUSES }, nextUpdateDate: { not: null } },
        orderBy: { nextUpdateDate: "asc" },
        take: 5,
        select: { id: true, orderNumber: true, status: true, nextUpdateDate: true },
      }),
      // Update Centre — the most recent published progress updates.
      db.orderUpdate.findMany({
        where: { isPublished: true, order: { orgId } },
        include: { order: { select: { id: true, orderNumber: true } } },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
    ]);

    // Frequently ordered products — from this org's order history, newest first.
    const orderRows = await db.order.findMany({
      where: { orgId },
      select: { orderNumber: true, createdAt: true, items: { select: { productId: true, qty: true } } },
      orderBy: { createdAt: "desc" },
    });
    const stats = new Map<
      string,
      { count: number; lastQty: number; lastOrderDate: Date; lastOrderNumber: string }
    >();
    for (const order of orderRows) {
      const seen = new Set<string>();
      for (const item of order.items) {
        if (!item.productId || seen.has(item.productId)) continue;
        seen.add(item.productId);
        const existing = stats.get(item.productId);
        if (!existing) {
          // Orders iterate newest-first, so the first sighting is the latest order.
          stats.set(item.productId, {
            count: 1,
            lastQty: item.qty,
            lastOrderDate: order.createdAt,
            lastOrderNumber: order.orderNumber,
          });
        } else {
          existing.count += 1;
        }
      }
    }
    const topIds = [...stats.entries()]
      .sort(
        (a, b) =>
          b[1].count - a[1].count ||
          b[1].lastOrderDate.getTime() - a[1].lastOrderDate.getTime(),
      )
      .slice(0, 5)
      .map(([id]) => id);

    const frequentlyOrdered: {
      productId: string;
      sku: string;
      name: string;
      lastQty: number;
      lastOrderDate: string;
      lastOrderNumber: string;
      priceCents: number | null;
      stockStatus: string;
    }[] = [];
    if (topIds.length > 0) {
      // Only products that remain active AND approved for this org are listed.
      const products = await db.product.findMany({
        where: {
          id: { in: topIds },
          isActive: true,
          access: { some: { orgId, approved: true } },
        },
      });
      const prices = await customerPriceMap(orgId);
      const byId = new Map(products.map((p) => [p.id, p]));
      for (const pid of topIds) {
        const product = byId.get(pid);
        const stat = stats.get(pid);
        if (!product || !stat) continue;
        const eff = resolveEffectivePrice(product.defaultPriceCents, prices.get(pid) ?? null);
        frequentlyOrdered.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          lastQty: stat.lastQty,
          lastOrderDate: stat.lastOrderDate.toISOString(),
          lastOrderNumber: stat.lastOrderNumber,
          priceCents: eff.priceCents,
          stockStatus: product.stockStatus,
        });
      }
    }

    // nextUpdateDate is guaranteed non-null by the where clause.
    const expected = nextUpdateOrders.filter(
      (o): o is { id: string; orderNumber: string; status: string; nextUpdateDate: Date } =>
        o.nextUpdateDate !== null,
    );

    return ok({
      activeOrders,
      pendingQuotes,
      outstandingInvoices,
      openMessages,
      recentOrders: recentOrders.map(serializeOrderListItem),
      frequentlyOrdered,
      activity: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        detail: n.body,
        kind: n.kind,
        createdAt: n.createdAt.toISOString(),
      })),
      nextExpectedUpdates: expected.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        nextUpdateDate: o.nextUpdateDate.toISOString(),
      })),
      latestUpdates: latestUpdates.map((u) => ({
        id: u.id,
        orderId: u.order.id,
        orderNumber: u.order.orderNumber,
        title: u.title,
        category: u.category,
        publishedAt: (u.publishedAt ?? u.createdAt).toISOString(),
      })),
    });
  });
}
