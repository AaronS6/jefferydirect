// DTO serializers — map Prisma rows onto the exact shapes declared in
// src/types/index.ts. Structural input types keep these decoupled from
// Prisma's generated payload types (any include result that satisfies the
// shape can be passed in).

import type {
  AddressDto,
  AttachmentMeta,
  CategoryDto,
  ChangeItem,
  ChangeRequestDto,
  DocumentDto,
  InternalNoteDto,
  LineSpecs,
  MessageDto,
  NotificationDto,
  OrderDetail,
  OrderDraftDto,
  OrderDraftPayload,
  OrderItemDto,
  OrderListItem,
  OrderUpdateDto,
  OrgPreferences,
  ProductDetail,
  ProductListItem,
  QuotationDetail,
  QuotationItemDto,
  QuotationListItem,
  SavedProductDto,
  SessionInfo,
  UpdateTemplateDto,
} from "@/types";

// ─── Session ──────────────────────────────────────────────────────────────────

export function parseNotifyPrefs(json: string | null | undefined): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(json ?? "{}");
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "boolean") out[k] = v;
      }
      return out;
    }
  } catch {
    // fall through to empty prefs
  }
  return {};
}

export function parseJson<T>(json: string | null | undefined, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(json ?? "null");
    if (parsed !== null && typeof parsed === "object") return parsed as T;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export function parseSpecJson(json: string | null | undefined): LineSpecs | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      // "attachments" rides in the same blob — never part of the spec fields.
      const { attachments: _attachments, ...specs } = parsed as Record<string, unknown>;
      return specs as LineSpecs;
    }
  } catch {
    // fall through
  }
  return null;
}

function sanitizeAttachments(list: unknown[]): AttachmentMeta[] {
  return list
    .filter(
      (a): a is AttachmentMeta =>
        a !== null && typeof a === "object" && typeof (a as AttachmentMeta).name === "string",
    )
    .map((a) => ({
      name: a.name,
      sizeLabel: typeof a.sizeLabel === "string" ? a.sizeLabel : "—",
      ...(typeof a.note === "string" ? { note: a.note } : {}),
    }));
}

export function parseAttachmentsJson(json: string | null | undefined): AttachmentMeta[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    // Two supported shapes: a bare array, or { ...flatSpecs, attachments: [...] }
    if (Array.isArray(parsed)) return sanitizeAttachments(parsed);
    if (parsed !== null && typeof parsed === "object" && Array.isArray((parsed as { attachments?: unknown }).attachments)) {
      return sanitizeAttachments((parsed as { attachments: unknown[] }).attachments);
    }
  } catch {
    // fall through
  }
  return [];
}

export function parseChangeItems(json: string | null | undefined): ChangeItem[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((c) => c !== null && typeof c === "object") as ChangeItem[];
  } catch {
    // fall through
  }
  return [];
}

export function parseOrgPreferences(json: string | null | undefined): OrgPreferences | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as OrgPreferences;
    }
  } catch {
    // fall through
  }
  return null;
}

export type SessionOrg = {
  id: string;
  code: string;
  name: string;
  status: string;
  billingLine1: string;
  billingCity: string;
  billingProvince: string;
  billingPostal: string;
  phone: string;
};

export type SessionUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  title: string | null;
  phone: string | null;
  notifyPrefs: string;
  orgRole: string;
};

export function serializeSession(user: SessionUserRow, organization: SessionOrg | null | undefined): SessionInfo {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
      title: user.title,
      phone: user.phone,
      orgRole:
        user.role === "ADMIN"
          ? "ORG_ADMIN"
          : user.orgRole === "PURCHASING" || user.orgRole === "READONLY"
            ? user.orgRole
            : "ORG_ADMIN",
      notifyPrefs: parseNotifyPrefs(user.notifyPrefs),
    },
    organization: organization
      ? {
          id: organization.id,
          code: organization.code,
          name: organization.name,
          status: organization.status,
          billingLine1: organization.billingLine1,
          billingCity: organization.billingCity,
          billingProvince: organization.billingProvince,
          billingPostal: organization.billingPostal,
          phone: organization.phone,
        }
      : null,
  };
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function serializeCategory(c: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}): CategoryDto {
  return { id: c.id, name: c.name, slug: c.slug, description: c.description };
}

// ─── Products ────────────────────────────────────────────────────────────────

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  dimensions: string | null;
  material: string | null;
  colour: string | null;
  printingOptions: string | null;
  casePack: number;
  palletPack: number | null;
  minOrderQty: number;
  increment: number;
  unit: string;
  stockStatus: string;
  leadTimeNote: string | null;
  isActive: boolean;
  defaultPriceCents: number | null;
  createdAt: Date;
  category: { name: string };
};

