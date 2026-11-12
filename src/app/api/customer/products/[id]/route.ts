import { db } from "@/lib/db";
import { ApiError, handler, ok, requireCustomer } from "@/lib/server/api";
import { resolveEffectivePrice } from "@/lib/server/service";
import { serializeProductDetail } from "@/lib/server/serialize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    const { id } = await params;

    const product = await db.product.findFirst({
      where: { id, isActive: true, access: { some: { orgId: user.orgId, approved: true } } },
      include: { category: true },
    });
    if (!product) throw new ApiError("Product not found.", 404);

    const custom = await db.customerPrice.findUnique({
      where: { orgId_productId: { orgId: user.orgId, productId: id } },
      select: { priceCents: true },
    });

    return ok(
      serializeProductDetail(
        product,
        resolveEffectivePrice(product.defaultPriceCents, custom?.priceCents ?? null),
      ),
    );
  });
}
