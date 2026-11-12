import { db } from "@/lib/db";
import { ApiError, handler, int, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { DEFAULT_TAX_RATE_BP, ORDER_SOURCE_SHORT_LABELS } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import {
  ORDER_STATUS_SET,
  audit,
  nextOrderNumber,
  notifyAdmin,
  notifyCustomer,
  optionalDate,
  queryParam,
  resolveEffectivePrice,
  shippingLine,
} from "@/lib/server/service";
import { serializeOrderListItem } from "@/lib/server/serialize";

export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const status = queryParam(req, "status");
    const search = queryParam(req, "search");
    const orgId = queryParam(req, "orgId");

    const orders = await db.order.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(orgId ? { orgId } : {}),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search } },
                { poNumber: { contains: search } },
                { organization: { name: { contains: search } } },
              ],
            }
          : {}),
      },
      include: {
        items: true,
        organization: true,
        changeRequests: { where: { status: "PENDING" }, select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(orders.map(serializeOrderListItem));
  });
}

// ─── Record an order received outside the portal ────────────────────────────

const OFFLINE_SOURCES = new Set(["EMAIL", "PHONE", "IN_PERSON"]);

type RecordedLine = {
  productId: string | null;
  custom: boolean;
  name: string;
  description: string;
  qty: number;
  note: string;
  specs: Record<string, string> | null;
  // Admin-entered agreed unit price (integer cents) — e.g. the price settled
  // over email. null = use the customer's effective price (products) or
  // leave the line unpriced (custom requests).
  unitPriceCents: number | null;
};

