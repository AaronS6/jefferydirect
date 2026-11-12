import { db } from "@/lib/db";
import { ApiError, handler, ok, requireCustomer } from "@/lib/server/api";
import { DEFAULT_TAX_RATE_BP } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { nextOrderNumber, notifyAdmin, notifyCustomer } from "@/lib/server/service";

type ConvertedItem = {
  productId: string | null;
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  note: string | null;
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    const { id } = await params;

    const quote = await db.quotation.findFirst({
      where: { id, orgId: user.orgId },
      include: { items: true, organization: true },
    });
    if (!quote) throw new ApiError("Quotation not found.", 404);
    if (quote.status !== "ACCEPTED") {
      throw new ApiError("Only accepted quotations can be converted into an order.", 422);
    }
    if (quote.items.length === 0) {
      throw new ApiError("This quotation has no priced items to convert.", 422);
    }

    // Best-effort link: PRODUCT line descriptions usually lead with the
    // catalogue product name, so match against it for a real productId/sku.
    const catalog = await db.product.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true },
    });
    const items: ConvertedItem[] = [];
    for (const item of quote.items) {
      if (item.kind === "PRODUCT") {
        const match = catalog.find((p) =>
          item.description.toLowerCase().includes(p.name.toLowerCase()),
        );
        items.push({
          productId: match ? match.id : null,
          sku: match ? match.sku : "QUOTE",
          name: item.description,
          qty: item.qty,
          unitPriceCents: item.unitPriceCents,
          lineTotalCents: item.lineTotalCents,
          note: null,
        });
      }
    }
    // SETUP / FREIGHT / OTHER charges collapse into one "Other charges" line.
    const others = quote.items.filter((i) => i.kind !== "PRODUCT");
    if (others.length > 0) {
      const otherCents = others.reduce((sum, o) => sum + o.lineTotalCents, 0);
      items.push({
        productId: null,
        sku: "QUOTE",
        name: "Other charges",
        qty: 1,
        unitPriceCents: otherCents,
        lineTotalCents: otherCents,
        note: others.map((o) => o.description).join("; "),
      });
    }

    const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const taxCents = Math.round((subtotalCents * DEFAULT_TAX_RATE_BP) / 10_000);
    const totalCents = subtotalCents + taxCents;

    const orderNumber = await nextOrderNumber();
    const order = await db.order.create({
      data: {
        orderNumber,
        orgId: quote.orgId,
        userId: quote.userId,
        status: "SUBMITTED",
        subtotalCents,
        taxCents,
        totalCents,
        taxRateBp: DEFAULT_TAX_RATE_BP,
        shippingText: quote.destination ?? "",
        notes: `Converted from quotation ${quote.quoteNumber}`,
        items: { create: items },
        history: { create: { status: "SUBMITTED", byUserId: user.id, byName: user.name } },
      },
    });

    const orgName = quote.organization.name;
    await notifyAdmin({
      title: `Quotation ${quote.quoteNumber} converted to order ${orderNumber}`,
      body: `${orgName} converted accepted quotation ${quote.quoteNumber} into order ${orderNumber} (${formatCents(totalCents)}).`,
      kind: "ORDER",
      view: "admin-order-detail",
      relatedId: order.id,
    });
    await notifyCustomer(quote.orgId, {
      title: `Order ${orderNumber} submitted from quotation ${quote.quoteNumber}`,
      body: "Your order request has been submitted from your accepted quotation. We will review it and confirm shortly.",
      kind: "ORDER",
      view: "order-detail",
      relatedId: order.id,
    });

    return ok({ orderId: order.id, orderNumber });
  });
}
