import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer } from "@/lib/server/api";
import { optionalStr, requireOrgWrite } from "@/lib/server/service";
import { serializeDraft } from "@/lib/server/serialize";
import { MAX_DRAFTS, parseDraftPayload } from "../_validation";

/** GET /api/customer/drafts — this user's saved drafts, most recently touched first. */
export async function GET() {
  return handler(async () => {
    const user = await requireCustomer();
    const drafts = await db.orderDraft.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return ok(drafts.map(serializeDraft));
  });
}

/**
 * POST /api/customer/drafts — save an incomplete order request so the customer
 * can pick up where they left off. Drafts are private to the saving user.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);

    const body = await readJson(req);
    const name = optionalStr(body.name, "Draft name", 120) ?? "Untitled draft";
    const payload = parseDraftPayload(body.payload);

    const count = await db.orderDraft.count({ where: { userId: user.id } });
    if (count >= MAX_DRAFTS) {
      throw new ApiError(
        `You can keep at most ${MAX_DRAFTS} saved drafts. Delete one before saving another.`,
        422,
      );
    }

    const draft = await db.orderDraft.create({
      data: {
        orgId: user.orgId,
        userId: user.id,
        name,
        payload: JSON.stringify(payload),
      },
    });
    return ok(serializeDraft(draft));
  });
}
