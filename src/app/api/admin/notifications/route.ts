import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { NOTIFICATION_KINDS } from "@/lib/constants";
import { serializeNotification } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    await requireAdmin();

    const notifications = await db.notification.findMany({
      where: { audience: "ADMIN" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(notifications.map(serializeNotification));
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    await requireAdmin();

    const body = await readJson(req);
    const rawOrgId = body.orgId;
    const title = str(body.title, "Title", { required: true, max: 200 });
    const bodyText = str(body.body, "Message", { required: true, max: 2000 });
    const kind = str(body.kind, "Kind", { required: true, max: 20 });
    if (!NOTIFICATION_KINDS.includes(kind as (typeof NOTIFICATION_KINDS)[number])) {
      throw new ApiError("Kind must be ORDER, QUOTATION, DOCUMENT, MESSAGE or SYSTEM.", 422);
    }

    if (rawOrgId === null) {
      // Announcement to every active organization.
      const orgs = await db.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      if (orgs.length > 0) {
        await db.notification.createMany({
          data: orgs.map((org) => ({
            audience: "CUSTOMER",
            orgId: org.id,
            title,
            body: bodyText,
            kind,
            view: null,
            relatedId: null,
          })),
        });
      }
      return ok({ ok: true });
    }

    const orgId = str(rawOrgId, "Customer", { required: true, max: 40 });
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new ApiError("Customer not found.", 404);

    await db.notification.create({
      data: {
        audience: "CUSTOMER",
        orgId,
        title,
        body: bodyText,
        kind,
        view: null,
        relatedId: null,
      },
    });

    return ok({ ok: true });
  });
}
