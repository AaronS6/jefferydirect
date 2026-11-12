import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, str } from "@/lib/server/api";
import { startSession } from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/crypto";
import { serializeSession } from "@/lib/server/serialize";

const ORG_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  billingLine1: true,
  billingCity: true,
  billingProvince: true,
  billingPostal: true,
  phone: true,
} as const;

export async function POST(req: Request) {
  return handler(async () => {
    const body = await readJson(req);
    const email = str(body.email, "Email", { required: true, max: 200 }).toLowerCase();
    const password = str(body.password, "Password", { required: true, max: 200 });
    const remember = body.remember === true || body.remember === "true";

    const user = await db.user.findUnique({
      where: { email },
      include: { organization: { select: ORG_SELECT } },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ApiError("Invalid email or password.", 401);
    }
    if (user.status === "DISABLED") {
      throw new ApiError("This account has been disabled. Please contact Jeffery Group.", 403);
    }
    if (user.role === "CUSTOMER") {
      if (!user.orgId || !user.organization || user.organization.status !== "ACTIVE") {
        throw new ApiError(
          "Your organization's account is currently suspended. Please contact Jeffery Group.",
          403,
        );
      }
    }

    await startSession(user.id, remember);
    await db.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        // First successful sign-in activates an invited account.
        ...(user.status === "INVITED" ? { status: "ACTIVE" } : {}),
      },
    });

    return ok(serializeSession(user, user.organization));
  });
}
