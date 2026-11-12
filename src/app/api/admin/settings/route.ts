import { db } from "@/lib/db";
import { handler, ok, requireAdmin } from "@/lib/server/api";
import { serializeCategory } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    await requireAdmin();

    const categories = await db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return ok({ categories: categories.map(serializeCategory) });
  });
}
