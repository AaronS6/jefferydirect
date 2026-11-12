import { db } from "@/lib/db";
import { ApiError, handler, int, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { formatCents } from "@/lib/money";
import {
  audit,
  nextQuoteNumber,
  notifyAdmin,
  notifyCustomer,
  optionalDate,
  optionalStr,
  queryParam,
  QUOTE_ITEM_KIND_SET,
} from "@/lib/server/service";
import { serializeQuotationListItem } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const status = queryParam(req, "status");
    const search = queryParam(req, "search");

    const quotations = await db.quotation.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { quoteNumber: { contains: search } },
                { title: { contains: search } },
                { organization: { name: { contains: search } } },
              ],
            }
          : {}),
      },
      include: { organization: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(quotations.map(serializeQuotationListItem));
  });
}

// ─── Issue a quotation on behalf of a customer ──────────────────────────────

const OFFLINE_SOURCES = new Set(["EMAIL", "PHONE", "IN_PERSON"]);

/**
 * POST /api/admin/quotations — issue a quotation the customer asked for
 * outside the portal (emailed or phoned in). The quote lands on their
 * account as ISSUED with the pricing you settled, ready for them to accept.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();
    const body = await readJson(req);

    const orgId = str(body.orgId, "Customer", { required: true, max: 40 });
    const sourceType = str(body.sourceType, "Source", { required: true, max: 20 });
    if (!OFFLINE_SOURCES.has(sourceType)) {
      throw new ApiError("Source must be EMAIL, PHONE or IN_PERSON.", 422);
    }

    const title = str(body.title, "Quotation title", { required: true, max: 160 });
    const category = optionalStr(body.category, "Category", 60) ?? null;
    const productName = str(body.productName, "Product name", { max: 160 });
    const quantity = str(body.quantity, "Quantity", { max: 60 });
    const neededBy = str(body.neededBy, "Needed by", { max: 60 });
    const destination = str(body.destination, "Destination", { max: 200 });
    const terms = str(body.terms, "Terms", { max: 4000 });
    const notes = str(body.notes, "Notes", { max: 2000 }); // customer-visible
    const expiryDate = optionalDate(body.expiryDate, "Expiry date");
    let notify = true;
    if (body.notifyCustomer !== undefined) {
      if (typeof body.notifyCustomer !== "boolean") {
        throw new ApiError("notifyCustomer must be true or false.", 422);
      }
      notify = body.notifyCustomer;
    }

    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new ApiError("Customer not found.", 404);
    if (org.status !== "ACTIVE") {
      throw new ApiError("This customer is suspended — quotations cannot be issued for it.", 422);
    }

    // ── Lines: priced quote items (product, setup, freight, other) ──────────
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ApiError("The quotation must include at least one line.", 422);
    }
    if (rawItems.length > 20) {
      throw new ApiError("A quotation can include at most 20 lines.", 422);
    }
    const items = rawItems.map((raw, i) => {
      const label = `Line ${i + 1}`;
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new ApiError(`${label} is invalid.`, 422);
      }
      const rec = raw as Record<string, unknown>;
      const description = str(rec.description, `${label} description`, { required: true, max: 200 });
      const kind = str(rec.kind, `${label} kind`, { max: 16 }) || "PRODUCT";
      if (!QUOTE_ITEM_KIND_SET.has(kind)) {
        throw new ApiError(`${label} kind must be PRODUCT, SETUP, FREIGHT or OTHER.`, 422);
      }
      const qty = int(rec.qty, `${label} quantity`, { min: 1 });
      const unitPriceCents =
        rec.unitPriceCents === undefined || rec.unitPriceCents === null
          ? 0
          : int(rec.unitPriceCents, `${label} unit price`, { min: 0 });
      if (unitPriceCents > 100_000_000) {
        throw new ApiError(`${label} unit price cannot exceed $1,000,000.00.`, 422);
      }
      return { description, kind, qty, unitPriceCents, lineTotalCents: qty * unitPriceCents };
    });

    // ── Requesting user: org administrator, else any active user ────────────
    const orgUser =
      (await db.user.findFirst({
        where: { orgId: org.id, role: "CUSTOMER", status: "ACTIVE", orgRole: "ORG_ADMIN" },
        orderBy: { createdAt: "asc" },
      })) ??
      (await db.user.findFirst({
        where: { orgId: org.id, role: "CUSTOMER", status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      }));
    if (!orgUser) {
      throw new ApiError(
        "This customer has no active portal users — invite a user before issuing quotations on their behalf.",
        404,
      );
    }

    const itemsTotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const quoteNumber = await nextQuoteNumber();

    const quotation = await db.quotation.create({
      data: {
        quoteNumber,
        orgId: org.id,
        userId: orgUser.id,
        status: "ISSUED",
        revision: 0,
        title,
        category,
        productName: productName || null,
        quantity: quantity || null,
        neededBy: neededBy || null,
        destination: destination || null,
        comments: notes || null,
        itemsTotalCents,
        expiryDate: expiryDate ?? null,
        terms: terms || null,
        issuedAt: new Date(),
        sourceType,
        recordedById: admin.id,
        recordedByName: admin.name,
        items: { create: items },
      },
    });

    if (notify) {
      await notifyCustomer(org.id, {
        title: `Quotation ${quoteNumber} added to your account`,
        body: `Jeffery Group issued a quotation for "${title}"${expiryDate ? ` (valid until ${expiryDate.toISOString().slice(0, 10)})` : ""} so you can review and accept it in ClientHub. If anything looks incorrect, contact our team.`,
        kind: "QUOTATION",
        view: "quote-detail",
        relatedId: quotation.id,
      });
    }
    await notifyAdmin({
      title: `Quotation issued on behalf — ${quoteNumber}`,
      body: `${admin.name} issued ${quoteNumber} for ${org.name} — ${items.length} line${items.length === 1 ? "" : "s"}, ${formatCents(itemsTotalCents)} total.`,
      kind: "QUOTATION",
      view: "admin-quote-detail",
      relatedId: quotation.id,
    });
    await audit(admin, "QUOTATION_ISSUED_ON_BEHALF", "Quotation", {
      entityId: quotation.id,
      detail: `${quoteNumber} — ${org.name} via ${sourceType}`,
    });

    return ok({ id: quotation.id, quoteNumber });
  });
}
