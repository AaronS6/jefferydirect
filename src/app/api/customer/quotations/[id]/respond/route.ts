import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireCustomer, str } from "@/lib/server/api";
import { notifyAdmin } from "@/lib/server/service";

const ACTIONS = new Set(["ACCEPT", "REJECT", "REVISION"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireCustomer();
    const { id } = await params;

    const body = await readJson(req);
    const action = str(body.action, "Action", { required: true, max: 20 }).toUpperCase();
    if (!ACTIONS.has(action)) {
      throw new ApiError("Action must be ACCEPT, REJECT or REVISION.", 422);
    }
    const comment = str(body.comment, "Comment", { max: 2000 });

    const quotation = await db.quotation.findFirst({
      where: { id, orgId: user.orgId },
      include: { organization: true },
    });
    if (!quotation) throw new ApiError("Quotation not found.", 404);
    if (quotation.status !== "ISSUED") {
      throw new ApiError("This quotation can only be actioned while it is issued.", 422);
    }

    const newStatus = action === "ACCEPT" ? "ACCEPTED" : action === "REJECT" ? "REJECTED" : "REVISED";
    await db.quotation.update({
      where: { id: quotation.id },
      data: {
        status: newStatus,
        respondedAt: new Date(),
        respondedNote: comment || null,
      },
    });

    const orgName = quotation.organization.name;
    const titles: Record<string, string> = {
      ACCEPT: `Quotation ${quotation.quoteNumber} accepted`,
      REJECT: `Quotation ${quotation.quoteNumber} declined`,
      REVISION: `Quotation ${quotation.quoteNumber} — revision requested`,
    };
    const verbs: Record<string, string> = {
      ACCEPT: "accepted",
      REJECT: "declined",
      REVISION: "requested a revision to",
    };
    await notifyAdmin({
      title: titles[action],
      body: `${orgName} ${verbs[action]} quotation ${quotation.quoteNumber}.${comment ? ` Comment: ${comment}` : ""}`,
      kind: "QUOTATION",
      view: "admin-quote-detail",
      relatedId: quotation.id,
    });

    return ok({ ok: true });
  });
}
