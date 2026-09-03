import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession, isListMember } from "@/lib/session";

/**
 * Löst genau EINE Einheit eines Artikels auf.
 *
 * Bei quantity === 1 wird die Zeile selbst auf "used"/"thrown_away" gesetzt --
 * wie bisher. Bei quantity > 1 wird sie stattdessen um eins verringert und
 * eine eigene Archiv-Zeile mit Menge 1 angelegt.
 *
 * Der Split ist wichtig für beides gleichzeitig: der Nutzer kann einen von
 * drei Joghurts abhaken, ohne die anderen zwei zu verlieren (vorher nur über
 * das Bearbeiten-Formular möglich), UND die Rettungsquote zählt jede
 * einzelne Einheit korrekt, statt drei auf einmal oder gar nicht.
 *
 * Die Antwort enthält alles, was der Client zum Rückgängigmachen braucht:
 * bei "whole" reicht ein PATCH zurück auf "active", bei "split" muss die
 * Archiv-Zeile gelöscht und die Menge wieder erhöht werden.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();

  const { id } = await params;
  const itemId = Number(id);
  const { status } = (await req.json()) as { status?: "used" | "thrown_away" };

  if (status !== "used" && status !== "thrown_away") {
    return NextResponse.json({ error: "ungültiger status" }, { status: 400 });
  }

  const item = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.status, "active")))
    .get();

  // Die Liste kommt aus dem Artikel, nicht aus der Sitzung: sonst hätte ein
  // Abhaken hinter einem Deep-Link entweder ins Leere gegriffen oder -- beim
  // Anlegen der Archivzeile weiter unten -- in der falschen Liste gelandet.
  const listId = item?.listId ?? null;
  if (!item || listId === null || !(await isListMember(session.user.id, listId))) {
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
