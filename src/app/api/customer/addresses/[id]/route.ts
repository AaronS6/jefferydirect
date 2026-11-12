import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer } from "@/lib/server/api";
import { requireOrgWrite } from "@/lib/server/service";
import { serializeAddress } from "@/lib/server/serialize";

/**
 * DELETE /api/customer/addresses/:id — remove one of the org's delivery
 * locations. The default can only be removed if it is the last address
 * (or after another default has been set), so checkout always has a
 * destination. Past orders keep their recorded shipping text either way.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    // orgId in the where clause — another org's address is "not found".
    const address = await db.address.findFirst({ where: { id, orgId: user.orgId } });
    if (!address) throw new ApiError("Address not found.", 404);

    if (address.isDefault) {
      const others = await db.address.count({
        where: { orgId: user.orgId, id: { not: address.id } },
      });
      if (others > 0) {
        throw new ApiError(
          "This is your default delivery address — set another one as the default before removing it.",
          422,
        );
      }
    }

    await db.address.delete({ where: { id: address.id } });
    return ok({ ok: true });
  });
}

/**
 * PATCH /api/customer/addresses/:id — make a location the org's default
 * shipping address (done in one transaction so exactly one default exists
 * at any time).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    const body = await readJson(req);
    if (body.isDefault !== true) {
      throw new ApiError("Only setting a default delivery location is supported here.", 422);
    }

    const address = await db.address.findFirst({ where: { id, orgId: user.orgId } });
    if (!address) throw new ApiError("Address not found.", 404);

    await db.$transaction([
      db.address.updateMany({ where: { orgId: user.orgId, isDefault: true }, data: { isDefault: false } }),
      db.address.update({ where: { id: address.id }, data: { isDefault: true } }),
    ]);

    return ok(serializeAddress({ ...address, isDefault: true }));
  });
}
