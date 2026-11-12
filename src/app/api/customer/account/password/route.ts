import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { hashPassword, verifyPassword } from "@/lib/server/crypto";

export async function PUT(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const body = await readJson(req);

    const currentPassword = str(body.currentPassword, "Current password", { required: true, max: 200 });
    const newPassword = str(body.newPassword, "New password", { required: true, max: 200 });
    if (newPassword.length < 8) {
      throw new ApiError("New password must be at least 8 characters.", 422);
    }

    const row = await db.user.findUnique({ where: { id: user.id } });
    if (!row || !verifyPassword(currentPassword, row.passwordHash)) {
      throw new ApiError("Your current password is incorrect.", 422);
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });
    return ok({ ok: true });
  });
}
