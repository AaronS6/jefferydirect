import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { audit, notifyCustomer, optionalStr } from "@/lib/server/service";

const ADDRESS_DECISIONS = new Set(["APPROVED", "DECLINED"]);

/**
 * PATCH — review a customer-requested delivery address. Only addresses
 * awaiting approval (PENDING) can be reviewed; the decision is notified to
 * the customer organization.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);

    const approvalStatus = str(body.approvalStatus, "Approval status", { required: true, max: 20 });
    if (!ADDRESS_DECISIONS.has(approvalStatus)) {
      throw new ApiError("Approval status must be APPROVED or DECLINED.", 422);
    }
    const reviewNote = optionalStr(body.reviewNote, "Review note", 500);

    const address = await db.address.findUnique({ where: { id } });
    if (!address) throw new ApiError("Address not found.", 404);
    if (address.approvalStatus !== "PENDING") {
      throw new ApiError("Only addresses awaiting approval can be reviewed.", 422);
    }

    await db.address.update({
      where: { id: address.id },
      data: {
        approvalStatus,
        reviewedAt: new Date(),
        ...(reviewNote !== undefined ? { reviewNote } : {}),
      },
    });

    if (approvalStatus === "APPROVED") {
      await notifyCustomer(address.orgId, {
        title: "Delivery address approved",
        body: `"${address.label}" is now available for your orders.`,
        kind: "SYSTEM",
        view: "settings",
      });
    } else {
      await notifyCustomer(address.orgId, {
        title: "Delivery address not approved",
        body: `Jeffery Group could not approve "${address.label}" as a delivery address.${reviewNote ? ` Note: ${reviewNote}` : ""} You can review the note in Settings and submit a corrected address.`,
        kind: "SYSTEM",
        view: "settings",
      });
    }
    await audit(admin, "ADDRESS_REVIEWED", "Address", {
      entityId: address.id,
      detail: `${address.label} → ${approvalStatus}${reviewNote ? ` — ${reviewNote}` : ""}`,
    });

    return ok({ ok: true });
  });
}
