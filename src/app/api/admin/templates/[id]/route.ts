import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { UPDATE_CATEGORIES } from "@/lib/constants";
import { audit } from "@/lib/server/service";
import { serializeTemplate } from "@/lib/server/serialize";

const UPDATE_CATEGORY_SET = new Set<string>(UPDATE_CATEGORIES);

/** PATCH — edit a template (seeded defaults may be edited too). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);

    const template = await db.updateTemplate.findUnique({ where: { id } });
    if (!template) throw new ApiError("Template not found.", 404);

    const title = str(body.title, "Title", { max: 120 });
    const category = str(body.category, "Category", { max: 40 });
    if (category && !UPDATE_CATEGORY_SET.has(category)) {
      throw new ApiError("Invalid update category.", 422);
    }
    const templateBody = str(body.body, "Body", { max: 4000 });
    if (!title && !category && !templateBody) {
      throw new ApiError("No changes provided.", 422);
    }

    const updated = await db.updateTemplate.update({
      where: { id: template.id },
      data: {
        ...(title ? { title } : {}),
        ...(category ? { category } : {}),
        ...(templateBody ? { body: templateBody } : {}),
      },
    });
    await audit(admin, "TEMPLATE_UPDATED", "UpdateTemplate", {
      entityId: template.id,
      detail: updated.title,
    });

    return ok(serializeTemplate(updated));
  });
}

/** DELETE — regular templates only; seeded defaults are permanent. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const template = await db.updateTemplate.findUnique({ where: { id } });
    if (!template) throw new ApiError("Template not found.", 404);
    if (template.isDefault) {
      throw new ApiError("Seeded templates can be edited but not deleted.", 422);
    }

    await db.updateTemplate.delete({ where: { id: template.id } });
    await audit(admin, "TEMPLATE_DELETED", "UpdateTemplate", {
      entityId: template.id,
      detail: template.title,
    });

    return ok({ ok: true });
  });
}
