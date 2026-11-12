import { db } from "@/lib/db";
import { handler, ok, requireCustomer } from "@/lib/server/api";
import { serializeCategory } from "@/lib/server/serialize";

export async function GET() {
  return handler(async () => {
    await requireCustomer(); // portal catalogue requires a customer session
    const categories = await db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return ok(categories.map(serializeCategory));
  });
}
