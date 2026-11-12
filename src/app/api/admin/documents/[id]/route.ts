import { db } from "@/lib/db";
import { ApiError, handler, ok, requireAdmin } from "@/lib/server/api";
import { audit } from "@/lib/server/service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
      include: { organization: { select: { name: true } } },
    });
    if (!document) throw new ApiError("Document not found.", 404);

    await db.document.delete({ where: { id: document.id } });

    await audit({ id: admin.id, name: admin.name }, "DOCUMENT_DELETED", "Document", {
      entityId: document.id,
      detail: `${document.title} → ${document.organization.name}`,
    });

    return ok({ ok: true });
  });
}