export type PriceResolution = {
  priceCents: number | null;
  source: "CUSTOMER" | "DEFAULT" | "QUOTE_REQUIRED";
};

export function serializeProduct(p: ProductRow, price: PriceResolution): ProductListItem {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    categoryId: p.categoryId,
    categoryName: p.category.name,
    shortDescription: p.shortDescription,
    dimensions: p.dimensions,
    material: p.material,
    colour: p.colour,
    casePack: p.casePack,
    unit: p.unit,
    minOrderQty: p.minOrderQty,
    increment: p.increment,
    stockStatus: p.stockStatus,
    priceCents: price.priceCents,
    priceSource: price.source,
  };
}

export function serializeProductDetail(p: ProductRow, price: PriceResolution): ProductDetail {
  return {
    ...serializeProduct(p, price),
    description: p.description,
    printingOptions: p.printingOptions,
    palletPack: p.palletPack,
    leadTimeNote: p.leadTimeNote,
    isActive: p.isActive,
  };
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export function orderItemSummary(items: { qty: number }[]): {
  itemCount: number;
  totalUnits: number;
  itemSummary: string;
} {
  const itemCount = items.length;
  const totalUnits = items.reduce((sum, i) => sum + i.qty, 0);
  return {
    itemCount,
    totalUnits,
    itemSummary: `${itemCount} product${itemCount === 1 ? "" : "s"} · ${totalUnits.toLocaleString("en-CA")} units`,
  };
}

export type OrderListRow = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  totalCents: number;
  estimatedDelivery: Date | null;
  nextUpdateDate?: Date | null;
  sourceType?: string;
  items: { qty: number }[];
  organization?: { name: string; code: string } | null;
  changeRequests?: { status: string }[];
};

export function serializeOrderListItem(o: OrderListRow): OrderListItem {
  const pending = (o.changeRequests ?? []).some((c) => c.status === "PENDING");
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    ...orderItemSummary(o.items),
    totalCents: o.totalCents,
    estimatedDelivery: o.estimatedDelivery ? o.estimatedDelivery.toISOString() : null,
    nextUpdateDate: o.nextUpdateDate ? o.nextUpdateDate.toISOString() : null,
    ...(o.organization ? { orgName: o.organization.name, orgCode: o.organization.code } : {}),
    ...(o.sourceType ? { sourceType: o.sourceType } : {}),
    ...(o.changeRequests ? { hasPendingChangeRequest: pending } : {}),
  };
}

export type OrderItemRow = {
  id: string;
  productId: string | null;
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  note: string | null;
  specJson: string | null;
};

export type DocumentRow = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  fileName: string;
  sizeLabel: string;
  version: number;
  uploadedBy: string;
  createdAt: Date;
  orgId: string;
  orderId: string | null;
  quotationId: string | null;
  order?: { orderNumber: string } | null;
  quotation?: { quoteNumber: string } | null;
  organization?: { name: string } | null;
};

export function serializeDocument(d: DocumentRow): DocumentDto {
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    description: d.description,
    fileName: d.fileName,
    sizeLabel: d.sizeLabel,
    version: d.version,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
    orgId: d.orgId,
    ...(d.organization ? { orgName: d.organization.name } : {}),
    orderId: d.orderId,
    orderNumber: d.order?.orderNumber ?? null,
    quotationId: d.quotationId,
    quoteNumber: d.quotation?.quoteNumber ?? null,
  };
}

export type OrderHistoryRow = {
  id: string;
  status: string;
  note: string | null;
  byName: string | null;
  createdAt: Date;
};

export type OrderUpdateRow = {
  id: string;
  title: string;
  category: string;
  newStatus: string | null;
  message: string;
  estimatedDelivery: Date | null;
  revisedDelivery: Date | null;
  nextUpdateDate: Date | null;
  attachmentsJson: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorName: string;
};

export function serializeOrderUpdate(u: OrderUpdateRow): OrderUpdateDto {
  return {
    id: u.id,
    title: u.title,
    category: u.category,
    newStatus: u.newStatus,
    message: u.message,
    estimatedDelivery: u.estimatedDelivery ? u.estimatedDelivery.toISOString() : null,
    revisedDelivery: u.revisedDelivery ? u.revisedDelivery.toISOString() : null,
    nextUpdateDate: u.nextUpdateDate ? u.nextUpdateDate.toISOString() : null,
    attachments: parseAttachmentsJson(u.attachmentsJson),
    isPublished: u.isPublished,
    publishedAt: u.publishedAt ? u.publishedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    authorName: u.authorName,
  };
}

