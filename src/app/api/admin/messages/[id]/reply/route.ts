import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { notifyCustomer } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const body = await readJson(req);
    const reply = str(body.reply, "Reply", { required: true, max: 4000 });

    const message = await db.message.findUnique({
      where: { id },
      include: { organization: true },
    });
    if (!message) throw new ApiError("Message not found.", 404);

    await db.message.update({
      where: { id: message.id },
      data: {
        status: "ANSWERED",
        reply,
        repliedAt: new Date(),
        repliedBy: `${admin.name} (Jeffery Group)`,
      },
    });

    await notifyCustomer(message.orgId, {
      title: `Reply to "${message.subject}"`,
      body: reply.length > 160 ? `${reply.slice(0, 157).trimEnd()}…` : reply,
      kind: "MESSAGE",
      view: "messages",
      relatedId: message.id,
    });

    return ok({ ok: true });
  });
}
