import { db } from "@/lib/db";
import { ApiError, handler, ok, requireCustomer } from "@/lib/server/api";
import { serializeQuotationDetail } from "@/lib/server/serialize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    const { id } = await params;

    const quotation = await db.quotation.findFirst({
      where: { id, orgId: user.orgId },
      include: { items: true, organization: true, user: { select: { name: true } } },
    });
    if (!quotation) throw new ApiError("Quotation not found.", 404);

    return ok(serializeQuotationDetail(quotation));
  });
}
