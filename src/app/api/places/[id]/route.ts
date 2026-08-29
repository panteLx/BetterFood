import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { places } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { placesTag } from "@/lib/data";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }

  const [updated] = await db
    .update(places)
    .set({ name: name.trim() })
    .where(and(eq(places.id, Number(id)), eq(places.listId, listId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  revalidateTag(placesTag(listId), { expire: 0 });

  return NextResponse.json(updated);
}

/**
 * Loescht einen Ort. Die Artikel darin bleiben -- ihr place_id faellt per
 * "ON DELETE SET NULL" auf null zurueck.
 *
 * Anders als beim Loeschen einer Kategorie gibt es hier bewusst keine Sperre
 * bei benutzten Orten: ein Fach aufzuloesen ist eine normale Aenderung im
 * Haushalt, und der Vorrat darin verliert dadurch nur seine Einordnung, nicht
 * seine Existenz.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const deleted = await db
    .delete(places)
    .where(and(eq(places.id, Number(id)), eq(places.listId, listId)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  revalidateTag(placesTag(listId), { expire: 0 });

  return NextResponse.json({ ok: true });
}
