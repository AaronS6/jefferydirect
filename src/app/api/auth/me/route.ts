import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/server/api";
import { getSessionUser } from "@/lib/server/auth";
import { serializeSession } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    const session = await getSessionUser();
    if (!session) throw new ApiError("You are not signed in.", 401);

    const row = await db.user.findUnique({
      where: { id: session.id },
      select: { notifyPrefs: true },
    });

    return ok(
      serializeSession(
        {
          id: session.id,
          email: session.email,
          name: session.name,
          role: session.role,
          orgRole: session.orgRole,
          title: session.title,
          phone: session.phone,
          notifyPrefs: row?.notifyPrefs ?? "{}",
        },
        session.organization,
      ),
    );
  });
}
