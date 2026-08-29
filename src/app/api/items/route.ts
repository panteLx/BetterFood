import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { estimateExpiryDate } from "@/lib/categories";
import { requireSession, requireActiveList } from "@/lib/session";

// "Milch", "milch " und "Milch  " sind derselbe Artikel.
function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export async function GET() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.status, "active"), eq(items.listId, listId)))
    .orderBy(items.expiryDate);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const body = await req.json();
  const { name, category, barcode, expiryDate, quantity } = body as {
    name: string;
    category: string;
    barcode?: string;
    expiryDate?: string;
    quantity?: number;
  };

  if (!name || !category) {
    return NextResponse.json({ error: "name und category sind erforderlich" }, { status: 400 });
  }

  const categoryRow = await db
    .select()
    .from(categories)
    .where(and(eq(categories.key, category), eq(categories.listId, listId)))
    .get();

  if (!categoryRow) {
    return NextResponse.json({ error: "ungültige Kategorie" }, { status: 400 });
  }

  const qty = quantity !== undefined ? Math.round(quantity) : 1;
  if (!Number.isFinite(qty) || qty < 1) {
    return NextResponse.json({ error: "Menge muss mindestens 1 sein" }, { status: 400 });
  }

  const now = new Date();
  const expiry = expiryDate ? new Date(expiryDate) : estimateExpiryDate(categoryRow.shelfLifeDays, now);

  // Drei gleiche Joghurts aus einem Einkauf wurden bisher zu drei identischen
  // Zeilen, obwohl quantity genau dafuer existiert. Zusammengefasst wird nur
  // bei gleichem MHD-Tag: eine frische Milch darf nicht stillschweigend mit
  // einer aelteren verschmelzen.
  //
  // Ohne Barcode entscheidet der Name -- wer denselben Artikel zweimal von
  // Hand eintraegt, meint dasselbe Produkt. Verglichen wird normalisiert
  // (Gross-/Kleinschreibung, doppelte Leerzeichen), sonst trennt schon
  // "Milch " von "Milch".
  const sameProduct = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.listId, listId),
        eq(items.status, "active"),
        eq(items.category, category),
        barcode ? eq(items.barcode, barcode) : isNull(items.barcode),
      ),
    );

  const existing = sameProduct.find(
    (item) =>
      isSameDay(item.expiryDate, expiry) &&
      (barcode ? true : normalizeName(item.name) === normalizeName(name)),
  );

  if (existing) {
    const [merged] = await db
      .update(items)
      .set({ quantity: existing.quantity + qty })
      .where(eq(items.id, existing.id))
      .returning();

    return NextResponse.json({ ...merged, merged: true }, { status: 200 });
  }

  const [created] = await db
    .insert(items)
    .values({
      name,
      category,
      barcode: barcode ?? null,
      quantity: qty,
      addedAt: now,
      expiryDate: expiry,
      status: "active",
      listId,
      addedById: session.user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
