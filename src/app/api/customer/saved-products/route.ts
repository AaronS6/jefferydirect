import { db } from "@/lib/db";
import type { Product, SavedProduct } from "@prisma/client";
import { ApiError, handler, int, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import {
  approvedProductIds,
  customerPriceMap,
  optionalStr,
  requireOrgWrite,
  resolveEffectivePrice,
} from "@/lib/server/service";
import { serializeSavedProduct } from "@/lib/server/serialize";
import type { SavedProductDto } from "@/types";

/** GET /api/customer/saved-products — this user's quick-reorder list. */
export async function GET() {
  return handler(async () => {
    const user = await requireCustomer();
    const rows = await db.savedProduct.findMany({
      where: { userId: user.id },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    const [prices, approvedIds] = await Promise.all([
      customerPriceMap(user.orgId),
      approvedProductIds(user.orgId),
    ]);
    const serialized: SavedProductDto[] = rows.map((row) => {
      const eff = resolveEffectivePrice(row.product.defaultPriceCents, prices.get(row.productId) ?? null);
      return serializeSavedProduct(row, eff, approvedIds.has(row.productId));
    });
    return ok(serialized);
  });
}

/**
 * POST /api/customer/saved-products — save (or update) a catalogue product
 * for one-click reorder. The product must remain active and approved for the
 * org, otherwise it is stored as an unavailable reminder via PATCH-free GET.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const orgId = user.orgId;

    const body = await readJson(req);
    const productId = str(body.productId, "Product", { required: true, max: 40 });
    const qty = body.qty === undefined || body.qty === null ? 1 : int(body.qty, "Quantity", { min: 1 });
    const note = optionalStr(body.note, "Note", 500) ?? null;

    const product = await db.product.findFirst({
      where: { id: productId, isActive: true, access: { some: { orgId, approved: true } } },
    });
    if (!product) {
      throw new ApiError("That product is not currently available to your account.", 422);
    }

    // Unique (userId, productId) — saving again simply refreshes qty + note.
    const saved = await db.savedProduct.upsert({
      where: { userId_productId: { userId: user.id, productId } },
      create: { orgId, userId: user.id, productId, qty, note },
      update: { qty, note },
    });

    const prices = await customerPriceMap(orgId);
    const eff = resolveEffectivePrice(product.defaultPriceCents, prices.get(productId) ?? null);
    return ok(serializeSavedProduct({ ...saved, product }, eff, true));
  });
}
