import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin } from "@/lib/server/api";
import { parseProductInput } from "@/lib/server/service";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { id } = await params;

    const product = await db.product.findUnique({ where: { id } });
    if (!product) throw new ApiError("Product not found.", 404);

    const body = await readJson(req);
    const input = parseProductInput(body, "update");

    if (input.sku !== undefined && input.sku !== product.sku) {
      const clash = await db.product.findUnique({ where: { sku: input.sku } });
      if (clash) throw new ApiError("That SKU already exists.", 422);
    }
    if (input.categoryId !== undefined) {
      const category = await db.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new ApiError("Choose a valid category.", 422);
    }

    await db.product.update({ where: { id: product.id }, data: input });
    return ok({ ok: true });
  });
}
