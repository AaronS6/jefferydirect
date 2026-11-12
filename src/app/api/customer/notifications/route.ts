import { db } from "@/lib/db";
import { handler, ok, requireCustomer } from "@/lib/server/api";
import { serializeNotification } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    const user = await requireCustomer();

    const notifications = await db.notification.findMany({
      where: { audience: "CUSTOMER", orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(notifications.map(serializeNotification));
  });
}
