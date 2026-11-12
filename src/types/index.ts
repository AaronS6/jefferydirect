// ClientHub canonical shared types — THE contract between the API layer and
// every frontend view. All monetary values are integer cents (CAD).

// ─── Session / auth extensions ───────────────────────────────────────────────

export type SessionInfo = {
  user: {
    id: string;
    email: string;
    name: string;
    role: "ADMIN" | "CUSTOMER";
    title: string | null;
    phone: string | null;
    orgRole: "ORG_ADMIN" | "PURCHASING" | "READONLY";
    notifyPrefs: Record<string, boolean>;
  };
  organization: {
    id: string;
    code: string;
    name: string;
    status: string;
    billingLine1: string;
    billingCity: string;
    billingProvince: string;
    billingPostal: string;
    phone: string;
  } | null;
};

// ─── Catalogue ───────────────────────────────────────────────────────────────

export type CategoryDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  shortDescription: string;
  dimensions: string | null;
  material: string | null;
  colour: string | null;
  casePack: number;
  unit: string;
  minOrderQty: number;
  increment: number;
  stockStatus: string;
  // Effective price for the viewing customer (null → quotation required)
  priceCents: number | null;
  priceSource: "CUSTOMER" | "DEFAULT" | "QUOTE_REQUIRED";
};

export type ProductDetail = ProductListItem & {
  description: string;
  printingOptions: string | null;
  palletPack: number | null;
  leadTimeNote: string | null;
  isActive: boolean;
};

// ─── Cart (client-side) ──────────────────────────────────────────────────────

export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number; // customer's effective price
  qty: number;
  minOrderQty: number;
  increment: number;
  casePack: number;
  unit: string;
};

export type OrderDraftLine = CartLine & {
  unavailable?: boolean; // product discontinued / no longer approved
  note?: string;
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  itemSummary: string; // "3 products · 2,400 units"
  totalUnits: number;
  totalCents: number;
  estimatedDelivery: string | null;
  orgName?: string; // admin views only
  orgCode?: string; // admin views only
  sourceType?: string; // admin views only (PORTAL | EMAIL | PHONE | IN_PERSON)
  nextUpdateDate?: string | null; // present when set (both audiences)
  hasPendingChangeRequest?: boolean; // admin listings
};

export type LineSpecs = {
  dimensions?: string;
  length?: string;
  width?: string;
  height?: string;
  material?: string;
  thickness?: string;
  printing?: string;
  colour?: string;
  qtyPerCase?: string;
  custom?: string;
};

export type AttachmentMeta = {
  name: string;
  sizeLabel: string;
  note?: string;
};

export type OrderItemDto = {
  id: string;
  productId: string | null;
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  note: string | null;
  specs: LineSpecs | null;
  attachments: AttachmentMeta[]; // per-line attachment registry (metadata)
};

export type OrderHistoryEntry = {
  id: string;
  status: string;
  note: string | null;
  byName: string | null;
  createdAt: string;
};

// Customer-facing progress update (admin also sees unpublished drafts)
export type OrderUpdateDto = {
  id: string;
  title: string;
  category: string;
  newStatus: string | null;
  message: string;
  estimatedDelivery: string | null;
  revisedDelivery: string | null;
  nextUpdateDate: string | null;
  attachments: AttachmentMeta[];
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
};

export type InternalNoteDto = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type ChangeItem = {
  kind: "QUANTITY" | "SPEC" | "ADD" | "REMOVE" | "ADDRESS" | "DATE" | "CANCEL" | "OTHER";
  productId?: string | null;
  sku?: string | null;
  name?: string | null;
  currentQty?: number | null;
  newQty?: number | null;
  spec?: string | null; // description of the requested specification change
  newAddress?: string | null;
  newDate?: string | null; // ISO date for requested delivery change
  note?: string | null;
};

