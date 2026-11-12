import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { ORG_ROLES } from "@/lib/constants";
import { audit } from "@/lib/server/service";

const USER_STATUSES = new Set(["ACTIVE", "DISABLED"]);

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  return handler(async () => {
    await requireAdmin();
    const { id, userId } = await params;

    const body = await readJson(req);
    const status = str(body.status, "Status", { required: true, max: 20 });
    if (!USER_STATUSES.has(status)) {
      throw new ApiError("Status must be ACTIVE or DISABLED.", 422);
    }

    // The user must belong to the customer being managed.
    const user = await db.user.findFirst({ where: { id: userId, orgId: id, role: "CUSTOMER" } });
    if (!user) throw new ApiError("User not found for this customer.", 404);

    await db.user.update({ where: { id: user.id }, data: { status } });
    return ok({ ok: true });
  });
}

/**
 * PATCH — change a customer user's portal permission level (and optionally
 * their account status). The user must belong to the customer being managed.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id, userId } = await params;

    const body = await readJson(req);
    const status = str(body.status, "Status", { max: 20 });
    if (status && !USER_STATUSES.has(status)) {
      throw new ApiError("Status must be ACTIVE or DISABLED.", 422);
    }
    const orgRole = str(body.orgRole, "Organization role", { max: 20 });
    if (orgRole && !ORG_ROLES.includes(orgRole as (typeof ORG_ROLES)[number])) {
      throw new ApiError("Organization role must be ORG_ADMIN, PURCHASING or READONLY.", 422);
    }
    if (!status && !orgRole) {
      throw new ApiError("No changes provided.", 422);
    }

    // The user must belong to the customer being managed.
    const user = await db.user.findFirst({ where: { id: userId, orgId: id, role: "CUSTOMER" } });
    if (!user) throw new ApiError("User not found for this customer.", 404);

    await db.user.update({
      where: { id: user.id },
      data: {
        ...(status ? { status } : {}),
        ...(orgRole ? { orgRole } : {}),
      },
    });

    if (orgRole && orgRole !== user.orgRole) {
      await audit(admin, "USER_ROLE_CHANGED", "User", {
        entityId: user.id,
        detail: `${user.name}: ${user.orgRole} → ${orgRole}`,
      });
    }
    if (status && status !== user.status) {
      await audit(admin, "USER_STATUS_CHANGED", "User", {
        entityId: user.id,
        detail: `${user.name}: ${user.status} → ${status}`,
      });
    }

    return ok({ ok: true });
  });
}
