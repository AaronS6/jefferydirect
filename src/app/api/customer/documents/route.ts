import { db } from "@/lib/db";
import { handler, ok, requireCustomer } from "@/lib/server/api";
import { queryParam } from "@/lib/server/service";
import { serializeDocument } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const category = queryParam(req, "category");
    const search = queryParam(req, "search");

    const documents = await db.document.findMany({
      where: {
        orgId: user.orgId,
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
        order: { select: { orderNumber: true } },
        quotation: { select: { quoteNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(documents.map(serializeDocument));
  });
}
