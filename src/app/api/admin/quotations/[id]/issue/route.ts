import { db } from "@/lib/db";
import { ApiError, handler, int, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { formatCents } from "@/lib/money";
import { audit, notifyCustomer, optionalDate, optionalStr, QUOTE_ITEM_KIND_SET } from "@/lib/server/service";

const ISSUE_ALLOWED = new Set(["REQUESTED", "UNDER_REVIEW", "ISSUED", "EXPIRED", "REVISED"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const body = await readJson(req);
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ApiError("A quotation must include at least one priced item.", 422);
    }
    if (rawItems.length > 20) {
      throw new ApiError("A quotation can include at most 20 items.", 422);
    }

    const items = rawItems.map((raw, i) => {
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new ApiError(`Quote item ${i + 1} is invalid.`, 422);
      }
      const rec = raw as Record<string, unknown>;
      const description = str(rec.description, `Item ${i + 1} description`, { required: true, max: 200 });
      const kind = str(rec.kind, `Item ${i + 1} kind`, { required: true, max: 16 }).toUpperCase();
      if (!QUOTE_ITEM_KIND_SET.has(kind)) {
        throw new ApiError(`Item ${i + 1} kind must be PRODUCT, SETUP, FREIGHT or OTHER.`, 422);
      }
      const qty = int(rec.qty, `Item ${i + 1} quantity`, { min: 1 });
      const unitPriceCents = int(rec.unitPriceCents, `Item ${i + 1} unit price (cents)`, { min: 0 });
      return { description, kind, qty, unitPriceCents, lineTotalCents: qty * unitPriceCents };
    });

    const expiryDate = optionalDate(body.expiryDate, "Expiry date");
    const terms = optionalStr(body.terms, "Terms", 4000);
    const internalNote = optionalStr(body.internalNote, "Internal note", 2000);

    const quote = await db.quotation.findUnique({
      where: { id },
      include: { organization: true },
    });
    if (!quote) throw new ApiError("Quotation not found.", 404);
    if (!ISSUE_ALLOWED.has(quote.status)) {
      throw new ApiError("This quotation can no longer be issued.", 422);
    }

    const itemsTotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    // Re-issuing an already-issued (or expired / revision-requested) quote bumps
    // the revision counter so the customer sees a fresh, respondable version.
    const isReIssue = ["ISSUED", "EXPIRED", "REVISED"].includes(quote.status);

    // Replace the item list atomically: delete then re-create.
    await db.quotationItem.deleteMany({ where: { quotationId: quote.id } });
    await db.quotation.update({
      where: { id: quote.id },
      data: {
        status: "ISSUED",
        revision: isReIssue ? quote.revision + 1 : quote.revision,
        issuedAt: new Date(),
        itemsTotalCents,
        ...(expiryDate !== undefined ? { expiryDate } : {}),
        ...(terms !== undefined ? { terms } : {}),
        ...(internalNote !== undefined ? { internalNote } : {}),
        items: { create: items },
      },
    });

    const orgName = quote.organization.name;
    await audit({ id: admin.id, name: admin.name }, "QUOTATION_ISSUED", "Quotation", {
      entityId: quote.id,
      detail: `${quote.quoteNumber} issued to ${orgName} (${formatCents(itemsTotalCents)})`,
    });

    await notifyCustomer(quote.orgId, {
      title: isReIssue
        ? `Quotation ${quote.quoteNumber} revised — Rev ${quote.revision + 1}`
        : `Quotation ${quote.quoteNumber} is ready to review`,
      body: isReIssue
        ? `Updated pricing for "${quote.title}" has been issued and is open for your response.`
        : `Your quotation for "${quote.title}" has been issued${expiryDate ? ` and is valid until ${expiryDate.toISOString().slice(0, 10)}` : ""}. Review and respond from the Quotations area.`,
      kind: "QUOTATION",
      view: "quote-detail",
      relatedId: quote.id,
    });

    return ok({ ok: true });
  });
}
