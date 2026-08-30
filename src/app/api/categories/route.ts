import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { slugifyCategoryKey } from "@/lib/categories";
import { requireSession, requireActiveList } from "@/lib/session";
import { categoriesTag, getCategoriesForList, resolvePlace } from "@/lib/data";

export async function GET() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const rows = await getCategoriesForList(listId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const body = await req.json();
  const { label, shelfLifeDays, defaultPlaceId } = body as {
    label: string;
    shelfLifeDays: number;
    // null wie undefined: kein Standardort. Anders als beim PATCH gibt es
    // hier nichts zu leeren, die Kategorie entsteht ja gerade erst.
    defaultPlaceId?: number | null;
  };

  if (!label || !label.trim()) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }
  if (!Number.isFinite(shelfLifeDays) || shelfLifeDays < 1 || shelfLifeDays > 3650) {
    return NextResponse.json(
      { error: "Haltbarkeit muss zwischen 1 und 3650 Tagen liegen" },
      { status: 400 },
    );
  }

  const place = await resolvePlace(defaultPlaceId, listId);
  if (place === "invalid") {
    return NextResponse.json({ error: "ungültiger Ort" }, { status: 400 });
  }

  const existing = await db
    .select({ key: categories.key })
    .from(categories)
    .where(eq(categories.listId, listId));
  const existingKeys = new Set(existing.map((c) => c.key));

  const baseKey = slugifyCategoryKey(label);
  let key = baseKey;
  let suffix = 2;
  while (existingKeys.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  const [created] = await db
    .insert(categories)
    .values({
      key,
      label: label.trim(),
      shelfLifeDays: Math.round(shelfLifeDays),
      defaultPlaceId: place,
      createdAt: new Date(),
      listId,
    })
    .returning();

  revalidateTag(categoriesTag(listId), { expire: 0 });

  return NextResponse.json(created, { status: 201 });
}
