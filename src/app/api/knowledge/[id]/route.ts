import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, productKnowledge } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { normalizeProductName } from "@/lib/utils";

/**
 * Korrigiert einen Eintrag der Wissensdatenbank.
 *
 * Bewusst ohne Auswirkung auf bereits erfasste Artikel: was einmal im Vorrat
 * liegt, bleibt dort, wo der Nutzer es abgelegt hat. Wer den Artikel selbst
 * umsortieren will, oeffnet ihn -- das schreibt das Wissen ohnehin mit fort.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const body = await req.json();
  const { name, category } = body as { name?: string; category?: string };

  const target = await db
    .select()
    .from(productKnowledge)
    .where(and(eq(productKnowledge.id, Number(id)), eq(productKnowledge.listId, listId)))
    .get();

  if (!target) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  const update: { name?: string; nameKey?: string; category?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    }
    const nameKey = normalizeProductName(trimmed);
    // Ohne Barcode ist der Name der Schluessel: zwei Eintraege mit demselben
    // Namen wuerden sich gegenseitig ueberschreiben, sobald der Artikel das
    // naechste Mal erfasst wird.
    if (!target.barcode && nameKey !== target.nameKey) {
      const clash = await db
        .select({ id: productKnowledge.id })
        .from(productKnowledge)
        .where(
          and(
            eq(productKnowledge.listId, listId),
            isNull(productKnowledge.barcode),
            eq(productKnowledge.nameKey, nameKey),
            ne(productKnowledge.id, target.id),
          ),
        )
        .get();
      if (clash) {
        return NextResponse.json(
          { error: "Es gibt bereits einen Eintrag mit diesem Namen" },
          { status: 409 },
        );
      }
    }
    update.name = trimmed;
    update.nameKey = nameKey;
  }

  if (category !== undefined) {
    const categoryRow = await db
      .select({ key: categories.key })
      .from(categories)
      .where(and(eq(categories.key, category), eq(categories.listId, listId)))
      .get();
    if (!categoryRow) {
      return NextResponse.json({ error: "ungültige Kategorie" }, { status: 400 });
    }
    update.category = category;
  }

  if (update.name === undefined && update.category === undefined) {
    return NextResponse.json({ error: "Keine Änderungen übergeben" }, { status: 400 });
  }

  const [updated] = await db
    .update(productKnowledge)
    .set(update)
    .where(eq(productKnowledge.id, target.id))
    .returning();

  return NextResponse.json(updated);
}

/**
 * Vergisst ein Produkt wieder. Der naechste Scan steht dann wie beim ersten
 * Mal ohne Vorauswahl da -- und die naechste Entscheidung legt den Eintrag
 * neu an.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const deleted = await db
    .delete(productKnowledge)
    .where(and(eq(productKnowledge.id, Number(id)), eq(productKnowledge.listId, listId)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
