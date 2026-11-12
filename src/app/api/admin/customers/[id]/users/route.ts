import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { hashPassword } from "@/lib/server/crypto";
import { audit, tempPassword } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const org = await db.organization.findUnique({ where: { id } });
    if (!org) throw new ApiError("Customer not found.", 404);

    const body = await readJson(req);
    const email = str(body.email, "Email", { required: true, max: 200 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ApiError("Email must be a valid email address.", 422);
    }
    const name = str(body.name, "Name", { required: true, max: 120 });
    const title = str(body.title, "Title", { max: 120 });
    const phone = str(body.phone, "Phone", { max: 40 });

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new ApiError("That email address is already in use.", 422);

    const password = tempPassword();
    const user = await db.user.create({
      data: {
        email,
        name,
        title: title || null,
        phone: phone || null,
        role: "CUSTOMER",
        orgId: org.id,
        status: "INVITED",
        passwordHash: hashPassword(password),
      },
    });

    await audit({ id: admin.id, name: admin.name }, "USER_INVITED", "User", {
      entityId: user.id,
      detail: `${user.name} (${user.email}) invited to ${org.name}`,
    });

    return ok({ id: user.id, tempPassword: password });
  });
}
