import { handler, ok } from "@/lib/server/api";
import { endSession } from "@/lib/server/auth";

export async function POST() {
  return handler(async () => {
    await endSession();
    return ok({});
  });
}
