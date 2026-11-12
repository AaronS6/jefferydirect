import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { ORG_STATUSES } from "@/lib/constants";
import { audit, optionalStr } from "@/lib/server/service";
import {
  parseOrgPreferences,
  serializeDocument,
  serializeOrderListItem,
  serializeQuotationListItem,
} from "@/lib/server/serialize";
import type { CustomerProfile } from "@/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { id } = await params;

    const org = await db.organization.findUnique({ where: { id } });
    if (!org) throw new ApiError("Customer not found.", 404);

    const [users, addresses, orders, quotations, documents, prices, approvedCount, pendingChangeRequests] =
      await Promise.all([
        db.user.findMany({
          where: { orgId: org.id, role: "CUSTOMER" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            name: true,
            title: true,
            phone: true,
            status: true,
            orgRole: true,
            lastLoginAt: true,
          },
        }),
        db.address.findMany({
          where: { orgId: org.id },
          orderBy: [{ isDefault: "desc" }, { label: "asc" }],
        }),
        db.order.findMany({
          where: { orgId: org.id },
          include: { items: true, organization: true },
          orderBy: { createdAt: "desc" },
        }),
        db.quotation.findMany({
          where: { orgId: org.id },
          include: { organization: true },
          orderBy: { createdAt: "desc" },
        }),
        db.document.findMany({
          where: { orgId: org.id },
          include: {
            organization: { select: { name: true } },
            order: { select: { orderNumber: true } },
            quotation: { select: { quoteNumber: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        db.customerPrice.findMany({ where: { orgId: org.id }, include: { product: true } }),
        db.productAccess.count({ where: { orgId: org.id, approved: true } }),
        db.orderChangeRequest.count({ where: { status: "PENDING", order: { orgId: org.id } } }),
      ]);

    const profile: CustomerProfile = {
      organization: {
        id: org.id,
        code: org.code,
        name: org.name,
        status: org.status,
        billingLine1: org.billingLine1,
        billingCity: org.billingCity,
        billingProvince: org.billingProvince,
        billingPostal: org.billingPostal,
        phone: org.phone,
        internalNotes: org.internalNotes,
        preferences: parseOrgPreferences(org.preferences),
        createdAt: org.createdAt.toISOString(),
      },
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        title: u.title,
        phone: u.phone,
        status: u.status,
        orgRole: u.orgRole,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      })),
      addresses: addresses.map((a) => ({
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
      })),
      orders: orders.map(serializeOrderListItem),
      quotations: quotations.map(serializeQuotationListItem),
      documents: documents.map(serializeDocument),
      prices: prices.map((p) => ({
        productId: p.productId,
        productName: p.product.name,
        sku: p.product.sku,
        defaultPriceCents: p.product.defaultPriceCents,
        priceCents: p.priceCents,
        note: p.note,
      })),
      approvedProductCount: approvedCount,
      pendingChangeRequests,
    };
    return ok(profile);
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { id } = await params;

    const body = await readJson(req);
    const name = str(body.name, "Customer name", { max: 160 });
    const status = str(body.status, "Status", { max: 20 });
    if (status && !ORG_STATUSES.includes(status as (typeof ORG_STATUSES)[number])) {
      throw new ApiError("Status must be ACTIVE or SUSPENDED.", 422);
    }
    const billingLine1 = optionalStr(body.billingLine1, "Billing street", 160);
    const billingCity = optionalStr(body.billingCity, "Billing city", 80);
    const billingProvince = optionalStr(body.billingProvince, "Billing province", 40);
    const billingPostal = optionalStr(body.billingPostal, "Billing postal code", 20);
    const phone = optionalStr(body.phone, "Phone", 40);
    const internalNotes = optionalStr(body.internalNotes, "Internal notes", 4000);

    const org = await db.organization.findUnique({ where: { id } });
    if (!org) throw new ApiError("Customer not found.", 404);

    await db.organization.update({
      where: { id: org.id },
      data: {
        ...(name ? { name } : {}),
        ...(status ? { status } : {}),
        ...(billingLine1 !== undefined ? { billingLine1: billingLine1 ?? "" } : {}),
        ...(billingCity !== undefined ? { billingCity: billingCity ?? "" } : {}),
        ...(billingProvince !== undefined ? { billingProvince: billingProvince ?? "" } : {}),
        ...(billingPostal !== undefined ? { billingPostal: billingPostal ?? "" } : {}),
        ...(phone !== undefined ? { phone: phone ?? "" } : {}),
        ...(internalNotes !== undefined ? { internalNotes } : {}),
      },
    });

    return ok({ ok: true });
  });
}

