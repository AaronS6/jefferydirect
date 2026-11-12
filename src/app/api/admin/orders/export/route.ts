import { db } from "@/lib/db";
import { ApiError, handler, requireAdmin } from "@/lib/server/api";
import { ORDER_SOURCE_SHORT_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants";
import { audit, queryParam } from "@/lib/server/service";
import { centsToInputValue } from "@/lib/money";

/** RFC 4180 escaping: quote fields containing , " or newlines. */
function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Date columns keep the calendar date (dates are anchored at noon). */
function dateOnly(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

const COLUMNS = [
  "Order Number",
  "Customer Code",
  "Customer",
  "Status",
  "Source",
  "Recorded At",
  "Items",
  "Units",
  "Subtotal CAD",
  "GST CAD",
  "Total CAD",
  "PO Number",
  "Requested Delivery",
  "Est. Dispatch",
  "Est. Delivery",
  "Revised Delivery",
  "Next Update Due",
  "Actual Delivery",
  "Tracking",
];

/**
 * GET /api/admin/orders/export?format=csv&ids=a,b,c — CSV export of all (or
 * the selected) orders, capped at 500 rows.
 */
export async function GET(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();

    const format = queryParam(req, "format");
    if (format && format !== "csv") {
      throw new ApiError("Only CSV export is supported.", 406);
    }
    const idsParam = queryParam(req, "ids");
    const ids = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const orders = await db.order.findMany({
      ...(ids ? { where: { id: { in: ids } } } : {}),
      include: {
        items: { select: { qty: true } },
        organization: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const lines = [COLUMNS.map(csvEscape).join(",")];
    for (const o of orders) {
      const units = o.items.reduce((sum, i) => sum + i.qty, 0);
      const row = [
        o.orderNumber,
        o.organization.code,
        o.organization.name,
        ORDER_STATUS_LABELS[o.status] ?? o.status,
        ORDER_SOURCE_SHORT_LABELS[o.sourceType] ?? o.sourceType,
        o.createdAt.toISOString(),
        String(o.items.length),
        String(units),
        centsToInputValue(o.subtotalCents),
        centsToInputValue(o.taxCents),
        centsToInputValue(o.totalCents),
        o.poNumber ?? "",
        dateOnly(o.requestedDeliveryDate),
        dateOnly(o.estimatedDispatch),
        dateOnly(o.estimatedDelivery),
        dateOnly(o.revisedDeliveryDate),
        dateOnly(o.nextUpdateDate),
        dateOnly(o.actualDeliveryDate),
        o.trackingNumber ?? "",
      ];
      lines.push(row.map(csvEscape).join(","));
    }
    const csv = `${lines.join("\r\n")}\r\n`;

    await audit(admin, "ORDER_EXPORTED", "Order", {
      detail: `${orders.length} order(s) exported${ids ? " (selected set)" : ""}`,
    });

    const today = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clienthub-orders-${today}.csv"`,
      },
    });
  });
}