export type ChangeRequestDto = {
  id: string;
  status: string; // PENDING | ACCEPTED | DECLINED | COUNTERED | WITHDRAWN
  requestNote: string | null;
  changes: ChangeItem[]; // exactly what was requested (pre-change values preserved)
  requestedByName: string;
  createdAt: string;
  adminName: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  counter: ChangeItem[] | null; // administrator's alternative proposal
  counterNote: string | null;
  counterDecision: string | null; // customer's response to the counter
  counterDecidedAt: string | null;
  orderId: string;
  orderNumber: string; // for listings
  orgName?: string; // admin listings
  appliedAt: string | null; // when the accepted change was applied to the order
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  orgId: string;
  orgName: string;
  orgCode: string;
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  subtotalCents: number;
  taxCents: number;
  taxRateBp: number;
  totalCents: number;
  shippingText: string;
  poNumber: string | null;
  notes: string | null;
  requestedDelivery: string | null;
  estimatedDelivery: string | null;
  trackingNumber: string | null;
  reorderSource: string | null;
  // ── Explicit milestone dates (never conflated) ──
  requestedDeliveryDate: string | null;
  estimatedDispatch: string | null;
  revisedDeliveryDate: string | null;
  nextUpdateDate: string | null;
  actualDeliveryDate: string | null;
  // ── Provenance ──
  sourceType: string;
  recordedByName: string | null;
  history: OrderHistoryEntry[];
  documents: DocumentDto[];
  // ── Update Centre / Change Requests ──
  updates: OrderUpdateDto[]; // customer: published only; admin: all incl. drafts
  changeRequests: ChangeRequestDto[]; // newest first
  internalNotes?: InternalNoteDto[]; // ADMIN ONLY — never sent to customer APIs
};

export type ReorderDraft = {
  sourceOrderNumber: string;
  lines: OrderDraftLine[];
};

// ─── Order drafts (saved, incomplete requests) ────────────────────────────────

export type DraftLine = {
  productId: string | null; // null ⇒ custom product request
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number | null; // null ⇒ pricing to be confirmed (custom)
  minOrderQty: number;
  increment: number;
  casePack: number;
  unit: string;
  note?: string | null;
  specs?: LineSpecs | null;
  attachments?: AttachmentMeta[];
  customDescription?: string | null; // for custom product requests
};

export type OrderDraftPayload = {
  lines: DraftLine[];
  delivery: {
    addressId: string | null;
    requestedDeliveryDate: string | null;
    notes: string | null;
  };
  reference: {
    poNumber: string | null;
    specialInstructions: string | null;
  };
  attachments: AttachmentMeta[]; // order-level attachments
};

export type OrderDraftDto = {
  id: string;
  name: string;
  payload: OrderDraftPayload;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
};

// ─── Quotations ──────────────────────────────────────────────────────────────

export type QuotationListItem = {
  id: string;
  quoteNumber: string;
  status: string;
  revision: number;
  /** QUOTE (default) | NEW_PRODUCT — a request for a product not in the catalogue */
  kind: string;
  title: string;
  category: string | null;
  quantity: string | null;
  itemsTotalCents: number;
  createdAt: string;
  issuedAt: string | null;
  expiryDate: string | null;
  respondedAt: string | null;
  orgName?: string; // admin views only
};

export type QuotationItemDto = {
  id: string;
  description: string;
  kind: string; // PRODUCT | SETUP | FREIGHT | OTHER
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type QuotationDetail = {
  id: string;
  quoteNumber: string;
  status: string;
  revision: number;
  /** QUOTE (default) | NEW_PRODUCT — a request for a product not in the catalogue */
  kind: string;
  orgId: string;
  orgName: string;
  orgCode: string;
  requestedBy: string;
  createdAt: string;
  issuedAt: string | null;
  respondedAt: string | null;
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
  expiryDate: string | null;
  terms: string | null;
  internalNote: string | null;
  sourceType?: string; // PORTAL | EMAIL | PHONE | IN_PERSON — present when recorded on behalf
  recordedByName?: string | null;
  items: QuotationItemDto[];
};

// ─── Documents ────────────────────────────────────────────────────────────────

export type DocumentDto = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  fileName: string;
  sizeLabel: string;
  version: number;
  uploadedBy: string;
  createdAt: string;
  orgId?: string; // admin listings across organizations
  orgName?: string; // admin listings across organizations
  orderId: string | null;
  orderNumber: string | null;
  quotationId: string | null;
  quoteNumber: string | null;
};

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationDto = {
  id: string;
  audience: string;
  title: string;
  body: string;
  kind: string;
  view: string | null;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
};

