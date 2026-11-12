import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { formatCents } from "@/lib/money";
import { audit, queryParam } from "@/lib/server/service";

export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const orgId = queryParam(req, "orgId");
    if (!orgId) throw new ApiError("Choose a customer to view pricing.", 422);

    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new ApiError("Customer not found.", 404);

    const [products, prices, access] = await Promise.all([
      db.product.findMany({
        where: { isActive: true },
        include: { category: true },
        orderBy: { name: "asc" },
      }),
      db.customerPrice.findMany({ where: { orgId } }),
      db.productAccess.findMany({ where: { orgId } }),
    ]);
    const priceByProduct = new Map(prices.map((p) => [p.productId, p]));
    const approvedSet = new Set(access.filter((a) => a.approved).map((a) => a.productId));

    return ok(
      products.map((p) => {
        const custom = priceByProduct.get(p.id);
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          categoryName: p.category.name,
          defaultPriceCents: p.defaultPriceCents,
          customPriceCents: custom?.priceCents ?? null,
          note: custom?.note ?? null,
          approved: approvedSet.has(p.id),
        };
      }),
    );
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();

    const body = await readJson(req);
    const orgId = str(body.orgId, "Customer", { required: true, max: 40 });
    const productId = str(body.productId, "Product", { required: true, max: 40 });
    const rawPrice: unknown = body.priceCents;
    const note = str(body.note, "Note", { max: 240 });

    const [org, product] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId } }),
      db.product.findUnique({ where: { id: productId } }),
    ]);
    if (!org) throw new ApiError("Customer not found.", 404);
    if (!product) throw new ApiError("Product not found.", 404);

    if (rawPrice === null) {
      // Remove the custom price — the org falls back to the default price.
      await db.customerPrice.deleteMany({ where: { orgId, productId } });
      await audit({ id: admin.id, name: admin.name }, "PRICE_UPDATED", "CustomerPrice", {
        entityId: productId,
        detail: `${org.name} — ${product.sku} custom price removed (default ${formatCents(product.defaultPriceCents ?? 0)})`,
      });
    } else {
      const priceCents = wholeCents(rawPrice);
      await db.customerPrice.upsert({
        where: { orgId_productId: { orgId, productId } },
        create: { orgId, productId, priceCents, note: note || null },
        update: { priceCents, note: note || null },
      });
      await audit({ id: admin.id, name: admin.name }, "PRICE_UPDATED", "CustomerPrice", {
        entityId: productId,
        detail: `${org.name} — ${product.sku} set to ${formatCents(priceCents)}`,
      });
    }

    return ok({ ok: true });
  });
}

function wholeCents(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new ApiError("Price must be whole cents (a non-negative whole number).", 422);
  }
  return n;
}
