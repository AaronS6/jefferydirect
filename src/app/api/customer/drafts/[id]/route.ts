import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer } from "@/lib/server/api";
import { optionalStr, requireOrgWrite } from "@/lib/server/service";
import { serializeDraft } from "@/lib/server/serialize";
import { parseDraftPayload } from "../../_validation";

/** PATCH /api/customer/drafts/:id — rename and/or replace the payload of an own draft. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    const body = await readJson(req);
    const data: { name?: string; payload?: string } = {};
    if (body.name !== undefined) {
      data.name = optionalStr(body.name, "Draft name", 120) ?? "Untitled draft";
    }
    if (body.payload !== undefined) {
      data.payload = JSON.stringify(parseDraftPayload(body.payload));
    }

    // userId in the where clause — another user's draft is "not found".
    const existing = await db.orderDraft.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new ApiError("Draft not found.", 404);

    const updated = await db.orderDraft.update({ where: { id: existing.id }, data });
    return ok(serializeDraft(updated));
  });
}

/** DELETE /api/customer/drafts/:id — discard an own draft. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    requireOrgWrite(user);
    const { id } = await params;

    const existing = await db.orderDraft.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new ApiError("Draft not found.", 404);

    await db.orderDraft.delete({ where: { id: existing.id } });
    return ok({ ok: true });
  });
}
