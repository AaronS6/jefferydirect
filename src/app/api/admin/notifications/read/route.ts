import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin } from "@/lib/server/api";

export async function POST(req: Request) {
  return handler(async () => {
    await requireAdmin();
    const body = await readJson(req);

    if (body.all === true) {
      await db.notification.updateMany({
        where: { audience: "ADMIN", isRead: false },
        data: { isRead: true },
      });
      return ok({ ok: true });
    }

    const ids = body.ids;
    if (Array.isArray(ids) && ids.length > 0) {
      const valid = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (valid.length === 0) throw new ApiError("No valid notification ids supplied.", 422);
      await db.notification.updateMany({
        where: { audience: "ADMIN", id: { in: valid } },
        data: { isRead: true },
      });
      return ok({ ok: true });
    }

    throw new ApiError("Provide notification ids or set all to true.", 422);
  });
}
