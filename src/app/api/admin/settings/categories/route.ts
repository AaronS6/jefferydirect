import { db } from "@/lib/db";
import { ApiError, handler, ok, readJson, requireAdmin, str } from "@/lib/server/api";
import { audit } from "@/lib/server/service";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "category"
  );
}

export async function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin();

    const body = await readJson(req);
    const name = str(body.name, "Category name", { required: true, max: 80 });
    const description = str(body.description, "Description", { max: 240 });

    // Slug uniqueness — append a counter when the natural slug is taken.
    const base = slugify(name);
    let slug = base;
    for (let attempt = 2; ; attempt++) {
      const clash = await db.category.findUnique({ where: { slug } });
      if (!clash) break;
      slug = `${base}-${attempt}`;
      if (attempt > 99) throw new ApiError("Could not derive a unique slug. Try a different name.", 422);
    }

    const last = await db.category.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const category = await db.category.create({
      data: {
        name,
        slug,
        description: description || null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });

    await audit({ id: admin.id, name: admin.name }, "CATEGORY_CREATED", "Category", {
      entityId: category.id,
      detail: name,
    });

    return ok({ id: category.id });
  });
}
