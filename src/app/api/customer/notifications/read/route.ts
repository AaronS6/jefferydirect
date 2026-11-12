import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer } from "@/lib/server/api";

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    const body = await readJson(req);

    if (body.all === true) {
      // Scope to this org's notifications — never other orgs'.
      await db.notification.updateMany({
        where: { audience: "CUSTOMER", orgId: user.orgId, isRead: false },
        data: { isRead: true },
      });
      return ok({ ok: true });
    }

    const ids = body.ids;
    if (Array.isArray(ids) && ids.length > 0) {
      const valid = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (valid.length === 0) throw new ApiError("No valid notification ids supplied.", 422);
      await db.notification.updateMany({
        where: { audience: "CUSTOMER", orgId: user.orgId, id: { in: valid } },
        data: { isRead: true },
      });
      return ok({ ok: true });
    }

    throw new ApiError("Provide notification ids or set all to true.", 422);
  });
}
