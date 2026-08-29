import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";

/**
 * Loest genau EINE Einheit eines Artikels auf.
 *
 * Bei quantity === 1 wird die Zeile selbst auf "used"/"thrown_away" gesetzt --
 * wie bisher. Bei quantity > 1 wird sie stattdessen um eins verringert und
 * eine eigene Archiv-Zeile mit Menge 1 angelegt.
 *
 * Der Split ist wichtig fuer beides gleichzeitig: der Nutzer kann einen von
 * drei Joghurts abhaken, ohne die anderen zwei zu verlieren (vorher nur ueber
 * das Bearbeiten-Formular moeglich), UND die Rettungsquote zaehlt jede
 * einzelne Einheit korrekt, statt drei auf einmal oder gar nicht.
 *
 * Die Antwort enthaelt alles, was der Client zum Rueckgaengigmachen braucht:
 * bei "whole" reicht ein PATCH zurueck auf "active", bei "split" muss die
 * Archiv-Zeile geloescht und die Menge wieder erhoeht werden.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const itemId = Number(id);
  const { status } = (await req.json()) as { status?: "used" | "thrown_away" };

  if (status !== "used" && status !== "thrown_away") {
    return NextResponse.json({ error: "ungueltiger status" }, { status: 400 });
  }

  const item = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.listId, listId), eq(items.status, "active")))
    .get();

  if (!item) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  const now = new Date();

  if (item.quantity <= 1) {
    const [updated] = await db
      .update(items)
      .set({ status, resolvedAt: now })
      .where(eq(items.id, itemId))
      .returning();

    return NextResponse.json({
      mode: "whole",
      item: updated,
      undo: { itemId, archiveId: null },
    });
  }

  const [archived] = await db
    .insert(items)
    .values({
      name: item.name,
      category: item.category,
      barcode: item.barcode,
      placeId: item.placeId,
      note: item.note,
      quantity: 1,
      addedAt: item.addedAt,
      expiryDate: item.expiryDate,
      status,
      resolvedAt: now,
      listId,
      addedById: item.addedById,
    })
    .returning();

  const [updated] = await db
    .update(items)
    .set({ quantity: item.quantity - 1 })
    .where(eq(items.id, itemId))
    .returning();

  return NextResponse.json({
    mode: "split",
    item: updated,
    undo: { itemId, archiveId: archived.id },
  });
}
