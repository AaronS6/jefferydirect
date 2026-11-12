import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { hashPassword } from "@/lib/server/crypto";
import { audit, nextOrgCode, queryParam, tempPassword } from "@/lib/server/service";

export async function GET(req: Request) {
  return handler(async () => {
    await requireAdmin();
    const search = queryParam(req, "search");

    const orgs = await db.organization.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { code: { contains: search } },
              { users: { some: { OR: [{ name: { contains: search } }, { email: { contains: search } }] } } },
            ],
          }
        : {},
      orderBy: { createdAt: "asc" },
    });

    // Primary contact = earliest-created customer user of the org.
    const users = await db.user.findMany({
      where: { role: "CUSTOMER" },
      orderBy: { createdAt: "asc" },
      select: { orgId: true, name: true, email: true },
    });
    const primaryByOrg = new Map<string, { name: string; email: string }>();
    for (const u of users) {
      if (u.orgId && !primaryByOrg.has(u.orgId)) primaryByOrg.set(u.orgId, { name: u.name, email: u.email });
    }

    const grouped = await db.order.groupBy({
      by: ["orgId"],
      _count: true,
      _max: { createdAt: true },
    });
    const orderStats = new Map(grouped.map((g) => [g.orgId, { count: g._count, last: g._max.createdAt }]));

    return ok(
      orgs.map((org) => {
        const contact = primaryByOrg.get(org.id);
        const stats = orderStats.get(org.id);
        return {
          id: org.id,
          code: org.code,
          name: org.name,
          status: org.status,
          primaryContact: contact?.name ?? "—",
          contactEmail: contact?.email ?? "—",
          phone: org.phone,
          city: org.billingCity,
          province: org.billingProvince,
          orderCount: stats?.count ?? 0,
          lastOrderAt: stats?.last ? stats.last.toISOString() : null,
          createdAt: org.createdAt.toISOString(),
        };
      }),
    );
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();

    const body = await readJson(req);
    const name = str(body.name, "Customer name", { required: true, max: 160 });
    const contactName = str(body.contactName, "Contact name", { required: true, max: 120 });
    const contactEmail = str(body.contactEmail, "Contact email", { required: true, max: 200 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      throw new ApiError("Contact email must be a valid email address.", 422);
    }
    const contactTitle = str(body.contactTitle, "Contact title", { max: 120 });
    const phone = str(body.phone, "Phone", { max: 40 });
    const billingLine1 = str(body.billingLine1, "Billing street", { max: 160 });
    const billingCity = str(body.billingCity, "Billing city", { max: 80 });
    const billingProvince = str(body.billingProvince, "Billing province", { max: 40 });
    const billingPostal = str(body.billingPostal, "Billing postal code", { max: 20 });

    const existingEmail = await db.user.findUnique({ where: { email: contactEmail } });
    if (existingEmail) throw new ApiError("That email address is already in use.", 422);

    const code = await nextOrgCode();
    const org = await db.organization.create({
      data: {
        code,
        name,
        status: "ACTIVE",
        billingLine1,
        billingCity,
        billingProvince,
        billingPostal,
        phone,
      },
    });

    // Invited primary contact — temp password returned ONCE, stored hashed.
    const password = tempPassword();
    const user = await db.user.create({
      data: {
        email: contactEmail,
        name: contactName,
        title: contactTitle || null,
        phone: phone || null,
        role: "CUSTOMER",
        orgId: org.id,
        status: "INVITED",
        passwordHash: hashPassword(password),
      },
    });

    await audit({ id: admin.id, name: admin.name }, "CUSTOMER_CREATED", "Organization", {
      entityId: org.id,
      detail: `${org.name} onboarded — primary contact ${user.name}`,
    });

    return ok({ id: org.id, code, tempPassword: password });
  });
}
