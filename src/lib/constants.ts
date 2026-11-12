// ClientHub shared constants — canonical enumerations used by both
// the API layer and the frontend. Stored as strings in SQLite.

export const CURRENCY = "CAD" as const;

// ─── User roles ───────────────────────────────────────────────────────────────
export const ROLE_ADMIN = "ADMIN";
export const ROLE_CUSTOMER = "CUSTOMER";

// ─── Customer organization permission levels ──────────────────────────────────
export const ORG_ROLES = ["ORG_ADMIN", "PURCHASING", "READONLY"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: "Organization Administrator",
  PURCHASING: "Purchasing User",
  READONLY: "Read-only User",
};

export const ORG_ROLE_DESCRIPTIONS: Record<string, string> = {
  ORG_ADMIN:
    "Full access — manage organization users, submit orders, request changes, and correspond with Jeffery Group.",
  PURCHASING:
    "Submit new orders, view orders, request changes, and send order messages.",
  READONLY: "View permitted orders, published updates, and authorized documents only.",
};

// Roles that may submit orders / change requests / messages
export const ORG_WRITE_ROLES: ReadonlySet<string> = new Set(["ORG_ADMIN", "PURCHASING"]);

// ─── Order status workflow (sequential) ─────────────────────────────────────
export const ORDER_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "PROCESSING",
  "IN_PRODUCTION",
  "READY_FOR_SHIPMENT",
  "DISPATCHED",
  "DELIVERED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number] | "CANCELLED" | "REJECTED";

export const ORDER_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  AWAITING_CONFIRMATION: "Awaiting Confirmation",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  IN_PRODUCTION: "In Production",
  READY_FOR_SHIPMENT: "Ready for Shipment",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

// Terminal-ish states excluded from the progress timeline
export const ORDER_TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "REJECTED"];

// Statuses where the order request is still awaiting Jeffery Group review
export const ORDER_REQUEST_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "AWAITING_CONFIRMATION"];

// ─── Order provenance (portal vs. recorded on the customer's behalf) ──────────
export const ORDER_SOURCES = ["PORTAL", "EMAIL", "PHONE", "IN_PERSON"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABELS: Record<string, string> = {
  PORTAL: "Submitted via ClientHub",
  EMAIL: "Received by email",
  PHONE: "Received by phone",
  IN_PERSON: "Received in person",
};

export const ORDER_SOURCE_SHORT_LABELS: Record<string, string> = {
  PORTAL: "Portal",
  EMAIL: "Email",
  PHONE: "Phone",
  IN_PERSON: "In person",
};

// ─── Customer update categories (Order Update Centre) ────────────────────────
export const UPDATE_CATEGORIES = [
  "ORDER_ACCEPTED",
  "PREPARATION",
  "PRODUCTION",
  "PRODUCTION_COMPLETED",
  "READY_DISPATCH",
  "SHIPMENT",
  "DELIVERY",
  "DELAY",
  "INFO",
  "COMPLETED",
] as const;
export type UpdateCategory = (typeof UPDATE_CATEGORIES)[number];

export const UPDATE_CATEGORY_LABELS: Record<string, string> = {
  ORDER_ACCEPTED: "Order Accepted",
  PREPARATION: "Order Preparation",
  PRODUCTION: "Production Update",
  PRODUCTION_COMPLETED: "Production Completed",
  READY_DISPATCH: "Ready for Dispatch",
  SHIPMENT: "Shipment Update",
  DELIVERY: "Delivery Update",
  DELAY: "Delay Notice",
  INFO: "Important Information",
  COMPLETED: "Order Completed",
};

// ─── Change requests ───────────────────────────────────────────────────────────
export const CHANGE_REQUEST_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "COUNTERED", "WITHDRAWN"] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const CHANGE_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting review",
  ACCEPTED: "Approved",
  DECLINED: "Declined",
  COUNTERED: "Alternative proposed",
  WITHDRAWN: "Withdrawn",
};

