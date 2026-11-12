import { db } from "@/lib/db";
import { ApiError, handler, ok, requireAdmin } from "@/lib/server/api";
import { serializeQuotationDetail } from "@/lib/server/serialize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { id } = await params;

    const quotation = await db.quotation.findUnique({
      where: { id },
      include: { items: true, organization: true, user: { select: { name: true } } },
    });
    if (!quotation) throw new ApiError("Quotation not found.", 404);

    return ok(serializeQuotationDetail(quotation));
  });
}
