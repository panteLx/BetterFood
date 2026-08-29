import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items, places } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { rememberProduct } from "@/lib/data";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const body = await req.json();
  const { name, category, expiryDate, quantity, status, placeId, note } = body as {
    name?: string;
    category?: string;
    expiryDate?: string;
    quantity?: number;
    status?: "active" | "used" | "thrown_away";
    placeId?: number | null;
    note?: string | null;
  };

  const update: Partial<typeof items.$inferInsert> = {};

  if (name !== undefined) {
    if (!name.trim()) {
      return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    }
    update.name = name.trim();
  }

  if (category !== undefined) {
    const categoryRow = await db
      .select()
      .from(categories)
      .where(and(eq(categories.key, category), eq(categories.listId, listId)))
      .get();
    if (!categoryRow) {
      return NextResponse.json({ error: "ungültige Kategorie" }, { status: 400 });
    }
    update.category = category;
  }

  if (expiryDate !== undefined) {
    update.expiryDate = new Date(expiryDate);
  }

  if (placeId !== undefined) {
    if (placeId === null) {
      update.placeId = null;
    } else {
      const placeRow = await db
        .select({ id: places.id })
        .from(places)
        .where(and(eq(places.id, placeId), eq(places.listId, listId)))
        .get();
      if (!placeRow) {
        return NextResponse.json({ error: "ungültiger Ort" }, { status: 400 });
      }
      update.placeId = placeRow.id;
    }
  }

  if (note !== undefined) {
    update.note = note?.trim() || null;
  }

  if (quantity !== undefined) {
    const qty = Math.round(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return NextResponse.json({ error: "Menge muss mindestens 1 sein" }, { status: 400 });
    }
    update.quantity = qty;
  }

  if (status !== undefined) {
    if (!["active", "used", "thrown_away"].includes(status)) {
      return NextResponse.json({ error: "ungueltiger status" }, { status: 400 });
    }
    update.status = status;
    update.resolvedAt = status === "active" ? null : new Date();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Keine Änderungen übergeben" }, { status: 400 });
  }

  const [updated] = await db
    .update(items)
    .set(update)
    .where(and(eq(items.id, Number(id)), eq(items.listId, listId), isNull(items.hiddenAt)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  // Wer einen falsch einsortierten Artikel oeffnet und Kategorie oder Ort
  // korrigiert, korrigiert damit auch die Vorauswahl fuer das naechste Mal --
  // der kuerzeste Weg, das Wissen richtigzustellen. Nur bei einer Aenderung
  // an Name, Kategorie oder Ort: ein reines Umdatieren sagt darueber nichts
  // aus, und ein "aufgebraucht" schon gar nicht.
  if (update.name !== undefined || update.category !== undefined || update.placeId !== undefined) {
    await rememberProduct(listId, {
      barcode: updated.barcode,
      name: updated.name,
      category: updated.category,
      placeId: updated.placeId,
    });
  }

  return NextResponse.json(updated);
}

/**
 * Blendet einen Artikel aus, statt ihn zu loeschen.
 *
 * Die Zeile bleibt in der Datenbank, taucht aber in keiner Ansicht mehr auf
 * (alle Abfragen filtern auf hiddenAt IS NULL) -- ein Aufraeumen im Archiv
 * soll nichts unwiederbringlich vernichten. Die Kategorie-Zuordnung haengt
 * nicht daran: die steht in product_knowledge und bleibt so oder so.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const hidden = await db
    .update(items)
    .set({ hiddenAt: new Date() })
    .where(and(eq(items.id, Number(id)), eq(items.listId, listId), isNull(items.hiddenAt)))
    .returning();

  if (hidden.length === 0) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