export type InternalNoteRow = {
  id: string;
  body: string;
  authorName: string;
  createdAt: Date;
};

export function serializeInternalNote(n: InternalNoteRow): InternalNoteDto {
  return {
    id: n.id,
    body: n.body,
    authorName: n.authorName,
    createdAt: n.createdAt.toISOString(),
  };
}

export type ChangeRequestRow = {
  id: string;
  status: string;
  requestNote: string | null;
  changesJson: string;
  requestedByName: string;
  createdAt: Date;
  adminName: string | null;
  decisionNote: string | null;
  decidedAt: Date | null;
  counterJson: string | null;
  counterDecision: string | null;
  counterDecidedAt: Date | null;
  updatedAt: Date;
  order?: { id: string; orderNumber: string; organization?: { name: string } | null } | null;
};

export function serializeChangeRequest(c: ChangeRequestRow): ChangeRequestDto {
  return {
    id: c.id,
    status: c.status,
    requestNote: c.requestNote,
    changes: parseChangeItems(c.changesJson),
    requestedByName: c.requestedByName,
    createdAt: c.createdAt.toISOString(),
    adminName: c.adminName,
    decisionNote: c.decisionNote,
    decidedAt: c.decidedAt ? c.decidedAt.toISOString() : null,
    counter: c.counterJson ? parseChangeItems(c.counterJson) : null,
    counterNote: c.decisionNote, // decision note doubles as the counter explanation
    counterDecision: c.counterDecision,
    counterDecidedAt: c.counterDecidedAt ? c.counterDecidedAt.toISOString() : null,
    appliedAt: c.status === "ACCEPTED" && c.decidedAt ? c.decidedAt.toISOString() : null,
    orderId: c.order?.id ?? "",
    orderNumber: c.order?.orderNumber ?? "",
    ...(c.order?.organization ? { orgName: c.order.organization.name } : {}),
  };
}

export type OrderDetailRow = {
  id: string;
  orderNumber: string;
  status: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
  subtotalCents: number;
  taxCents: number;
  taxRateBp: number;
  totalCents: number;
  shippingText: string;
  poNumber: string | null;
  notes: string | null;
  requestedDelivery: string | null;
  estimatedDelivery: Date | null;
  trackingNumber: string | null;
  reorderSource: string | null;
  requestedDeliveryDate: Date | null;
  estimatedDispatch: Date | null;
  revisedDeliveryDate: Date | null;
  nextUpdateDate: Date | null;
  actualDeliveryDate: Date | null;
  sourceType: string;
  recordedByName: string | null;
  organization: { name: string; code: string };
  user: { name: string };
  items: OrderItemRow[];
  history: OrderHistoryRow[];
  documents: DocumentRow[];
  updates: OrderUpdateRow[];
  changeRequests: ChangeRequestRow[];
  internalNotes?: InternalNoteRow[];
};