/** specs: a flat set of text values (dimensions, material, printing, …). */
function parseSpecs(v: unknown, field: string): Record<string, string> | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError(`${field} must be a set of specification values.`, 422);
  }
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(v as Record<string, unknown>)) {
    const key = str(rawKey, `${field} name`, { max: 40 });
    const value = str(rawValue, `${field} (${key})`, { max: 500 });
    if (key && value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * POST /api/admin/orders — record an order the customer placed outside the
 * portal (emailed or phoned in) so they can track it in ClientHub.
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
    const status = str(body.status, "Status", { max: 30 }) || "CONFIRMED";
    if (!ORDER_STATUS_SET.has(status)) {
      throw new ApiError("Invalid order status.", 422);
    }

    const poNumber = str(body.poNumber, "PO number", { max: 60 });
    const notes = str(body.notes, "Notes", { max: 2000 });
    const trackingNumber = str(body.trackingNumber, "Tracking number", { max: 60 });
    const addressId = str(body.addressId, "Delivery address", { max: 40 });
    const requestedDeliveryDate = optionalDate(body.requestedDeliveryDate, "Requested delivery date");
    const estimatedDelivery = optionalDate(body.estimatedDelivery, "Estimated delivery");
    const estimatedDispatch = optionalDate(body.estimatedDispatch, "Estimated dispatch");
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
      throw new ApiError("This customer is suspended — orders cannot be recorded for it.", 422);
    }

    // ── Lines: catalogue products or custom requests ────────────────────────
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ApiError("The order must include at least one line.", 422);
    }
    if (rawItems.length > 40) {
      throw new ApiError("An order can include at most 40 lines.", 422);
    }
    const lines: RecordedLine[] = rawItems.map((raw, i) => {
      const label = `Line ${i + 1}`;
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new ApiError(`${label} is invalid.`, 422);
      }
      const rec = raw as Record<string, unknown>;
      const qty = int(rec.qty, `${label} quantity`, { min: 1 });
      const note = str(rec.note, `${label} note`, { max: 1000 });
      const specs = parseSpecs(rec.specs, `${label} specifications`);
      const unitPriceCents =
        rec.unitPriceCents === undefined || rec.unitPriceCents === null
          ? null
          : int(rec.unitPriceCents, `${label} unit price`, { min: 0 });
      if (unitPriceCents !== null && unitPriceCents > 100_000_000) {
        throw new ApiError(`${label} unit price cannot exceed $1,000,000.00.`, 422);
      }
      if (rec.custom === true) {
        const name = str(rec.name, `${label} product name`, { required: true, max: 160 });
        const description = str(rec.description, `${label} description`, { max: 2000 });
        return { productId: null, custom: true, name, description, qty, note, specs, unitPriceCents };
      }
      const productId = str(rec.productId, `${label} product`, { required: true, max: 40 });
      return { productId, custom: false, name: "", description: "", qty, note, specs, unitPriceCents };
    });

    // ── Catalogue lines: availability, quantity rules, effective price ─────
    const productIds = [
      ...new Set(lines.filter((l) => l.productId !== null).map((l) => l.productId as string)),
    ];
    // Note: `in: []` matches nothing, so this is safe for all-custom orders.
    const [products, customPrices] = await Promise.all([
      db.product.findMany({
        where: { id: { in: productIds }, isActive: true, access: { some: { orgId: org.id, approved: true } } },
      }),
      db.customerPrice.findMany({ where: { orgId: org.id, productId: { in: productIds } } }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const priceById = new Map(customPrices.map((p) => [p.productId, p.priceCents]));

    const items = lines.map((line, i) => {
      const label = `Line ${i + 1}`;
      if (line.custom) {
        // Custom request — priced here if the admin settled it over email,
        // otherwise priced later through the quotation flow.
        const unitPriceCents = line.unitPriceCents ?? 0;
        return {
          productId: null as string | null,
          sku: "CUSTOM-REQ",
          name: line.name,
          qty: line.qty,
          unitPriceCents,
          lineTotalCents: unitPriceCents * line.qty,
          note: (line.description || line.note) || null,
          specJson: line.specs ? JSON.stringify(line.specs) : null,
        };
      }
      const product = productById.get(line.productId as string);
      if (!product) {
        throw new ApiError(`${label}: that product is not active or not approved for this customer.`, 422);
      }
      if (line.qty < product.minOrderQty) {
        const plural = /(?:ch|s|x|sh)$/i.test(product.unit) ? product.unit : `${product.unit}s`;
        throw new ApiError(
          `${product.name} (${product.sku}): minimum order quantity is ${product.minOrderQty.toLocaleString("en-CA")} ${product.minOrderQty === 1 ? product.unit : plural}.`,
          422,
        );
      }
      if (line.qty % product.increment !== 0) {
        throw new ApiError(
          `${product.name} (${product.sku}): quantity must be a multiple of ${product.increment.toLocaleString("en-CA")}.`,
          422,
        );
      }
      // The agreed price takes precedence over catalogue pricing — the admin
      // is recording what was actually settled with the customer off-portal.
      const eff = resolveEffectivePrice(product.defaultPriceCents, priceById.get(product.id) ?? null);
      const unitPriceCents = line.unitPriceCents ?? eff.priceCents;
      if (unitPriceCents === null) {
        throw new ApiError(
          `${product.name} (${product.sku}) has no published price — enter the unit price agreed with the customer to record this order.`,
          422,
        );
      }
      return {
        productId: product.id as string | null,
        sku: product.sku,
        name: product.name,
        qty: line.qty,
        unitPriceCents,
        lineTotalCents: unitPriceCents * line.qty,
        note: line.note || null,
        specJson: line.specs ? JSON.stringify({ ...line.specs, attachments: [] }) : null,
      };
    });

    // ── Shipping: an approved address owned by this organization ───────────
    let shippingText = "";
    if (addressId) {
      const address = await db.address.findFirst({
        where: { id: addressId, orgId: org.id, approvalStatus: "APPROVED" },
      });
      if (!address) throw new ApiError("Delivery address not found or awaiting approval.", 404);
      shippingText = shippingLine(address);
    } else {
      const fallback = await db.address.findFirst({
        where: { orgId: org.id, isDefault: true, approvalStatus: "APPROVED" },
      });
      if (fallback) shippingText = shippingLine(fallback);
    }

    // ── Submitting user: org administrator, else any active user ────────────
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
        "This customer has no active portal users — invite a user before recording orders on their behalf.",
        404,
      );
    }

    // ── Integer money math ──────────────────────────────────────────────────
    const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const taxCents = Math.round((subtotalCents * DEFAULT_TAX_RATE_BP) / 10_000);
    const totalCents = subtotalCents + taxCents;
    const orderNumber = await nextOrderNumber();

    const order = await db.order.create({
      data: {
        orderNumber,
        orgId: org.id,
        userId: orgUser.id,
        status,
        subtotalCents,
        taxCents,
        totalCents,
        taxRateBp: DEFAULT_TAX_RATE_BP,
        shippingText,
        poNumber: poNumber || null,
        notes: notes || null,
        trackingNumber: trackingNumber || null,
        requestedDeliveryDate: requestedDeliveryDate ?? null,
        estimatedDelivery: estimatedDelivery ?? null,
        estimatedDispatch: estimatedDispatch ?? null,
        sourceType,
        recordedById: admin.id,
        recordedByName: admin.name,
        items: { create: items },
        history: {
          create: {
            status,
            note: `Order recorded on behalf of ${org.name} (${sourceType}) by ${admin.name}`,
            byUserId: admin.id,
            byName: `${admin.name} (Admin)`,
          },
        },
      },
    });

    if (notify) {
      const channel = (ORDER_SOURCE_SHORT_LABELS[sourceType] ?? sourceType).toLowerCase();
      await notifyCustomer(org.id, {
        title: `Order ${orderNumber} added to your account`,
        body: `Jeffery Group recorded an order you placed via ${channel} so you can follow its progress in ClientHub. If anything looks incorrect, contact our team.`,
        kind: "ORDER",
        view: "order-detail",
        relatedId: order.id,
      });
    }
    await notifyAdmin({
      title: `Offline order recorded ${orderNumber}`,
      body: `${admin.name} recorded an order for ${org.name} — ${items.length} line${items.length === 1 ? "" : "s"}, ${formatCents(totalCents)} total.`,
      kind: "ORDER",
      view: "admin-order-detail",
      relatedId: order.id,
    });
    await audit(admin, "ORDER_RECORDED", "Order", {
      entityId: order.id,
      detail: `${orderNumber} — ${org.name} via ${sourceType}`,
    });

    return ok({ id: order.id, orderNumber });
  });
}