// ─── Messages / support ───────────────────────────────────────────────────────

export type MessageDto = {
  id: string;
  subject: string;
  category: string;
  body: string;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  repliedBy: string | null;
  createdAt: string;
  orderId: string | null;
  orderNumber: string | null;
  authorName: string;
  orgName?: string; // admin views only
};

// ─── Customer dashboard ──────────────────────────────────────────────────────

export type CustomerDashboard = {
  activeOrders: number;
  pendingQuotes: number;
  outstandingInvoices: number;
  openMessages: number;
  recentOrders: OrderListItem[];
  frequentlyOrdered: {
    productId: string;
    sku: string;
    name: string;
    lastQty: number;
    lastOrderDate: string;
    lastOrderNumber: string;
    priceCents: number | null;
    stockStatus: string;
  }[];
  activity: {
    id: string;
    title: string;
    detail: string | null;
    kind: string;
    createdAt: string;
  }[];
  // ── Update Centre additions ──
  nextExpectedUpdates: {
    orderId: string;
    orderNumber: string;
    status: string;
    nextUpdateDate: string;
  }[];
  latestUpdates: {
    id: string;
    orderId: string;
    orderNumber: string;
    title: string;
    category: string;
    publishedAt: string;
  }[];
};

// ─── Admin dashboard ──────────────────────────────────────────────────────────

export type AdminDashboard = {
  activeCustomers: number;
  newOrderRequests: number;
  pendingQuotations: number;
  confirmedOrders: number;
  inProduction: number;
  openMessages: number;
  outstandingInvoiceCents: number;
  recentOrders: OrderListItem[];
  pendingTasks: { id: string; kind: string; label: string; view: string; relatedId: string }[];
  activity: {
    id: string;
    title: string;
    detail: string | null;
    kind: string;
    createdAt: string;
  }[];
  ordersByWeek: { label: string; orders: number; requests: number }[];
};

// ─── Admin: customers ─────────────────────────────────────────────────────────

export type CustomerListItem = {
  id: string;
  code: string;
  name: string;
  status: string;
  primaryContact: string;
  contactEmail: string;
  phone: string;
  city: string;
  province: string;
  orderCount: number;
  lastOrderAt: string | null;
  createdAt: string;
};

// ─── Admin: products / pricing ────────────────────────────────────────────────

export type AdminProduct = ProductDetail & {
  defaultPriceCents: number | null;
  approvedOrgCount: number;
  customPriceCount: number;
};

export type PricingRow = {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  defaultPriceCents: number | null;
  customPriceCents: number | null;
  note: string | null;
  approved: boolean;
};

// ─── Admin: internal users ────────────────────────────────────────────────────

export type InternalUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  title: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
};

// ─── Update templates ─────────────────────────────────────────────────────────

export type UpdateTemplateDto = {
  id: string;
  title: string;
  category: string;
  body: string; // may contain {{placeholders}}
  isDefault: boolean;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateRenderContext = {
  customer_name: string;
  order_number: string;
  product_name: string;
  quantity: string;
  estimated_delivery: string;
  revised_delivery: string;
  admin_name: string;
};

// ─── Saved products (quick reorder) ──────────────────────────────────────────

export type SavedProductDto = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  qty: number;
  note: string | null;
  priceCents: number | null;
  priceSource: "CUSTOMER" | "DEFAULT" | "QUOTE_REQUIRED";
  stockStatus: string;
  available: boolean; // active + approved for the org
  unit: string;
  minOrderQty: number;
  increment: number;
  casePack: number;
  createdAt: string;
};