export function serializeOrderDetail(o: OrderDetailRow, opts?: { includeInternal?: boolean }): OrderDetail {
  const items: OrderItemDto[] = o.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    sku: i.sku,
    name: i.name,
    qty: i.qty,
    unitPriceCents: i.unitPriceCents,
    lineTotalCents: i.lineTotalCents,
    note: i.note,
    specs: parseSpecJson(i.specJson),
    attachments: parseAttachmentsJson(i.specJson),
  }));
  const history = [...o.history]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      byName: h.byName,
      createdAt: h.createdAt.toISOString(),
    }));
  const documents = o.documents
    .map((d) => ({
      ...serializeDocument(d),
      // Documents listed inside an order always reference that order.
      orderNumber: o.orderNumber,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const updates = [...o.updates]
    .sort((a, b) => {
      const at = (u: OrderUpdateRow) => (u.publishedAt ?? u.createdAt).getTime();
      return at(b) - at(a);
    })
    .map(serializeOrderUpdate);
  const changeRequests = [...o.changeRequests]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((c) => serializeChangeRequest({ ...c, order: { id: o.id, orderNumber: o.orderNumber } }));
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    orgId: o.orgId,
    orgName: o.organization.name,
    orgCode: o.organization.code,
    submittedBy: o.user.name,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    items,
    subtotalCents: o.subtotalCents,
    taxCents: o.taxCents,
    taxRateBp: o.taxRateBp,
    totalCents: o.totalCents,
    shippingText: o.shippingText,
    poNumber: o.poNumber,
    notes: o.notes,
    requestedDelivery: o.requestedDelivery,
    estimatedDelivery: o.estimatedDelivery ? o.estimatedDelivery.toISOString() : null,
    trackingNumber: o.trackingNumber,
    reorderSource: o.reorderSource,
    requestedDeliveryDate: o.requestedDeliveryDate ? o.requestedDeliveryDate.toISOString() : null,
    estimatedDispatch: o.estimatedDispatch ? o.estimatedDispatch.toISOString() : null,
    revisedDeliveryDate: o.revisedDeliveryDate ? o.revisedDeliveryDate.toISOString() : null,
    nextUpdateDate: o.nextUpdateDate ? o.nextUpdateDate.toISOString() : null,
    actualDeliveryDate: o.actualDeliveryDate ? o.actualDeliveryDate.toISOString() : null,
    sourceType: o.sourceType,
    recordedByName: o.recordedByName,
    history,
    documents,
    updates,
    changeRequests,
    ...(opts?.includeInternal
      ? { internalNotes: [...(o.internalNotes ?? [])].map(serializeInternalNote) }
      : {}),
  };
}

// ─── Quotations ───────────────────────────────────────────────────────────────

export type QuotationListRow = {
  id: string;
  quoteNumber: string;
  status: string;
  revision: number;
  kind: string;
  title: string;
  category: string | null;
  quantity: string | null;
  itemsTotalCents: number;
  createdAt: Date;
  issuedAt: Date | null;
  expiryDate: Date | null;
  respondedAt: Date | null;
  organization?: { name: string } | null;
};

export function serializeQuotationListItem(q: QuotationListRow): QuotationListItem {
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    status: q.status,
    revision: q.revision,
    kind: q.kind,
    title: q.title,
    category: q.category,
    quantity: q.quantity,
    itemsTotalCents: q.itemsTotalCents,
    createdAt: q.createdAt.toISOString(),
    issuedAt: q.issuedAt ? q.issuedAt.toISOString() : null,
    expiryDate: q.expiryDate ? q.expiryDate.toISOString() : null,
    respondedAt: q.respondedAt ? q.respondedAt.toISOString() : null,
    ...(q.organization ? { orgName: q.organization.name } : {}),
  };
}

export type QuotationItemRow = {
  id: string;
  description: string;
  kind: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type QuotationDetailRow = {
  id: string;
  quoteNumber: string;
  status: string;
  revision: number;
  kind: string;
  orgId: string;
  createdAt: Date;
  issuedAt: Date | null;
  respondedAt: Date | null;
  respondedNote: string | null;
  title: string;
  category: string | null;
  productName: string | null;
  dimensions: string | null;
  material: string | null;
  colour: string | null;
  printing: string | null;
  quantity: string | null;
  neededBy: string | null;
  destination: string | null;
  specs: string | null;
  comments: string | null;
  itemsTotalCents: number;
  expiryDate: Date | null;
  terms: string | null;
  internalNote: string | null;
  sourceType?: string;
  recordedByName?: string | null;
  organization: { name: string; code: string };
  user: { name: string };
  items: QuotationItemRow[];
};

export function serializeQuotationDetail(q: QuotationDetailRow): QuotationDetail {
  const items: QuotationItemDto[] = q.items.map((i) => ({
    id: i.id,
    description: i.description,
    kind: i.kind,
    qty: i.qty,
    unitPriceCents: i.unitPriceCents,
    lineTotalCents: i.lineTotalCents,
  }));
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    status: q.status,
    revision: q.revision,
    kind: q.kind,
    orgId: q.orgId,
    orgName: q.organization.name,
    orgCode: q.organization.code,
    requestedBy: q.user.name,
    createdAt: q.createdAt.toISOString(),
    issuedAt: q.issuedAt ? q.issuedAt.toISOString() : null,
    respondedAt: q.respondedAt ? q.respondedAt.toISOString() : null,
    respondedNote: q.respondedNote,
    title: q.title,
    category: q.category,
    productName: q.productName,
    dimensions: q.dimensions,
    material: q.material,
    colour: q.colour,
    printing: q.printing,
    quantity: q.quantity,
    neededBy: q.neededBy,
    destination: q.destination,
    specs: q.specs,
    comments: q.comments,
    itemsTotalCents: q.itemsTotalCents,
    expiryDate: q.expiryDate ? q.expiryDate.toISOString() : null,
    terms: q.terms,
    internalNote: q.internalNote,
    ...(q.sourceType ? { sourceType: q.sourceType } : {}),
    ...(q.recordedByName !== undefined ? { recordedByName: q.recordedByName } : {}),
    items,
  };
}

