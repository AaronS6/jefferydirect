// Shared payload validators for the customer Smart Order Builder surface:
// per-line specification objects, honest metadata-only attachment references
// and saved-draft payloads. Private module (underscore prefix) — the App
// Router never routes it; it exists purely so the order, draft and attachment
// route handlers validate identical shapes.

import { ApiError, int, str } from "@/lib/server/api";
import { optionalStr } from "@/lib/server/service";
import type { AttachmentMeta, DraftLine, LineSpecs, OrderDraftPayload } from "@/types";

export const MAX_ORDER_LINES = 40;
export const MAX_LINE_ATTACHMENTS = 10;
export const MAX_DRAFTS = 20;
export const MAX_QTY = 1_000_000;

const SPEC_KEYS: (keyof LineSpecs)[] = [
  "dimensions",
  "length",
  "width",
  "height",
  "material",
  "thickness",
  "printing",
  "colour",
  "qtyPerCase",
  "custom",
];

/**
 * Per-line specification object (LineSpecs). Unknown keys are ignored so the
 * client can never smuggle arbitrary JSON into the spec blob; every kept value
 * must be text. Returns null when nothing usable was supplied.
 */
export function parseSpecs(v: unknown, field: string): LineSpecs | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError(`${field} must be an object.`, 422);
  }
  const rec = v as Record<string, unknown>;
  const out: LineSpecs = {};
  for (const key of SPEC_KEYS) {
    const value = rec[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      throw new ApiError(`${field} ${key} must be text.`, 422);
    }
    const s = str(value, `${field} ${key}`, { max: 500 });
    if (s) out[key] = s;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Attachment references — metadata only (name + human size + optional note).
 * File contents are never uploaded; the registry is the record of what the
 * customer says they can provide on request.
 */
export function parseAttachmentMetas(v: unknown, field: string, max: number): AttachmentMeta[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ApiError(`${field} must be a list.`, 422);
  if (v.length > max) throw new ApiError(`${field} can include at most ${max} file reference(s).`, 422);
  return v.map((raw, i) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ApiError(`${field} ${i + 1} is invalid.`, 422);
    }
    const rec = raw as Record<string, unknown>;
    const name = str(rec.name, `${field} ${i + 1} name`, { required: true, max: 160 });
    const sizeLabel = str(rec.sizeLabel, `${field} ${i + 1} size`, { max: 24 }) || "—";
    const note = optionalStr(rec.note, `${field} ${i + 1} note`, 500);
    return { name, sizeLabel, ...(note ? { note } : {}) };
  });
}

/**
 * Per-line specJson storage shape. The customer-facing serializer reads the
 * spec fields flat from this blob, so specs are spread at the top level;
 * attachment references ride under an "attachments" key of the same object.
 * Null when the line carries neither specs nor attachments.
 */
export function buildSpecJson(
  specs: LineSpecs | null,
  attachments: AttachmentMeta[],
): string | null {
  if (!specs && attachments.length === 0) return null;
  return JSON.stringify({
    ...(specs ?? {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}

// ─── Saved-draft payload ──────────────────────────────────────────────────────

function record(raw: unknown, field: string): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(`${field} must be an object.`, 422);
  }
  return raw as Record<string, unknown>;
}

function positiveInt(v: unknown, field: string, fallback: number): number {
  if (v === undefined || v === null) return fallback;
  const n = int(v, field, { min: 1 });
  if (n > MAX_QTY) throw new ApiError(`${field} cannot exceed ${MAX_QTY.toLocaleString("en-CA")}.`, 422);
  return n;
}

function parseDraftLine(raw: unknown, index: number): DraftLine {
  const rec = record(raw, `Draft line ${index + 1}`);
  return {
    productId: optionalStr(rec.productId, `Draft line ${index + 1} product`, 40) ?? null,
    sku: optionalStr(rec.sku, `Draft line ${index + 1} SKU`, 40) ?? "CUSTOM-REQ",
    name: str(rec.name, `Draft line ${index + 1} name`, { required: true, max: 160 }),
    qty: positiveInt(rec.qty, `Draft line ${index + 1} quantity`, 1),
    unitPriceCents:
      rec.unitPriceCents === undefined || rec.unitPriceCents === null
        ? null
        : int(rec.unitPriceCents, `Draft line ${index + 1} unit price`, { min: 0 }),
    minOrderQty: positiveInt(rec.minOrderQty, `Draft line ${index + 1} minimum quantity`, 1),
    increment: positiveInt(rec.increment, `Draft line ${index + 1} increment`, 1),
    casePack: positiveInt(rec.casePack, `Draft line ${index + 1} case pack`, 1),
    unit: optionalStr(rec.unit, `Draft line ${index + 1} unit`, 24) ?? "each",
    note: optionalStr(rec.note, `Draft line ${index + 1} note`, 500) ?? null,
    specs: parseSpecs(rec.specs, `Draft line ${index + 1} specifications`),
    attachments: parseAttachmentMetas(rec.attachments, `Draft line ${index + 1} attachments`, MAX_LINE_ATTACHMENTS),
    customDescription: optionalStr(rec.customDescription, `Draft line ${index + 1} description`, 2000) ?? null,
  };
}

function parseDraftDelivery(raw: unknown): OrderDraftPayload["delivery"] {
  if (raw === undefined || raw === null) {
    return { addressId: null, requestedDeliveryDate: null, notes: null };
  }
  const rec = record(raw, "Draft delivery details");
  const date = optionalStr(rec.requestedDeliveryDate, "Draft requested delivery date", 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError("Draft requested delivery date must be a date (YYYY-MM-DD).", 422);
  }
  return {
    addressId: optionalStr(rec.addressId, "Draft delivery address", 40) ?? null,
    requestedDeliveryDate: date ?? null,
    notes: optionalStr(rec.notes, "Draft delivery notes", 2000) ?? null,
  };
}

function parseDraftReference(raw: unknown): OrderDraftPayload["reference"] {
  if (raw === undefined || raw === null) {
    return { poNumber: null, specialInstructions: null };
  }
  const rec = record(raw, "Draft reference details");
  return {
    poNumber: optionalStr(rec.poNumber, "Draft PO number", 60) ?? null,
    specialInstructions: optionalStr(rec.specialInstructions, "Draft special instructions", 2000) ?? null,
  };
}

/**
 * Validate a full draft payload (OrderDraftPayload shape). Lines are the only
 * hard requirement — every other section falls back to its empty default.
 */
export function parseDraftPayload(raw: unknown): OrderDraftPayload {
  if (raw === undefined || raw === null) {
    throw new ApiError("Draft payload is required.", 422);
  }
  const rec = record(raw, "Draft payload");
  if (!Array.isArray(rec.lines)) throw new ApiError("Draft lines must be a list.", 422);
  if (rec.lines.length > MAX_ORDER_LINES) {
    throw new ApiError(`A draft can hold at most ${MAX_ORDER_LINES} lines.`, 422);
  }
  return {
    lines: rec.lines.map((line, i) => parseDraftLine(line, i)),
    delivery: parseDraftDelivery(rec.delivery),
    reference: parseDraftReference(rec.reference),
    attachments: parseAttachmentMetas(rec.attachments, "Draft attachments", MAX_LINE_ATTACHMENTS),
  };
}
