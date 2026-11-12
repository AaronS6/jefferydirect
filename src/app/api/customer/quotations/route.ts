import { db } from "@/lib/db";
import { handler, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { nextQuoteNumber, notifyAdmin, notifyCustomer, queryParam } from "@/lib/server/service";
import { serializeQuotationListItem } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const status = queryParam(req, "status");

    const quotations = await db.quotation.findMany({
      where: { orgId: user.orgId, ...(status ? { status } : {}) },
      include: { organization: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(quotations.map(serializeQuotationListItem));
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const orgId = user.orgId;

    const body = await readJson(req);
    const title = str(body.title, "Title", { required: true, max: 160 });
    const category = str(body.category, "Category", { max: 80 });
    const productName = str(body.productName, "Product name", { max: 160 });
    const dimensions = str(body.dimensions, "Dimensions", { max: 160 });
    const material = str(body.material, "Material", { max: 160 });
    const colour = str(body.colour, "Colour", { max: 80 });
    const printing = str(body.printing, "Printing", { max: 240 });
    const quantity = str(body.quantity, "Quantity", { max: 120 });
    const neededBy = str(body.neededBy, "Needed by", { max: 120 });
    const destination = str(body.destination, "Destination", { max: 240 });
    const specs = str(body.specs, "Specifications", { max: 2000 });
    const comments = str(body.comments, "Comments", { max: 2000 });
    // QUOTE (default) or NEW_PRODUCT — a request for a product not carried.
    const kindRaw = str(body.kind, "Kind", { max: 20 });
    const kind = kindRaw === "NEW_PRODUCT" ? "NEW_PRODUCT" : "QUOTE";

    const quoteNumber = await nextQuoteNumber();
    const quotation = await db.quotation.create({
      data: {
        quoteNumber,
        orgId,
        userId: user.id,
        status: "REQUESTED",
        kind,
        title,
        category: category || null,
        productName: productName || null,
        dimensions: dimensions || null,
        material: material || null,
        colour: colour || null,
        printing: printing || null,
        quantity: quantity || null,
        neededBy: neededBy || null,
        destination: destination || null,
        specs: specs || null,
        comments: comments || null,
      },
    });

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    await notifyAdmin({
      title:
        kind === "NEW_PRODUCT"
          ? `New product request ${quoteNumber}`
          : `New quotation request ${quoteNumber}`,
      body: `${org?.name ?? "A customer"} requested ${kind === "NEW_PRODUCT" ? "a product" : "pricing"}: ${title}.`,
      kind: "QUOTATION",
      view: "admin-quote-detail",
      relatedId: quotation.id,
    });
    await notifyCustomer(orgId, {
      title:
        kind === "NEW_PRODUCT"
          ? `We received your product request ${quoteNumber}`
          : `We received your quotation request ${quoteNumber}`,
      body: "Our team will review your requirements and respond shortly.",
      kind: "QUOTATION",
      view: "quote-detail",
      relatedId: quotation.id,
    });

    return ok({ id: quotation.id, quoteNumber });
  });
}