// ─── Customer address book ────────────────────────────────────────────────────

export type AddressDto = {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postal: string;
  isDefault: boolean;
  approvalStatus: string; // APPROVED | PENDING | DECLINED
  requestedByName: string | null;
  requestedAt: string | null;
  reviewNote: string | null;
};

// ─── Admin: Attention Centre ──────────────────────────────────────────────────

export type AttentionOrderCard = {
  orderId: string;
  orderNumber: string;
  orgName: string;
  orgId: string;
  status: string;
  itemCount: number;
  totalCents: number;
  // context per section:
  nextUpdateDate?: string | null;
  dueInDays?: number | null; // negative ⇒ overdue
  lastUpdateAt?: string | null; // last published update / status change
  estimatedDelivery?: string | null;
  requestedAt?: string | null;
  sourceType?: string;
};

export type AttentionCentreDto = {
  newOrderRequests: AttentionOrderCard[]; // SUBMITTED, not yet reviewed
  pendingChangeRequests: (ChangeRequestDto & { orderId: string; orderNumber: string; orgName: string })[];
  pendingMessages: MessageDto[];
  ordersNeedingUpdates: AttentionOrderCard[]; // no recent published update while in fulfilment
  overdueUpdates: AttentionOrderCard[]; // nextUpdateDate has passed
  upcomingUpdateReminders: AttentionOrderCard[]; // nextUpdateDate within 3 days
  delayedOrders: AttentionOrderCard[]; // delay-flagged orders still open
  upcomingDeliveries: AttentionOrderCard[]; // estimated delivery within 7 days (or overdue)
};

// ─── Admin: global search ─────────────────────────────────────────────────────

export type SearchResultsDto = {
  orders: { id: string; orderNumber: string; orgName: string; status: string }[];
  quotes: { id: string; quoteNumber: string; title: string; orgName: string; status: string }[];
  customers: { id: string; code: string; name: string; status: string }[];
  products: { id: string; sku: string; name: string; isActive: boolean }[];
  users: { id: string; name: string; email: string; orgName: string | null; orgId: string | null }[];
  messages: { id: string; subject: string; orgName: string; status: string; orderId: string | null }[];
  changeRequests: { id: string; orderId: string; orderNumber: string; orgName: string; status: string }[];
};

// ─── Customer preferences (admin-visible only) ────────────────────────────────

export type OrgPreferences = {
  preferredContactUserId?: string | null;
  preferredContactMethod?: "EMAIL" | "PHONE" | "PORTAL" | null;
  deliveryInstructions?: string | null;
  commonlyOrderedNote?: string | null;
};

export type CustomerProfile = {
  organization: {
    id: string;
    code: string;
    name: string;
    status: string;
    billingLine1: string;
    billingCity: string;
    billingProvince: string;
    billingPostal: string;
    phone: string;
    internalNotes: string | null;
    preferences: OrgPreferences | null;
    createdAt: string;
  };
  users: {
    id: string;
    email: string;
    name: string;
    title: string | null;
    phone: string | null;
    status: string;
    orgRole: string;
    lastLoginAt: string | null;
  }[];
  addresses: {
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
    requestedAt: string | null;
    reviewNote: string | null;
  }[];
  orders: OrderListItem[];
  quotations: QuotationListItem[];
  documents: DocumentDto[];
  prices: {
    productId: string;
    productName: string;
    sku: string;
    defaultPriceCents: number | null;
    priceCents: number | null;
    note: string | null;
  }[];
  approvedProductCount: number;
  pendingChangeRequests: number;
};

// ─── Email outbox (admin settings view) ───────────────────────────────────────

export type EmailLogDto = {
  id: string;
  toEmail: string;
  toName: string;
  subject: string;
  kind: string;
  status: string;
  createdAt: string;
};