// What a change request can target
export const CHANGE_KINDS = ["QUANTITY", "SPEC", "ADD", "REMOVE", "ADDRESS", "DATE", "CANCEL", "OTHER"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_KIND_LABELS: Record<string, string> = {
  QUANTITY: "Quantity",
  SPEC: "Specification",
  ADD: "Add product",
  REMOVE: "Remove product",
  ADDRESS: "Delivery address",
  DATE: "Delivery date",
  CANCEL: "Cancel order",
  OTHER: "Other",
};

// ─── Address approval ──────────────────────────────────────────────────────────
export const ADDRESS_STATUSES = ["APPROVED", "PENDING", "DECLINED"] as const;
export type AddressStatus = (typeof ADDRESS_STATUSES)[number];

export const ADDRESS_STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  PENDING: "Awaiting approval",
  DECLINED: "Not approved",
};

// ─── Notification kinds ──────────────────────────────────────────────────────
export const NOTIFICATION_KINDS = [
  "ORDER",
  "QUOTATION",
  "DOCUMENT",
  "MESSAGE",
  "SYSTEM",
  "UPDATE",
  "CHANGE",
] as const;

// ─── Template placeholders ────────────────────────────────────────────────────
export const TEMPLATE_PLACEHOLDERS = [
  "customer_name",
  "order_number",
  "product_name",
  "quantity",
  "estimated_delivery",
  "revised_delivery",
  "admin_name",
] as const;

export const TEMPLATE_PLACEHOLDER_HINTS: Record<string, string> = {
  customer_name: "Customer organization name",
  order_number: "Order number, e.g. ORD-2024-0128",
  product_name: "First product name on the order",
  quantity: "First product quantity",
  estimated_delivery: "Estimated delivery date",
  revised_delivery: "Revised delivery date",
  admin_name: "Your name",
};

// ─── Quotation statuses ──────────────────────────────────────────────────────
export const QUOTE_STATUSES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "ISSUED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "REVISED",
  "CANCELLED",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Awaiting Review",
  UNDER_REVIEW: "Under Review",
  ISSUED: "Quote Issued",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  EXPIRED: "Expired",
  REVISED: "Revised",
  CANCELLED: "Cancelled",
};

// ─── Product availability ────────────────────────────────────────────────────
export const STOCK_STATUSES = ["IN_STOCK", "MADE_TO_ORDER", "ENQUIRY_ONLY"] as const;
export const STOCK_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "In Stock",
  MADE_TO_ORDER: "Made to Order",
  ENQUIRY_ONLY: "Quotation Required",
};

// ─── Document categories ──────────────────────────────────────────────────────
export const DOCUMENT_CATEGORIES = [
  "INVOICE",
  "PURCHASE_ORDER",
  "QUOTATION",
  "STATEMENT",
  "SPECIFICATION",
  "DELIVERY_RECEIPT",
  "OTHER",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  INVOICE: "Invoices",
  PURCHASE_ORDER: "Purchase Orders",
  QUOTATION: "Quotations",
  STATEMENT: "Statements of Account",
  SPECIFICATION: "Product Specifications",
  DELIVERY_RECEIPT: "Delivery Receipts",
  OTHER: "Other Documents",
};

// ─── Message categories ──────────────────────────────────────────────────────
export const MESSAGE_CATEGORIES = [
  "ORDER",
  "PRODUCT",
  "QUOTATION",
  "INVOICE",
  "DELIVERY",
  "GENERAL",
] as const;
export const MESSAGE_CATEGORY_LABELS: Record<string, string> = {
  ORDER: "Existing Order",
  PRODUCT: "Products",
  QUOTATION: "Quotations",
  INVOICE: "Invoices",
  DELIVERY: "Delivery Arrangements",
  GENERAL: "General Inquiry",
};

// ─── Notification kinds ──────────────────────────────────────────────────────
// (see NOTIFICATION_KINDS above)

// ─── Organization status ─────────────────────────────────────────────────────
export const ORG_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export const ORG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

// ─── Quotation item kinds ────────────────────────────────────────────────────
export const QUOTE_ITEM_KINDS = ["PRODUCT", "SETUP", "FREIGHT", "OTHER"] as const;
export const QUOTE_ITEM_KIND_LABELS: Record<string, string> = {
  PRODUCT: "Product",
  SETUP: "Setup / One-time",
  FREIGHT: "Freight",
  OTHER: "Other",
};

// ─── Tax ─────────────────────────────────────────────────────────────────────
// Federal GST/HST applied as configured by admin (demo: 5% GST)
export const DEFAULT_TAX_RATE_BP = 500; // basis points
