import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { audit, notifyCustomer, queryParam } from "@/lib/server/service";
import { serializeDocument } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const orgId = queryParam(req, "orgId");
    const category = queryParam(req, "category");
    const search = queryParam(req, "search");

    const documents = await db.document.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { fileName: { contains: search } },
                { description: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        organization: { select: { name: true } },
        order: { select: { orderNumber: true } },
        quotation: { select: { quoteNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(documents.map(serializeDocument));
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();

    const body = await readJson(req);
    const orgId = str(body.orgId, "Customer", { required: true, max: 40 });
    const category = str(body.category, "Category", { required: true, max: 30 });
    if (!DOCUMENT_CATEGORIES.includes(category as (typeof DOCUMENT_CATEGORIES)[number])) {
      throw new ApiError("Choose a valid document category.", 422);
    }
    const title = str(body.title, "Title", { required: true, max: 200 });
    const description = str(body.description, "Description", { max: 2000 });
    const fileName = str(body.fileName, "File name", { required: true, max: 200 });
    const sizeLabel = str(body.sizeLabel, "Size", { max: 40 });
    const orderId = str(body.orderId, "Order", { max: 40 });
    const quotationId = str(body.quotationId, "Quotation", { max: 40 });

    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new ApiError("Customer not found.", 404);

    // Related records must belong to the same org.
    if (orderId) {
      const order = await db.order.findFirst({ where: { id: orderId, orgId }, select: { id: true } });
      if (!order) throw new ApiError("Referenced order not found for this customer.", 404);
    }
    if (quotationId) {
      const quotation = await db.quotation.findFirst({
        where: { id: quotationId, orgId },
        select: { id: true },
      });
      if (!quotation) throw new ApiError("Referenced quotation not found for this customer.", 404);
    }

    const document = await db.document.create({
      data: {
        orgId,
        category,
        title,
        description: description || null,
        fileName,
        sizeLabel: sizeLabel || "—",
        orderId: orderId || null,
        quotationId: quotationId || null,
        uploadedBy: `${admin.name} (Jeffery Group)`,
      },
    });

    await audit({ id: admin.id, name: admin.name }, "DOCUMENT_UPLOADED", "Document", {
      entityId: document.id,
      detail: `${title} → ${org.name}`,
    });
    await notifyCustomer(orgId, {
      title: "New document added",
      body: `"${title}" has been added to your document centre.`,
      kind: "DOCUMENT",
      view: "documents",
      relatedId: document.id,
    });

    return ok({ id: document.id });
  });
}
