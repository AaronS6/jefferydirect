import { db } from "@/lib/db";
import type { Product } from "@prisma/client";
import { ApiError, handler, ok, requireCustomer } from "@/lib/server/api";
import { approvedProductIds, customerPriceMap, resolveEffectivePrice } from "@/lib/server/service";
import type { OrderDraftLine } from "@/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    const { id } = await params;

    const order = await db.order.findFirst({
      where: { id, orgId: user.orgId },
      include: { items: true },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    const productIds = order.items
      .map((i) => i.productId)
      .filter((pid): pid is string => pid !== null);
    const products: Product[] = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } } })
      : [];
    const [prices, approvedIds] = await Promise.all([
      customerPriceMap(user.orgId),
      approvedProductIds(user.orgId),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));

    const lines: OrderDraftLine[] = order.items.map((item) => {
      const product = item.productId ? productById.get(item.productId) : undefined;
      if (!product) {
        return {
          productId: item.productId ?? "",
          sku: item.sku,
          name: item.name,
          unitPriceCents: item.unitPriceCents,
          qty: item.qty,
          minOrderQty: 1,
          increment: 1,
          casePack: 1,
          unit: "each",
          unavailable: true,
          note: "This line is not linked to a current catalogue product — request a new quotation if you need it again.",
        };
      }
      const eff = resolveEffectivePrice(
        product.defaultPriceCents,
        prices.get(product.id) ?? null,
      );
      const notAvailable = !product.isActive || !approvedIds.has(product.id);
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unitPriceCents: eff.priceCents ?? 0,
        qty: item.qty,
        minOrderQty: product.minOrderQty,
        increment: product.increment,
        casePack: product.casePack,
        unit: product.unit,
        unavailable: notAvailable || eff.priceCents === null,
        note: notAvailable
          ? "This product is no longer available to your account."
          : eff.priceCents === null
            ? "Current pricing requires a quotation."
            : undefined,
      };
    });

    return ok({ sourceOrderNumber: order.orderNumber, lines });
  });
}
