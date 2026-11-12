import { db } from "@/lib/db";
import { handler, ok, requireAdmin } from "@/lib/server/api";
import type { EmailLogDto } from "@/types";

/** GET — the latest 50 queued email messages (admin Settings → Email delivery). */
export async function GET() {
  return handler(async () => {
    await requireAdmin();

    const logs = await db.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        toEmail: true,
        toName: true,
        subject: true,
        kind: true,
        status: true,
        createdAt: true,
      },
    });
    const dto: EmailLogDto[] = logs.map((l) => ({
      id: l.id,
      toEmail: l.toEmail,
      toName: l.toName,
      subject: l.subject,
      kind: l.kind,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    }));
    return ok(dto);
  });
}
