import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { audit, notifyAdmin, notifyCustomer, optionalStr, requireOrgWrite } from "@/lib/server/service";
import { serializeAddress } from "@/lib/server/serialize";

const MAX_ADDRESSES = 12;

/** GET /api/customer/addresses — the org's address book, every approval status. */
export async function GET() {
  return handler(async () => {
    const user = await requireCustomer();
    const addresses = await db.address.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
    });
    // Pending and declined entries are included on purpose — the customer
    // should see where their requests stand (and any review note).
    return ok(addresses.map(serializeAddress));
  });
}

/**
 * POST /api/customer/addresses — add a new delivery location. Addresses are
 * active immediately (no approval step): the first one becomes the org's
 * default so orders always have somewhere to go.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const orgId = user.orgId;

    const body = await readJson(req);
    const label = str(body.label, "Address label", { required: true, max: 120 });
    const line1 = str(body.line1, "Street address", { required: true, max: 200 });
    const line2 = optionalStr(body.line2, "Unit / suite", 200) ?? null;
    const city = str(body.city, "City", { required: true, max: 120 });
    const province = str(body.province, "Province", { required: true, max: 120 });
    const postal = str(body.postal, "Postal code", { required: true, max: 32 });

    const count = await db.address.count({ where: { orgId } });
    if (count >= MAX_ADDRESSES) {
      throw new ApiError(
        "An account can hold at most 12 delivery addresses. Remove one before adding another.",
        422,
      );
    }

    const address = await db.address.create({
      data: {
        orgId,
        label,
        line1,
        line2,
        city,
        province,
        postal,
        country: "Canada",
        // No approval workflow — the location is usable right away.
        isDefault: false,
        approvalStatus: "APPROVED",
        requestedById: user.id,
        requestedByName: user.name,
        requestedAt: new Date(),
      },
    });

    // First address on the account automatically becomes the default so
    // checkout always has a destination pre-selected.
    const hasDefault = await db.address.findFirst({
      where: { orgId, isDefault: true },
      select: { id: true },
    });
    if (!hasDefault) {
      await db.address.update({ where: { id: address.id }, data: { isDefault: true } });
    }

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    // Awareness copy for the team — informational, never an approval request.
    await notifyAdmin({
      title: `Delivery address added — ${org?.name ?? "Customer"}`,
      body: `${user.name} added "${label}" to their address book. It is active immediately.`,
      kind: "SYSTEM",
      view: "admin-customer-detail",
      relatedId: orgId,
    });
    await notifyCustomer(orgId, {
      title: "Delivery address added",
      body: `"${label}" is saved and ready to use for your orders.`,
      kind: "SYSTEM",
      view: "settings",
    });
    await audit(user, "ADDRESS_ADDED", "Address", {
      entityId: address.id,
      detail: label,
    });

    return ok(serializeAddress(address));
  });
}
