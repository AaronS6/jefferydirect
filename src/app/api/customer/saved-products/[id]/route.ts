import { db } from "@/lib/db";
import type { Product, SavedProduct } from "@prisma/client";
import { ApiError, handler, int, ok, readJson, requireCustomer } from "@/lib/server/api";
import {
  approvedProductIds,
  customerPriceMap,
  optionalStr,
  requireOrgWrite,
  resolveEffectivePrice,
} from "@/lib/server/service";
import { serializeSavedProduct } from "@/lib/server/serialize";
import type { SavedProductDto } from "@/types";

/** Serialize one saved row with the org's effective price + availability. */
async function serializeSavedRow(
  row: SavedProduct & { product: Product },
  orgId: string,
): Promise<SavedProductDto> {
  const [prices, approvedIds] = await Promise.all([
    customerPriceMap(orgId),
    approvedProductIds(orgId),
  ]);
  const eff = resolveEffectivePrice(row.product.defaultPriceCents, prices.get(row.productId) ?? null);
  return serializeSavedProduct(row, eff, approvedIds.has(row.productId));
}

/** PATCH /api/customer/saved-products/:id — adjust qty / note on an own saved row. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    const body = await readJson(req);
    const data: { qty?: number; note?: string | null } = {};
    if (body.qty !== undefined) data.qty = int(body.qty, "Quantity", { min: 1 });
    if (body.note !== undefined) data.note = optionalStr(body.note, "Note", 500) ?? null;

    // userId in the where clause — another user's row is "not found".
    const existing = await db.savedProduct.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new ApiError("Saved product not found.", 404);

    const updated = await db.savedProduct.update({ where: { id: existing.id }, data });
    const row = await db.savedProduct.findUnique({ where: { id: updated.id }, include: { product: true } });
    if (!row) throw new ApiError("Saved product not found.", 404);
    return ok(await serializeSavedRow(row, user.orgId));
  });
}

/** DELETE /api/customer/saved-products/:id — remove an own saved row. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    const existing = await db.savedProduct.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new ApiError("Saved product not found.", 404);

    await db.savedProduct.delete({ where: { id: existing.id } });
    return ok({ ok: true });
  });
}
