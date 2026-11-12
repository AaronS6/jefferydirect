import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";

export async function POST(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const body = await readJson(req);
    const orgId = str(body.orgId, "Customer", { required: true, max: 40 });
    const productId = str(body.productId, "Product", { required: true, max: 40 });
    const approved = body.approved === true;

    const [org, product] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId } }),
      db.product.findUnique({ where: { id: productId } }),
    ]);
    if (!org) throw new ApiError("Customer not found.", 404);
    if (!product) throw new ApiError("Product not found.", 404);

    await db.productAccess.upsert({
      where: { orgId_productId: { orgId, productId } },
      create: { orgId, productId, approved },
      update: { approved },
    });

    return ok({ ok: true });
  });
}
