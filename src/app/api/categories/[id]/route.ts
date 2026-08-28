import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { categoriesTag } from "@/lib/data";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const body = await req.json();
  const { label, shelfLifeDays } = body as { label?: string; shelfLifeDays?: number };

  const update: { label?: string; shelfLifeDays?: number } = {};

  if (label !== undefined) {
    if (!label.trim()) {
      return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    }
    update.label = label.trim();
  }

  if (shelfLifeDays !== undefined) {
    if (!Number.isFinite(shelfLifeDays) || shelfLifeDays < 1 || shelfLifeDays > 3650) {
      return NextResponse.json(
        { error: "Haltbarkeit muss zwischen 1 und 3650 Tagen liegen" },
        { status: 400 },
      );
    }
    update.shelfLifeDays = Math.round(shelfLifeDays);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Keine Änderungen übergeben" }, { status: 400 });
  }

  const [updated] = await db
    .update(categories)
    .set(update)
    .where(and(eq(categories.id, Number(id)), eq(categories.listId, listId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  revalidateTag(categoriesTag(listId), "max");

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const target = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, Number(id)), eq(categories.listId, listId)))
    .get();

  if (!target) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  const allCategories = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.listId, listId));
  if (allCategories.length <= 1) {
    return NextResponse.json(
      { error: "Es muss mindestens eine Kategorie bestehen bleiben" },
      { status: 400 },
    );
  }

  const usingItems = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.category, target.key), eq(items.listId, listId)))
    .limit(1);

  if (usingItems.length > 0) {
    return NextResponse.json(
      { error: "Kategorie wird noch von Artikeln verwendet und kann nicht gelöscht werden" },
      { status: 409 },
    );
  }

  await db.delete(categories).where(eq(categories.id, Number(id)));

  revalidateTag(categoriesTag(listId), "max");

  return NextResponse.json({ ok: true });
}
