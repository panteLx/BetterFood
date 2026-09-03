import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { estimateExpiryDate } from "@/lib/categories";
import { requireSession, requireActiveList, isListMember } from "@/lib/session";
import { rememberProduct, resolvePlace } from "@/lib/data";
import { findMergeTarget } from "@/lib/item-merge";

export async function GET() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const rows = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.status, "active"),
        eq(items.listId, listId),
        isNull(items.hiddenAt),
      ),
    )
    .orderBy(items.expiryDate);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await requireSession();

  const body = await req.json();
  const {
    name,
    category,
    barcode,
    expiryDate,
    quantity,
    placeId,
    note,
    listId: targetListId,
  } = body as {
    name: string;
    category: string;
    barcode?: string;
    expiryDate?: string;
    quantity?: number;
    placeId?: number | null;
    note?: string | null;
    listId?: number;
  };

  if (!name || !category) {
    return NextResponse.json(
      { error: "name und category sind erforderlich" },
      { status: 400 },
    );
  }

  // Ohne Angabe die aktive Liste -- so rufen Formular, Scan und
  // Rechnungsimport die Route auf und sollen es weiter tun. Angegeben wird
  // die Liste nur vom Nachkaufen auf der Detailseite: dort gibt es keine
  // Artikel-ID, aus der sich die Zielliste ableiten liesse, und hinter einem
  // Deep-Link wäre die aktive Liste die falsche. Geprüft wird sie
  // trotzdem -- ein Client darf sich keine fremde Liste aussuchen.
  let listId: number;
  if (targetListId === undefined) {
    listId = await requireActiveList(session.user.id);
  } else {
    if (!Number.isInteger(targetListId) || !(await isListMember(session.user.id, targetListId))) {
      return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
    }
    listId = targetListId;
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
  // gehören: sonst liesse sich ein Artikel in das Fach einer fremden Liste
  // legen.
  const place = await resolvePlace(placeId, listId);
  if (place === "invalid") {
    return NextResponse.json({ error: "ungültiger Ort" }, { status: 400 });
  }

  const qty = quantity !== undefined ? Math.round(quantity) : 1;
  if (!Number.isFinite(qty) || qty < 1) {
    return NextResponse.json(
      { error: "Menge muss mindestens 1 sein" },
      { status: 400 },
    );
  }

  const now = new Date();
  const expiry = expiryDate
    ? new Date(expiryDate)
    : estimateExpiryDate(categoryRow.shelfLifeDays, now);

  // Nur die Zeilen derselben Kategorie kommen als Ziel in Frage -- nach
  // welcher Regel darunter zusammengefasst wird, steht in findMergeTarget
  // (dieselbe Regel benutzt der Rechnungsimport).
  const sameCategory = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.listId, listId),
        eq(items.status, "active"),
        isNull(items.hiddenAt),
        eq(items.category, category),
      ),
    );

  const existing = findMergeTarget(sameCategory, {
    name,
    category,
    barcode,
    expiryDate: expiry,
  });

  if (existing) {
    const [merged] = await db
      .update(items)
      .set({
        quantity: existing.quantity + qty,
        // Fällt ein gescannter Artikel mit einer von Hand angelegten Zeile
        // zusammen, erbt sie den Barcode -- ab dem nächsten Scan trifft die
        // genauere Erkennung wieder zuerst.
        ...(barcode && !existing.barcode ? { barcode } : {}),
      })
      .where(eq(items.id, existing.id))
      .returning();

    rememberProduct(listId, { barcode, name, category, placeId: place });

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

  // Jeder gespeicherte Artikel ist zugleich eine Aussage darüber, wohin
  // dieses Produkt in diesem Haushalt gehört -- genau davon lebt die
  // Vorauswahl beim nächsten Mal. Der Ort gehört dazu: Joghurt liegt in
  // jedem Haushalt woanders, aber im selben immer am selben Platz.
  rememberProduct(listId, { barcode, name, category, placeId: place });

  return NextResponse.json(created, { status: 201 });
}