// ─── Notifications & messages ─────────────────────────────────────────────────

export function serializeNotification(n: {
  id: string;
  audience: string;
  title: string;
  body: string;
  kind: string;
  view: string | null;
  relatedId: string | null;
  isRead: boolean;
  createdAt: Date;
}): NotificationDto {
  return {
    id: n.id,
    audience: n.audience,
    title: n.title,
    body: n.body,
    kind: n.kind,
    view: n.view,
    relatedId: n.relatedId,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

export type MessageRow = {
  id: string;
  subject: string;
  category: string;
  body: string;
  status: string;
  reply: string | null;
  repliedAt: Date | null;
  repliedBy: string | null;
  createdAt: Date;
  orderId: string | null;
  order?: { orderNumber: string } | null;
  user: { name: string };
  organization?: { name: string } | null;
};

export function serializeMessage(m: MessageRow): MessageDto {
  return {
    id: m.id,
    subject: m.subject,
    category: m.category,
    body: m.body,
    status: m.status,
    reply: m.reply,
    repliedAt: m.repliedAt ? m.repliedAt.toISOString() : null,
    repliedBy: m.repliedBy,
    createdAt: m.createdAt.toISOString(),
    orderId: m.orderId,
    orderNumber: m.order?.orderNumber ?? null,
    authorName: m.user.name,
    ...(m.organization ? { orgName: m.organization.name } : {}),
  };
}

// ─── Update templates ─────────────────────────────────────────────────────────

export type UpdateTemplateRow = {
  id: string;
  title: string;
  category: string;
  body: string;
  isDefault: boolean;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeTemplate(t: UpdateTemplateRow): UpdateTemplateDto {
  return {
    id: t.id,
    title: t.title,
    category: t.category,
    body: t.body,
    isDefault: t.isDefault,
    createdByName: t.createdByName,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ─── Saved products ──────────────────────────────────────────────────────────

export type SavedProductRow = {
  id: string;
  productId: string;
  qty: number;
  note: string | null;
  createdAt: Date;
  product: {
    sku: string;
    name: string;
    unit: string;
    minOrderQty: number;
    increment: number;
    casePack: number;
    stockStatus: string;
    isActive: boolean;
    defaultPriceCents: number | null;
  };
};

export type SavedPriceResolution = {
  priceCents: number | null;
  source: "CUSTOMER" | "DEFAULT" | "QUOTE_REQUIRED";
};

export function serializeSavedProduct(
  s: SavedProductRow,
  price: SavedPriceResolution,
  approved: boolean,
): SavedProductDto {
  return {
    id: s.id,
    productId: s.productId,
    sku: s.product.sku,
    name: s.product.name,
    qty: s.qty,
    note: s.note,
    priceCents: price.priceCents,
    priceSource: price.source,
    stockStatus: s.product.stockStatus,
    available: approved && s.product.isActive,
    unit: s.product.unit,
    minOrderQty: s.product.minOrderQty,
    increment: s.product.increment,
    casePack: s.product.casePack,
    createdAt: s.createdAt.toISOString(),
  };
}

// ─── Order drafts ────────────────────────────────────────────────────────────

export type OrderDraftRow = {
  id: string;
  name: string;
  payload: string;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeDraft(d: OrderDraftRow): OrderDraftDto {
  let payload: OrderDraftPayload = { lines: [], delivery: { addressId: null, requestedDeliveryDate: null, notes: null }, reference: { poNumber: null, specialInstructions: null }, attachments: [] };
  try {
    const parsed: unknown = JSON.parse(d.payload);
    if (parsed !== null && typeof parsed === "object" && Array.isArray((parsed as OrderDraftPayload).lines)) {
      payload = parsed as OrderDraftPayload;
    }
  } catch {
    // keep empty payload
  }
  return {
    id: d.id,
    name: d.name,
    payload,
    lineCount: payload.lines.length,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// ─── Addresses ────────────────────────────────────────────────────────────────

export type AddressRow = {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postal: string;
  isDefault: boolean;
  approvalStatus: string;
  requestedByName: string | null;
  requestedAt: Date | null;
  reviewNote: string | null;
};

export function serializeAddress(a: AddressRow): AddressDto {
  return {
    id: a.id,
    label: a.label,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    province: a.province,
    postal: a.postal,
    isDefault: a.isDefault,
    approvalStatus: a.approvalStatus,
    requestedByName: a.requestedByName,
    requestedAt: a.requestedAt ? a.requestedAt.toISOString() : null,
    reviewNote: a.reviewNote,
  };
}
