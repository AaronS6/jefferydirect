import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin } from "@/lib/server/api";
import { audit } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const body = await readJson(req);
    const archive = body.archive === true;

    const product = await db.product.findUnique({ where: { id } });
    if (!product) throw new ApiError("Product not found.", 404);

    await db.product.update({ where: { id: product.id }, data: { isActive: !archive } });

    await audit(
      { id: admin.id, name: admin.name },
      archive ? "PRODUCT_ARCHIVED" : "PRODUCT_RESTORED",
      "Product",
      { entityId: product.id, detail: `${product.sku} — ${product.name}` },
    );

    return ok({ ok: true });
  });
}