// ─── Relationship preferences (admin-visible only) ─────────────────────────

const CONTACT_METHODS = new Set(["EMAIL", "PHONE", "PORTAL"]);

type PreferencesInput = {
  preferredContactUserId?: string | null;
  preferredContactMethod?: "EMAIL" | "PHONE" | "PORTAL" | null;
  deliveryInstructions?: string | null;
  commonlyOrderedNote?: string | null;
};

/** Validate a preferences patch; only provided keys are applied (merge). */
function parsePreferencesInput(v: unknown): PreferencesInput {
  if (v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError("Preferences must be an object.", 422);
  }
  const rec = v as Record<string, unknown>;
  const out: PreferencesInput = {};
  if (rec.preferredContactUserId !== undefined) {
    out.preferredContactUserId = optionalStr(rec.preferredContactUserId, "Preferred contact", 40);
  }
  if (rec.preferredContactMethod !== undefined) {
    const method = optionalStr(rec.preferredContactMethod, "Preferred contact method", 20);
    if (method !== null && method !== undefined && !CONTACT_METHODS.has(method)) {
      throw new ApiError("Preferred contact method must be EMAIL, PHONE or PORTAL.", 422);
    }
    out.preferredContactMethod = method as "EMAIL" | "PHONE" | "PORTAL" | null;
  }
  if (rec.deliveryInstructions !== undefined) {
    out.deliveryInstructions = optionalStr(rec.deliveryInstructions, "Delivery instructions", 1000);
  }
  if (rec.commonlyOrderedNote !== undefined) {
    out.commonlyOrderedNote = optionalStr(rec.commonlyOrderedNote, "Commonly ordered note", 1000);
  }
  return out;
}

/** PATCH — update the customer record (as PUT) plus relationship preferences. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const body = await readJson(req);
    const name = str(body.name, "Customer name", { max: 160 });
    const status = str(body.status, "Status", { max: 20 });
    if (status && !ORG_STATUSES.includes(status as (typeof ORG_STATUSES)[number])) {
      throw new ApiError("Status must be ACTIVE or SUSPENDED.", 422);
    }
    const billingLine1 = optionalStr(body.billingLine1, "Billing street", 160);
    const billingCity = optionalStr(body.billingCity, "Billing city", 80);
    const billingProvince = optionalStr(body.billingProvince, "Billing province", 40);
    const billingPostal = optionalStr(body.billingPostal, "Billing postal code", 20);
    const phone = optionalStr(body.phone, "Phone", 40);
    const internalNotes = optionalStr(body.internalNotes, "Internal notes", 4000);
    const preferences =
      body.preferences !== undefined ? parsePreferencesInput(body.preferences) : undefined;

    const org = await db.organization.findUnique({ where: { id } });
    if (!org) throw new ApiError("Customer not found.", 404);

    const preferredContactUserId = preferences?.preferredContactUserId ?? null;
    if (preferredContactUserId) {
      const contact = await db.user.findFirst({
        where: { id: preferredContactUserId, orgId: org.id, role: "CUSTOMER" },
        select: { id: true },
      });
      if (!contact) {
        throw new ApiError("Preferred contact user must belong to this customer.", 422);
      }
    }

    const data: {
      name?: string;
      status?: string;
      billingLine1?: string;
      billingCity?: string;
      billingProvince?: string;
      billingPostal?: string;
      phone?: string;
      internalNotes?: string | null;
      preferences?: string;
    } = {
      ...(name ? { name } : {}),
      ...(status ? { status } : {}),
      ...(billingLine1 !== undefined ? { billingLine1: billingLine1 ?? "" } : {}),
      ...(billingCity !== undefined ? { billingCity: billingCity ?? "" } : {}),
      ...(billingProvince !== undefined ? { billingProvince: billingProvince ?? "" } : {}),
      ...(billingPostal !== undefined ? { billingPostal: billingPostal ?? "" } : {}),
      ...(phone !== undefined ? { phone: phone ?? "" } : {}),
      ...(internalNotes !== undefined ? { internalNotes } : {}),
    };

    let preferencesChanged = false;
    if (preferences) {
      const current = parseOrgPreferences(org.preferences) ?? {};
      const merged = { ...current, ...preferences };
      data.preferences = JSON.stringify(merged);
      preferencesChanged = Object.keys(preferences).length > 0;
    }

    await db.organization.update({ where: { id: org.id }, data });

    if (preferencesChanged) {
      await audit(admin, "PREFERENCES_UPDATED", "Organization", {
        entityId: org.id,
        detail: Object.keys(preferences ?? {}).join(", "),
      });
    }

    return ok({ ok: true });
  });
}
