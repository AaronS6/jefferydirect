import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin } from "@/lib/server/api";
import { audit, parseProductInput, queryParam } from "@/lib/server/service";
import { serializeProductDetail } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const search = queryParam(req, "search");
    const category = queryParam(req, "category");

    const products = await db.product.findMany({
      where: {
        ...(category ? { categoryId: category } : {}),
        ...(search ? { OR: [{ sku: { contains: search } }, { name: { contains: search } }] } : {}),
      },
      include: { category: true },
      orderBy: { name: "asc" },
    });

    const [accessRows, priceRows] = await Promise.all([
      db.productAccess.findMany({ select: { productId: true, approved: true } }),
      db.customerPrice.findMany({ select: { productId: true } }),
    ]);
    const approvedByProduct = new Map<string, number>();
    for (const row of accessRows) {
      if (row.approved) approvedByProduct.set(row.productId, (approvedByProduct.get(row.productId) ?? 0) + 1);
    }
    const customByProduct = new Map<string, number>();
    for (const row of priceRows) {
      customByProduct.set(row.productId, (customByProduct.get(row.productId) ?? 0) + 1);
    }

    return ok(
      products.map((p) => ({
        ...serializeProductDetail(p, {
          priceCents: p.defaultPriceCents,
          source: p.defaultPriceCents !== null ? "DEFAULT" : "QUOTE_REQUIRED",
        }),
        defaultPriceCents: p.defaultPriceCents,
        approvedOrgCount: approvedByProduct.get(p.id) ?? 0,
        customPriceCount: customByProduct.get(p.id) ?? 0,
      })),
    );
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();
    const body = await readJson(req);

    const input = parseProductInput(body, "create");

    const skuClash = await db.product.findUnique({ where: { sku: input.sku! } });
    if (skuClash) throw new ApiError("That SKU already exists.", 422);

    const category = await db.category.findUnique({ where: { id: input.categoryId! } });
    if (!category) throw new ApiError("Choose a valid category.", 422);

    const product = await db.product.create({
      data: {
        sku: input.sku!,
        name: input.name!,
        categoryId: input.categoryId!,
        shortDescription: input.shortDescription!,
        description: input.description!,
        material: input.material ?? null,
        dimensions: input.dimensions ?? null,
        colour: input.colour ?? null,
        printingOptions: input.printingOptions ?? null,
        casePack: input.casePack!,
        palletPack: input.palletPack ?? null,
        minOrderQty: input.minOrderQty!,
        increment: input.increment!,
        unit: input.unit ?? "each",
        defaultPriceCents: input.defaultPriceCents ?? null,
        stockStatus: input.stockStatus!,
        leadTimeNote: input.leadTimeNote ?? null,
      },
    });

    await audit({ id: admin.id, name: admin.name }, "PRODUCT_CREATED", "Product", {
      entityId: product.id,
      detail: `${product.sku} — ${product.name}`,
    });

    return ok({ id: product.id });
  });
}
