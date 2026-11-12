import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { hashPassword } from "@/lib/server/crypto";
import { audit, tempPassword } from "@/lib/server/service";

export async function GET() {
  return handler(async () => {
    await requireAdmin();

    const users = await db.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    });
    return ok(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        title: u.title,
        status: u.status,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      })),
    );
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();

    const body = await readJson(req);
    const email = str(body.email, "Email", { required: true, max: 200 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ApiError("Email must be a valid email address.", 422);
    }
    const name = str(body.name, "Name", { required: true, max: 120 });
    const role = str(body.role, "Role", { required: true, max: 10 });
    if (role !== "ADMIN") {
      throw new ApiError("This endpoint creates internal (ADMIN) users only.", 422);
    }
    const title = str(body.title, "Title", { max: 120 });

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new ApiError("That email address is already in use.", 422);

    const password = tempPassword();
    const user = await db.user.create({
      data: {
        email,
        name,
        title: title || null,
        role: "ADMIN",
        status: "INVITED",
        passwordHash: hashPassword(password),
      },
    });

    await audit({ id: admin.id, name: admin.name }, "USER_INVITED", "User", {
      entityId: user.id,
      detail: `${user.name} (${user.email}) — internal user`,
    });

    return ok({ id: user.id, tempPassword: password });
  });
}
