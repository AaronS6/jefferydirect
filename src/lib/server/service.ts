// Shared backend services used by every route handler: document-number
// sequences, notifications, audit logging, effective-price resolution and
// common input parsing helpers.

import { db } from "@/lib/db";
import { ApiError, int, str } from "@/lib/server/api";
import {
  ORDER_STATUSES,
  QUOTE_ITEM_KINDS,
  STOCK_STATUSES,
} from "@/lib/constants";

// ─── Valid status sets ───────────────────────────────────────────────────────

export const ORDER_STATUS_SET = new Set<string>([...ORDER_STATUSES, "CANCELLED", "REJECTED"]);
export const QUOTE_ITEM_KIND_SET = new Set<string>(QUOTE_ITEM_KINDS);
export const STOCK_STATUS_SET = new Set<string>(STOCK_STATUSES);

// ─── Document number sequences ──────────────────────────────────────────────

/**
 * Orders are numbered ORD-2024-<seq>. The sequence is prefix-scoped: we find
 * the highest existing numeric suffix under the prefix and add 1.
 */
export async function nextOrderNumber(): Promise<string> {
  const prefix = "ORD-2024-";
  const last = await db.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const seq = last ? Number.parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** Quotations are numbered Q-2024-<seq> (same prefix-scoped rule). */
export async function nextQuoteNumber(): Promise<string> {
  const prefix = "Q-2024-";
  const last = await db.quotation.findFirst({
    where: { quoteNumber: { startsWith: prefix } },
    orderBy: { quoteNumber: "desc" },
    select: { quoteNumber: true },
  });
  const seq = last ? Number.parseInt(last.quoteNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** Organization codes are JG-C1<3-digit> — next free 3-digit suffix. */
export async function nextOrgCode(): Promise<string> {
  const orgs = await db.organization.findMany({
    where: { code: { startsWith: "JG-C1" } },
    select: { code: true },
  });
  let max = 0;
  for (const org of orgs) {
    const n = Number.parseInt(org.code.slice(5), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `JG-C1${String(max + 1).padStart(3, "0")}`;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotifyInput = {
  title: string;
  body: string;
  kind: string;
  view?: string | null;
  relatedId?: string | null;
};

/** Create a notification visible to every user of one customer organization. */
export async function notifyCustomer(orgId: string, input: NotifyInput): Promise<void> {
  await db.notification.create({
    data: {
      audience: "CUSTOMER",
      orgId,
      title: input.title,
      body: input.body,
      kind: input.kind,
      view: input.view ?? null,
      relatedId: input.relatedId ?? null,
    },
  });
}

/** Create a notification for the Jeffery Group admin team. */
export async function notifyAdmin(input: NotifyInput): Promise<void> {
  await db.notification.create({
    data: {
      audience: "ADMIN",
      orgId: null,
      title: input.title,
      body: input.body,
      kind: input.kind,
      view: input.view ?? null,
      relatedId: input.relatedId ?? null,
    },
  });
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function audit(
  actor: { id: string; name: string },
  action: string,
  entity: string,
  opts?: { entityId?: string; detail?: string },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action,
      entity,
      entityId: opts?.entityId ?? null,
      detail: opts?.detail ?? null,
    },
  });
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CUSTOMER_CREATED: "Customer onboarded",
  USER_INVITED: "User invited",
  PRICE_UPDATED: "Price updated",
  ORDER_STATUS_CHANGED: "Order status changed",
  QUOTATION_ISSUED: "Quotation issued",
  DOCUMENT_UPLOADED: "Document uploaded",
  DOCUMENT_DELETED: "Document deleted",
  PRODUCT_CREATED: "Product created",
  PRODUCT_ARCHIVED: "Product archived",
  PRODUCT_RESTORED: "Product restored",
  CATEGORY_CREATED: "Category created",
};

/** Human-readable label for an audit action (admin activity feed). */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ").toLowerCase();
}

// ─── Credentials ─────────────────────────────────────────────────────────────

/** Readable temporary password, returned once and stored only as a hash. */
export function tempPassword(): string {
  let s = "";
  while (s.length < 6) s += Math.random().toString(36).slice(2, 8);
  return `Jeffery-${s.slice(0, 6)}`;
}

// ─── Effective price resolution ──────────────────────────────────────────────

export type EffectivePrice = {
  priceCents: number | null;
  source: "CUSTOMER" | "DEFAULT" | "QUOTE_REQUIRED";
};

/** CustomerPrice (org+product) overrides Product.defaultPriceCents. */
export function resolveEffectivePrice(
  defaultPriceCents: number | null,
  customPriceCents: number | null,
): EffectivePrice {
  if (customPriceCents !== null) return { priceCents: customPriceCents, source: "CUSTOMER" };
  if (defaultPriceCents !== null) return { priceCents: defaultPriceCents, source: "DEFAULT" };
  return { priceCents: null, source: "QUOTE_REQUIRED" };
}

/** Map of productId → negotiated priceCents for one org. */
export async function customerPriceMap(orgId: string): Promise<Map<string, number>> {
  const rows = await db.customerPrice.findMany({
    where: { orgId },
    select: { productId: true, priceCents: true },
  });
  return new Map(rows.map((r) => [r.productId, r.priceCents]));
}

/** Set of productIds approved (ProductAccess.approved) for one org. */
export async function approvedProductIds(orgId: string): Promise<Set<string>> {
  const rows = await db.productAccess.findMany({
    where: { orgId, approved: true },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

// ─── Input helpers ───────────────────────────────────────────────────────────

/** Trimmed single query-parameter value ("", never null). */
export function queryParam(req: Request, key: string): string {
  const url = new URL(req.url);
  return (url.searchParams.get(key) ?? "").trim();
}

/**
 * Optional string body field.
 * undefined = key absent; null = explicit null (clear); string = trimmed value.
 */
export function optionalStr(v: unknown, field: string, max = 500): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = str(v, field, { max });
  return s === "" ? null : s;
}

/**
 * Optional date body field ("YYYY-MM-DD" or full ISO).
 * undefined = absent; null/"" = clear; Date = parsed. Invalid → 422.
 */
export function optionalDate(v: unknown, field: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw new ApiError(`${field} must be a date (YYYY-MM-DD).`, 422);
  const raw = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(raw)) {
    throw new ApiError(`${field} must be a date (YYYY-MM-DD).`, 422);
  }
  // Noon anchor avoids day-shifting when the date is rendered in local zones.
  const d = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) throw new ApiError(`${field} must be a valid date.`, 422);
  return d;
}

/** Human key for an array element, used in validation messages. */
export function lineLabel(index: number, field: string): string {
  return `${field} ${index + 1}`;
}

// ─── Product create/update payload parsing ──────────────────────────────────

export type ProductInputData = {
  sku?: string;
  name?: string;
  categoryId?: string;
  shortDescription?: string;
  description?: string;
  material?: string | null;
  dimensions?: string | null;
  colour?: string | null;
  printingOptions?: string | null;
  casePack?: number;
  palletPack?: number | null;
  minOrderQty?: number;
  increment?: number;
  unit?: string;
  defaultPriceCents?: number | null;
  stockStatus?: string;
  leadTimeNote?: string | null;
};

/**
 * Validate a product payload. In "create" mode every required key must be
 * present; in "update" mode only provided keys are validated and returned.
 */
export function parseProductInput(
  body: Record<string, unknown>,
  mode: "create" | "update",
): ProductInputData {
  const req = mode === "create";
  const out: ProductInputData = {};
  if (req || body.sku !== undefined) out.sku = str(body.sku, "SKU", { required: true, max: 40 });
  if (req || body.name !== undefined) out.name = str(body.name, "Product name", { required: true, max: 160 });
  if (req || body.categoryId !== undefined) out.categoryId = str(body.categoryId, "Category", { required: true, max: 40 });
  if (req || body.shortDescription !== undefined) {
    out.shortDescription = str(body.shortDescription, "Short description", { required: true, max: 240 });
  }
  if (req || body.description !== undefined) {
    out.description = str(body.description, "Description", { required: true, max: 6000 });
  }
  if (body.material !== undefined) out.material = optionalStr(body.material, "Material", 160) ?? null;
  if (body.dimensions !== undefined) out.dimensions = optionalStr(body.dimensions, "Dimensions", 160) ?? null;
  if (body.colour !== undefined) out.colour = optionalStr(body.colour, "Colour", 80) ?? null;
  if (body.printingOptions !== undefined) out.printingOptions = optionalStr(body.printingOptions, "Printing options", 240) ?? null;
  if (req || body.casePack !== undefined) out.casePack = int(body.casePack, "Case pack", { min: 1 });
  if (body.palletPack !== undefined) {
    out.palletPack = body.palletPack === null ? null : int(body.palletPack, "Pallet pack", { min: 1 });
  }
  if (req || body.minOrderQty !== undefined) out.minOrderQty = int(body.minOrderQty, "Minimum order quantity", { min: 1 });
  if (req || body.increment !== undefined) out.increment = int(body.increment, "Quantity increment", { min: 1 });
  if (body.unit !== undefined) out.unit = str(body.unit, "Unit", { required: true, max: 24 });
  if (body.defaultPriceCents !== undefined) {
    out.defaultPriceCents = body.defaultPriceCents === null
      ? null
      : int(body.defaultPriceCents, "Default price (cents)", { min: 0 });
  }
  if (req || body.stockStatus !== undefined) {
    const s = str(body.stockStatus, "Stock status", { required: true, max: 30 });
    if (!STOCK_STATUS_SET.has(s)) throw new ApiError("Stock status must be IN_STOCK, MADE_TO_ORDER or ENQUIRY_ONLY.", 422);
    out.stockStatus = s;
  }
  if (body.leadTimeNote !== undefined) out.leadTimeNote = optionalStr(body.leadTimeNote, "Lead time note", 240) ?? null;
  return out;
}

// ─── Organization role guards ────────────────────────────────────────────────

import { ORG_WRITE_ROLES } from "@/lib/constants";
import type { SessionUser } from "@/lib/server/auth";

/** Throws unless the customer user may write (submit orders / changes / messages). */
export function requireOrgWrite(user: SessionUser & { orgId: string }): void {
  if (!ORG_WRITE_ROLES.has(user.orgRole)) {
    throw new ApiError(
      "Your account has read-only access. Ask your organization administrator or Jeffery Group for ordering permission.",
      403,
    );
  }
}

// ─── Update template rendering ───────────────────────────────────────────────

import type { TemplateRenderContext } from "@/types";

/** Replace {{placeholders}} in a template body with real values. */
export function renderTemplate(body: string, ctx: Partial<TemplateRenderContext>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => {
    const value = (ctx as Record<string, string | undefined>)[key];
    return value !== undefined && value !== "" ? value : match;
  });
}

// ─── Order change application ────────────────────────────────────────────────

import type { ChangeItem } from "@/types";

export type ApplyResult = {
  summary: string[]; // human-readable lines, e.g. "Carton 12×8×8: 500 → 750 units"
};

/**
 * Apply accepted change items to an order. Writes a history entry describing
 * exactly what changed and recomputes totals from the resulting items.
 * The submitted change request row (with pre-change values) is the preserved
 * record of the original — this function never destroys that audit trail.
 */
export async function applyChangeItems(
  orderId: string,
  orgId: string,
  items: ChangeItem[],
  actor: { id: string; name: string },
): Promise<ApplyResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new ApiError("Order not found.", 404);
  const summary: string[] = [];

  for (const change of items) {
    switch (change.kind) {
      case "QUANTITY": {
        if (!change.productId || !change.newQty) break;
        const item = order.items.find((i) => i.productId === change.productId);
        if (!item) break;
        await db.orderItem.update({
          where: { id: item.id },
          data: {
            qty: change.newQty,
            lineTotalCents: item.unitPriceCents * change.newQty,
          },
        });
        summary.push(`${item.name}: ${item.qty.toLocaleString("en-CA")} → ${change.newQty.toLocaleString("en-CA")} units`);
        break;
      }
      case "SPEC": {
        if (!change.productId) break;
        const item = order.items.find((i) => i.productId === change.productId);
        if (!item) break;
        const spec = { ...(item.specJson ? safeParseSpec(item.specJson) : {}) };
        if (change.spec) spec.custom = change.spec;
        await db.orderItem.update({
          where: { id: item.id },
          data: {
            specJson: JSON.stringify(spec),
            ...(change.note ? { note: change.note } : {}),
          },
        });
        summary.push(`${item.name}: specification updated${change.spec ? ` — ${change.spec}` : ""}`);
        break;
      }
      case "ADD": {
        const name = (change.name ?? "").trim();
        if (!name) break;
        let productId: string | null = null;
        let sku = "CUSTOM-REQ";
        let unitPriceCents = 0;
        if (change.productId) {
          const product = await db.product.findFirst({
            where: { id: change.productId, isActive: true, access: { some: { orgId, approved: true } } },
          });
          if (product) {
            productId = product.id;
            sku = product.sku;
            const custom = await db.customerPrice.findUnique({
              where: { orgId_productId: { orgId, productId: product.id } },
            });
            unitPriceCents = custom?.priceCents ?? product.defaultPriceCents ?? 0;
          }
        }
        const qty = change.newQty && change.newQty > 0 ? change.newQty : 1;
        await db.orderItem.create({
          data: {
            orderId,
            productId,
            sku,
            name,
            qty,
            unitPriceCents,
            lineTotalCents: unitPriceCents * qty,
            note: change.note ?? null,
            specJson: change.spec ? JSON.stringify({ custom: change.spec }) : null,
          },
        });
        summary.push(`Added ${name} × ${qty.toLocaleString("en-CA")}${unitPriceCents === 0 ? " (pricing to be confirmed)" : ""}`);
        break;
      }
      case "REMOVE": {
        if (!change.productId) break;
        const item = order.items.find((i) => i.productId === change.productId);
        if (!item) break;
        await db.orderItem.delete({ where: { id: item.id } });
        summary.push(`Removed ${item.name}`);
        break;
      }
      case "ADDRESS": {
        if (!change.newAddress) break;
        await db.order.update({ where: { id: orderId }, data: { shippingText: change.newAddress } });
        summary.push(`Delivery address updated`);
        break;
      }
      case "DATE": {
        if (!change.newDate) break;
        const d = new Date(`${change.newDate.slice(0, 10)}T12:00:00`);
        if (Number.isNaN(d.getTime())) break;
        await db.order.update({ where: { id: orderId }, data: { requestedDeliveryDate: d } });
        summary.push(`Requested delivery date changed to ${change.newDate}`);
        break;
      }
      case "CANCEL": {
        await db.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
        await db.orderStatusHistory.create({
          data: {
            orderId,
            status: "CANCELLED",
            note: "Cancelled via accepted customer change request",
            byUserId: actor.id,
            byName: `${actor.name} (change request)`,
          },
        });
        summary.push(`Order cancelled`);
        break;
      }
      case "OTHER": {
        if (change.note) {
          await db.order.update({
            where: { id: orderId },
            data: { notes: [order.notes, change.note].filter(Boolean).join("\n\n") },
          });
          summary.push(`Note appended to order`);
        }
        break;
      }
    }
  }

  // Recompute totals from the resulting item set.
  const finalItems = await db.orderItem.findMany({ where: { orderId } });
  const subtotalCents = finalItems.reduce((s, i) => s + i.lineTotalCents, 0);
  const taxCents = Math.round((subtotalCents * order.taxRateBp) / 10_000);
  await db.order.update({
    where: { id: orderId },
    data: { subtotalCents, taxCents, totalCents: subtotalCents + taxCents },
  });

  if (summary.length > 0 && !items.some((c) => c.kind === "CANCEL")) {
    await db.orderStatusHistory.create({
      data: {
        orderId,
        status: order.status,
        note: `Change applied — ${summary.join("; ")}`,
        byUserId: actor.id,
        byName: actor.name,
      },
    });
  }

  return { summary };
}

function safeParseSpec(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

// ─── Shipping text helper ─────────────────────────────────────────────────────

export function shippingLine(address: {
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postal: string;
}): string {
  return `${address.label} — ${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city}, ${address.province}, ${address.postal}`;
}
