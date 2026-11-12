import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { UPDATE_CATEGORIES } from "@/lib/constants";
import { audit } from "@/lib/server/service";
import { serializeTemplate } from "@/lib/server/serialize";

const UPDATE_CATEGORY_SET = new Set<string>(UPDATE_CATEGORIES);

/** GET — all update templates, defaults first, then most recently updated. */
export async function GET() {
  return handler(async () => {
    await requireAdmin();

    const templates = await db.updateTemplate.findMany({
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    return ok(templates.map(serializeTemplate));
  });
}

/**
 * POST — create a reusable update template. Default templates are seeded by
 * the system; admins can only create regular templates.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();
    const body = await readJson(req);

    const title = str(body.title, "Title", { required: true, max: 120 });
    const category = str(body.category, "Category", { required: true, max: 40 });
    if (!UPDATE_CATEGORY_SET.has(category)) throw new ApiError("Invalid update category.", 422);
    const templateBody = str(body.body, "Body", { required: true, max: 4000 });
    if (body.isDefault === true) {
      throw new ApiError(
        "Default templates are seeded by the system — new templates cannot be created as default.",
        422,
      );
    }

    const template = await db.updateTemplate.create({
      data: {
        title,
        category,
        body: templateBody,
        isDefault: false,
        createdById: admin.id,
        createdByName: admin.name,
      },
    });
    await audit(admin, "TEMPLATE_CREATED", "UpdateTemplate", {
      entityId: template.id,
      detail: title,
    });

    return ok(serializeTemplate(template));
  });
}
