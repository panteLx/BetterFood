import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items, places } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { estimateExpiryDate } from "@/lib/categories";
import { requireSession, requireActiveList } from "@/lib/session";
import { rememberProduct } from "@/lib/data";
import { normalizeProductName } from "@/lib/utils";

/**
 * Prueft eine uebergebene Ort-ID gegen die aktive Liste. Liefert die ID, null
 * (kein Ort gewaehlt) oder "invalid", wenn der Ort einer anderen Liste
 * gehoert.
 */
async function resolvePlace(placeId: number | null | undefined, listId: number) {
  if (placeId === undefined || placeId === null) return null;

  const row = await db
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.id, placeId), eq(places.listId, listId)))
    .get();

  return row ? row.id : ("invalid" as const);
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
    .where(and(eq(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
    .orderBy(items.expiryDate);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const body = await req.json();
  const { name, category, barcode, expiryDate, quantity, placeId, note } = body as {
    name: string;
    category: string;
    barcode?: string;
    expiryDate?: string;
    quantity?: number;
    placeId?: number | null;
    note?: string | null;
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

  // Der Ort ist optional, muss aber -- wenn angegeben -- zu dieser Liste
  // gehoeren: sonst liesse sich ein Artikel in das Fach einer fremden Liste
  // legen.
  const place = await resolvePlace(placeId, listId);
  if (place === "invalid") {
    return NextResponse.json({ error: "ungültiger Ort" }, { status: 400 });
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
        isNull(items.hiddenAt),
        eq(items.category, category),
        barcode ? eq(items.barcode, barcode) : isNull(items.barcode),
      ),
    );

  const existing = sameProduct.find(
    (item) =>
      isSameDay(item.expiryDate, expiry) &&
      (barcode ? true : normalizeProductName(item.name) === normalizeProductName(name)),
  );

  if (existing) {
    const [merged] = await db
      .update(items)
      .set({ quantity: existing.quantity + qty })
      .where(eq(items.id, existing.id))
      .returning();

    await rememberProduct(listId, { barcode, name, category, placeId: place });

    return NextResponse.json({ ...merged, merged: true }, { status: 200 });
  }

  const [created] = await db
    .insert(items)
    .values({
      name,
      category,
      barcode: barcode ?? null,
      placeId: place,
      note: note?.trim() || null,
      quantity: qty,
      addedAt: now,
      expiryDate: expiry,
      status: "active",
      listId,
      addedById: session.user.id,
    })
    .returning();

  // Jeder gespeicherte Artikel ist zugleich eine Aussage darueber, wohin
  // dieses Produkt in diesem Haushalt gehoert -- genau davon lebt die
  // Vorauswahl beim naechsten Mal. Der Ort gehoert dazu: Joghurt liegt in
  // jedem Haushalt woanders, aber im selben immer am selben Platz.
  await rememberProduct(listId, { barcode, name, category, placeId: place });

  return NextResponse.json(created, { status: 201 });
}
