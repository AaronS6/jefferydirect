import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { notifyCustomer } from "@/lib/server/service";

const ALLOWED = new Set(["REQUESTED", "UNDER_REVIEW"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { id } = await params;

    const body = await readJson(req);
    const status = str(body.status, "Status", { required: true, max: 20 });
    if (status !== "UNDER_REVIEW") {
      throw new ApiError("Acknowledgement sets the quotation status to UNDER_REVIEW.", 422);
    }

    const quote = await db.quotation.findUnique({ where: { id } });
    if (!quote) throw new ApiError("Quotation not found.", 404);
    if (!ALLOWED.has(quote.status)) {
      throw new ApiError("Only new quotation requests can be acknowledged.", 422);
    }

    await db.quotation.update({ where: { id: quote.id }, data: { status: "UNDER_REVIEW" } });

    await notifyCustomer(quote.orgId, {
      title: `Quotation ${quote.quoteNumber} under review`,
      body: "We are reviewing your quotation request and will issue pricing shortly.",
      kind: "QUOTATION",
      view: "quote-detail",
      relatedId: quote.id,
    });

    return ok({ ok: true });
  });
}
