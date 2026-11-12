import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";

const USER_STATUSES = new Set(["ACTIVE", "DISABLED"]);

export async function PUT(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const { userId } = await params;

    const body = await readJson(req);
    const status = str(body.status, "Status", { required: true, max: 20 });
    if (!USER_STATUSES.has(status)) {
      throw new ApiError("Status must be ACTIVE or DISABLED.", 422);
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError("User not found.", 404);

    await db.user.update({ where: { id: user.id }, data: { status } });
    return ok({ ok: true });
  });
}
