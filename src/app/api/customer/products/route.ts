import { db } from "@/lib/db";
import { handler, ok, requireCustomer } from "@/lib/server/api";
import { customerPriceMap, queryParam, resolveEffectivePrice } from "@/lib/server/service";
import { serializeProduct, type ProductRow } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const orgId = user.orgId;

    const search = queryParam(req, "search");
    const category = queryParam(req, "category");
    const sort = queryParam(req, "sort") || "name";

    const products: ProductRow[] = await db.product.findMany({
      where: {
        isActive: true,
        access: { some: { orgId, approved: true } },
        ...(category ? { categoryId: category } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { shortDescription: { contains: search } },
              ],
            }
          : {}),
      },
      include: { category: true },
    });

    const prices = await customerPriceMap(orgId);
    const rows = products.map((p) => ({
      product: p,
      dto: serializeProduct(p, resolveEffectivePrice(p.defaultPriceCents, prices.get(p.id) ?? null)),
    }));

    const collator = new Intl.Collator("en-CA", { numeric: true });
    switch (sort) {
      case "sku":
        rows.sort((a, b) => collator.compare(a.dto.sku, b.dto.sku));
        break;
      case "price_asc":
        rows.sort((a, b) => (a.dto.priceCents ?? Infinity) - (b.dto.priceCents ?? Infinity));
        break;
      case "price_desc":
        rows.sort((a, b) => (b.dto.priceCents ?? -Infinity) - (a.dto.priceCents ?? -Infinity));
        break;
      case "newest":
        rows.sort((a, b) => b.product.createdAt.getTime() - a.product.createdAt.getTime());
        break;
      default:
        rows.sort((a, b) => collator.compare(a.dto.name, b.dto.name));
    }

    return ok(rows.map((r) => r.dto));
  });
}
