import { db } from "@/lib/db";
import { ApiError, handler, int, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { DEFAULT_TAX_RATE_BP } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import type { AttachmentMeta, LineSpecs } from "@/types";
import {
  nextOrderNumber,
  notifyAdmin,
  notifyCustomer,
  optionalDate,
  optionalStr,
  queryParam,
  requireOrgWrite,
  resolveEffectivePrice,
  shippingLine,
} from "@/lib/server/service";
import { serializeOrderListItem } from "@/lib/server/serialize";
import { MAX_LINE_ATTACHMENTS, MAX_ORDER_LINES, MAX_QTY, buildSpecJson, parseAttachmentMetas, parseSpecs } from "../_validation";

/** GET /api/customer/orders?status= — this org's orders, newest first. */
export async function GET(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const status = queryParam(req, "status");

    // nextUpdateDate (scalar) always comes back alongside includes; the pending
    // change-request flag is folded in for the list badge.
    const orders = await db.order.findMany({
      where: { orgId: user.orgId, ...(status ? { status } : {}) },
      include: {
        items: true,
        organization: true,
        changeRequests: { select: { status: true }, where: { status: "PENDING" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(orders.map(serializeOrderListItem));
  });
}

// ─── Smart Order Builder submission ─────────────────────────────────────────

type ParsedLine = {
  custom: boolean;
  productId: string | null; // null ⇒ custom product request
  name: string; // custom requests only
  description: string | null; // custom requests only
  qty: number;
  note: string | null;
  specs: LineSpecs | null;
  attachments: AttachmentMeta[];
};

function parseLine(raw: unknown, index: number): ParsedLine {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(`Order line ${index + 1} is invalid.`, 422);
  }
  const rec = raw as Record<string, unknown>;
  const qty = int(rec.qty, `Line ${index + 1} quantity`, { min: 1 });

  if (rec.custom === true) {
    // Custom product request — exempt from catalogue rules; Jeffery Group
    // confirms pricing by quotation after review.
    if (qty > MAX_QTY) {
      throw new ApiError(`Line ${index + 1} quantity cannot exceed ${MAX_QTY.toLocaleString("en-CA")}.`, 422);
    }
    return {
      custom: true,
      productId: null,
      name: str(rec.name, `Line ${index + 1} request name`, { required: true, max: 160 }),
      description: optionalStr(rec.description, `Line ${index + 1} description`, 2000) ?? null,
      qty,
      note: optionalStr(rec.note, `Line ${index + 1} note`, 500) ?? null,
      specs: parseSpecs(rec.specs, `Line ${index + 1} specifications`),
      attachments: parseAttachmentMetas(rec.attachments, `Line ${index + 1} attachments`, MAX_LINE_ATTACHMENTS),
    };
  }

  return {
    custom: false,
    productId: str(rec.productId, `Line ${index + 1} product`, { required: true, max: 40 }),
    name: "",
    description: null,
    qty,
    note: optionalStr(rec.note, `Line ${index + 1} note`, 500) ?? null,
    specs: parseSpecs(rec.specs, `Line ${index + 1} specifications`),
    attachments: parseAttachmentMetas(rec.attachments, `Line ${index + 1} attachments`, MAX_LINE_ATTACHMENTS),
  };
}

/** POST /api/customer/orders — submit a new order request (status SUBMITTED). */
export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const orgId = user.orgId;

    const body = await readJson(req);
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ApiError("Your order must include at least one line.", 422);
    }
    if (rawItems.length > MAX_ORDER_LINES) {
      throw new ApiError(`An order request can include at most ${MAX_ORDER_LINES} lines.`, 422);
    }
    const lines = rawItems.map((raw, i) => parseLine(raw, i));

    const addressId = str(body.addressId, "Delivery address", { max: 40 });
    const poNumber = str(body.poNumber, "PO number", { max: 60 });
    const notes = str(body.notes, "Notes", { max: 2000 });
    const specialInstructions = str(body.specialInstructions, "Special instructions", { max: 2000 });
    const requestedDelivery = str(body.requestedDelivery, "Requested delivery", { max: 200 });
    const requestedDeliveryDate = optionalDate(body.requestedDeliveryDate, "Requested delivery date");
    const orderAttachments = parseAttachmentMetas(body.attachments, "Attachments", MAX_LINE_ATTACHMENTS);
    const draftId = str(body.draftId, "Draft", { max: 40 });

    const combinedNotes =
      notes && specialInstructions
        ? `${notes}\n\nSpecial instructions: ${specialInstructions}`
        : notes || specialInstructions || null;

    // Shipping text comes from an address owned by THIS org (never client data).
    let shippingText = "";
    if (addressId) {
      const address = await db.address.findFirst({ where: { id: addressId, orgId } });
      if (!address) throw new ApiError("Delivery address not found.", 404);
      shippingText = shippingLine(address);
    } else {
      const fallback = await db.address.findFirst({ where: { orgId, isDefault: true } });
      if (fallback) shippingText = shippingLine(fallback);
    }

    // Catalogue lines: approved access + active product + qty rules + price.
    // Custom request lines are exempt — pricing is confirmed by quotation.
    const catalogueLines = lines.filter((l) => !l.custom && l.productId !== null);
    const ids = [...new Set(catalogueLines.map((l) => l.productId as string))];
    const products = ids.length
      ? await db.product.findMany({
          where: { id: { in: ids }, isActive: true, access: { some: { orgId, approved: true } } },
        })
      : [];
    const customPrices = ids.length
      ? await db.customerPrice.findMany({ where: { orgId, productId: { in: ids } } })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));
    const priceById = new Map(customPrices.map((p) => [p.productId, p.priceCents]));

    const itemRows = lines.map((line) => {
      if (line.custom) {
        return {
          productId: null,
          sku: "CUSTOM-REQ",
          name: line.name,
          qty: line.qty,
          unitPriceCents: 0,
          lineTotalCents: 0,
          note: line.description ?? line.note ?? null,
          specJson: buildSpecJson(line.specs, line.attachments),
        };
      }
      const product = productById.get(line.productId as string);
      if (!product) {
        throw new ApiError(
          "Some products in your order are not currently available. Remove unavailable lines and try again.",
          422,
        );
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
      const eff = resolveEffectivePrice(product.defaultPriceCents, priceById.get(product.id) ?? null);
      if (eff.priceCents === null) {
        throw new ApiError(
          `${product.name} (${product.sku}) requires a quotation before ordering — please request a quotation for current pricing.`,
          422,
        );
      }
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        qty: line.qty,
        unitPriceCents: eff.priceCents,
        lineTotalCents: eff.priceCents * line.qty,
        note: line.note,
        specJson: buildSpecJson(line.specs, line.attachments),
      };
    });

    // Integer money math — priced lines only; custom requests contribute zero
    // until Jeffery Group confirms pricing. Subtotal, GST (basis points), total.
    const subtotalCents = itemRows.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const taxCents = Math.round((subtotalCents * DEFAULT_TAX_RATE_BP) / 10_000);
    const totalCents = subtotalCents + taxCents;

    const orderNumber = await nextOrderNumber();
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    const customCount = itemRows.filter((i) => i.productId === null).length;

    const order = await db.order.create({
      data: {
        orderNumber,
        orgId,
        userId: user.id,
        status: "SUBMITTED",
        subtotalCents,
        taxCents,
        totalCents,
        taxRateBp: DEFAULT_TAX_RATE_BP,
        shippingText,
        poNumber: poNumber || null,
        notes: combinedNotes,
        requestedDelivery: requestedDelivery || null,
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
        items: { create: itemRows },
        history: { create: { status: "SUBMITTED", byUserId: user.id, byName: user.name } },
      },
    });

    // Order-level attachment references — registered as document rows.
    if (orderAttachments.length > 0) {
      await db.document.createMany({
        data: orderAttachments.map((a) => ({
          orgId,
          orderId: order.id,
          category: "OTHER",
          title: a.name,
          description: a.note ?? null,
          fileName: a.name,
          sizeLabel: a.sizeLabel,
          uploadedBy: user.name,
        })),
      });
    }

    // The draft this submission came from is spent — remove it quietly.
    if (draftId) {
      await db.orderDraft.deleteMany({ where: { id: draftId, userId: user.id } });
    }

    await notifyAdmin({
      title: `New order request ${orderNumber}`,
      body:
        `${org?.name ?? "A customer"} submitted a new order request — ${itemRows.length} product${itemRows.length === 1 ? "" : "s"}, ${formatCents(totalCents)} total.` +
        (customCount > 0
          ? ` Includes ${customCount} custom product request${customCount === 1 ? "" : "s"} — pricing to be confirmed.`
          : ""),
      kind: "ORDER",
      view: "admin-order-detail",
      relatedId: order.id,
    });
    await notifyCustomer(orgId, {
      title: `We received your order request ${orderNumber}`,
      body: "Thank you for your order request. Our team will review it and confirm shortly — track progress under Orders.",
      kind: "ORDER",
      view: "order-detail",
      relatedId: order.id,
    });

    return ok({ id: order.id, orderNumber });
  });
}
