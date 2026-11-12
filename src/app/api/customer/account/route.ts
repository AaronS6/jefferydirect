import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { optionalStr } from "@/lib/server/service";
import { parseNotifyPrefs, serializeAddress } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    const user = await requireCustomer();
    const orgId = user.orgId;

    const [org, addresses, userRow] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId } }),
      db.address.findMany({
        where: { orgId },
        orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      }),
      db.user.findUnique({ where: { id: user.id } }),
    ]);

    return ok({
      // internalNotes is deliberately excluded — customer-facing payload.
      organization: org
        ? {
            id: org.id,
            code: org.code,
            name: org.name,
            status: org.status,
            billingLine1: org.billingLine1,
            billingCity: org.billingCity,
            billingProvince: org.billingProvince,
            billingPostal: org.billingPostal,
            phone: org.phone,
          }
        : null,
      // Full address rows feed serializeAddress — the customer sees the
      // approval workflow (pending / declined + review note) on their own
      // address book. No internal organization fields are exposed here.
      addresses: addresses.map(serializeAddress),
      notifyPrefs: parseNotifyPrefs(userRow?.notifyPrefs ?? "{}"),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        title: user.title,
        phone: user.phone,
      },
    });
  });
}

type ParsedAddress = { id: string; label: string; line1: string; line2: string | null; city: string; province: string; postal: string };

/**
 * PUT /api/customer/account — customers manage their shipping addresses,
 * contact phone and notification preferences only. Billing fields are
 * admin-managed and ignored here.
 */
export async function PUT(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const orgId = user.orgId;
    const body = await readJson(req);

    // Phone (user record)
    const phone = optionalStr(body.phone, "Phone", 40);
    if (phone !== undefined) {
      await db.user.update({ where: { id: user.id }, data: { phone } });
    }

    // Notification preferences (stored as a JSON string)
    if (body.notifyPrefs !== undefined) {
      const raw = body.notifyPrefs;
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new ApiError("Notification preferences must be an object.", 422);
      }
      const clean: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "boolean") clean[key] = value;
      }
      await db.user.update({
        where: { id: user.id },
        data: { notifyPrefs: JSON.stringify(clean) },
      });
    }

    // Shipping addresses — full replace of this org's set (owned rows only).
    if (body.addresses !== undefined) {
      if (!Array.isArray(body.addresses)) {
        throw new ApiError("Addresses must be a list.", 422);
      }
      if (body.addresses.length > 12) {
        throw new ApiError("An account can hold at most 12 shipping addresses.", 422);
      }
      const parsed: ParsedAddress[] = body.addresses.map((raw, i) => {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
          throw new ApiError(`Address ${i + 1} is invalid.`, 422);
        }
        const rec = raw as Record<string, unknown>;
        return {
          id: str(rec.id, `Address ${i + 1} id`, { max: 40 }),
          label: str(rec.label, `Address ${i + 1} label`, { required: true, max: 80 }),
          line1: str(rec.line1, `Address ${i + 1} street`, { required: true, max: 160 }),
          line2: optionalStr(rec.line2, `Address ${i + 1} unit`, 80) ?? null,
          city: str(rec.city, `Address ${i + 1} city`, { required: true, max: 80 }),
          province: str(rec.province, `Address ${i + 1} province`, { required: true, max: 40 }),
          postal: str(rec.postal, `Address ${i + 1} postal code`, { required: true, max: 20 }),
        };
      });

      const prior = await db.address.findMany({ where: { orgId }, select: { id: true, isDefault: true } });
      const priorDefaultId = prior.find((p) => p.isDefault)?.id ?? null;
      await db.address.deleteMany({ where: { orgId } });
      if (parsed.length > 0) {
        const defaultIdx = priorDefaultId
          ? parsed.findIndex((p) => p.id === priorDefaultId)
          : -1;
        await db.address.createMany({
          data: parsed.map((p, idx) => ({
            orgId,
            label: p.label,
            line1: p.line1,
            line2: p.line2,
            city: p.city,
            province: p.province,
            postal: p.postal,
            country: "Canada",
            isDefault: defaultIdx >= 0 ? idx === defaultIdx : idx === 0,
          })),
        });
      }
    }

    return ok({ ok: true });
  });
}
