import { db } from "@/lib/db";
import { ApiError, handler, requireCustomer } from "@/lib/server/api";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

const CSV_HEADER = [
  "Order Number",
  "Status",
  "Submitted At",
  "Product SKU",
  "Product",
  "Qty",
  "Unit Price CAD",
  "Line Total CAD",
  "PO Number",
  "Requested Delivery",
  "Est. Delivery",
  "Tracking",
];

/** RFC 4180-style escaping — quote a cell when it may confuse a parser. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

/** Integer cents → plain decimal (the header already states CAD). */
function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dateOnly(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * GET /api/customer/orders/:id/export — a single order as CSV. One row per
 * line item plus a final total row; served as a downloadable attachment.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    const { id } = await params;

    // orgId in the where clause — another org's order is "not found".
    const order = await db.order.findFirst({
      where: { id, orgId: user.orgId },
      include: { items: true },
    });
    if (!order) throw new ApiError("Order not found.", 404);

    const status = ORDER_STATUS_LABELS[order.status] ?? order.status;
    const submittedAt = order.createdAt.toISOString();
    const poNumber = order.poNumber ?? "";
    const requestedDelivery = order.requestedDeliveryDate
      ? dateOnly(order.requestedDeliveryDate)
      : (order.requestedDelivery ?? "");
    const estDelivery = dateOnly(order.estimatedDelivery ?? order.revisedDeliveryDate);
    const tracking = order.trackingNumber ?? "";

    const rows: string[] = order.items.map((item) =>
      csvRow([
        order.orderNumber,
        status,
        submittedAt,
        item.sku,
        item.name,
        String(item.qty),
        money(item.unitPriceCents),
        money(item.lineTotalCents),
        poNumber,
        requestedDelivery,
        estDelivery,
        tracking,
      ]),
    );
    // Final total row — the order total (subtotal + tax) in the money column.
    rows.push(
      csvRow([
        order.orderNumber,
        status,
        submittedAt,
        "",
        "Total",
        "",
        "",
        money(order.totalCents),
        poNumber,
        requestedDelivery,
        estDelivery,
        tracking,
      ]),
    );

    // UTF-8 BOM keeps Excel happy with any unicode product names.
    const csv = `\uFEFF${[csvRow(CSV_HEADER), ...rows].join("\r\n")}\r\n`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${order.orderNumber}.csv"`,
      },
    });
  });
}
