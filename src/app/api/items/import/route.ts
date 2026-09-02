import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items, places } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { rememberProduct } from "@/lib/data";
import { normalizeProductName } from "@/lib/utils";
import { findMergeTarget } from "@/lib/item-merge";

/** Mehr Positionen hat keine Rechnung -- alles darueber ist ein Fehler oder ein Angriff. */
const MAX_ITEMS = 300;

/**
 * Laenger ist kein Barcode mehr -- EAN-13, UPC-A und selbst ein GS1 DataBar
 * Expanded bleiben weit darunter. Der Wert kommt aus dem Browser, und 300
 * Zeilen mal einer beliebig langen Zeichenkette waeren sonst genau der Weg,
 * ueber den sich die Tabelle vollschreiben laesst.
 */
const MAX_BARCODE_LENGTH = 64;

type ImportInput = {
  name?: string;
  /**
   * Der Name, wie er auf dem Beleg stand -- nur gesetzt, wenn der Nutzer ihn
   * im Pruefschritt geaendert hat. Siehe unten: die Wiedererkennung muss
   * beide Schreibweisen kennen.
   */
  rawName?: string | null;
  /**
   * EAN/UPC, sofern der Artikel gescannt wurde. `null` bei Belegzeilen und
   * Handeingabe. Er landet auf der Zeile UND in `product_knowledge` -- ohne
   * ihn erkennt der naechste Scan desselben Produkts es nicht wieder.
   */
  barcode?: string | null;
  note?: string | null;
  category?: string;
  placeId?: number | null;
  quantity?: number;
  expiryDate?: string;
};

/**
 * Uebernimmt eine ganze Rechnung auf einmal.
 *
 * Bewusst ein eigener Endpunkt und nicht dreissig Mal POST /api/items:
 *
 * - Die Merge-Suche dort liest bei jedem Aufruf alle aktiven Artikel der
 *   Kategorie. Bei dreissig Positionen waeren das dreissig Durchlaeufe durch
 *   denselben Vorrat; hier reicht einer.
 * - Ein Beleg ist eine Entscheidung, kein Dutzend. Faellt die Haelfte durch,
 *   steht der Nutzer vor einem halb eingeraeumten Vorrat und weiss nicht,
 *   welche Haelfte. Deshalb erst alles pruefen, dann alles schreiben -- in
 *   einer Transaktion.
 * - Und am Ende soll eine Bilanz dastehen ("28 angelegt, 3 zusammengefasst"),
 *   nicht dreissig Einzelantworten.
 *
 * Die Regel, nach der zusammengefasst wird, ist trotzdem dieselbe:
 * findMergeTarget, geteilt mit der Einzelerfassung.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const body = await req.json();
  const { items: input } = body as { items?: ImportInput[] };

  if (!Array.isArray(input) || input.length === 0) {
    return NextResponse.json(
      { error: "Keine Artikel übergeben" },
      { status: 400 },
    );
  }
  if (input.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Höchstens ${MAX_ITEMS} Artikel auf einmal` },
      { status: 400 },
    );
  }

  // Kategorien und Faecher einmal laden statt je Zeile: die Pruefung unten
  // laeuft dann im Speicher.
  const [listCategories, listPlaces] = await Promise.all([
    db.select().from(categories).where(eq(categories.listId, listId)),
    db.select({ id: places.id }).from(places).where(eq(places.listId, listId)),
  ]);
  const categoryKeys = new Set(listCategories.map((category) => category.key));
  const placeIds = new Set(listPlaces.map((place) => place.id));

  const now = new Date();
  const prepared: {
    name: string;
    rawName: string | null;
    barcode: string | null;
    note: string | null;
    category: string;
    placeId: number | null;
    quantity: number;
    expiryDate: Date;
  }[] = [];

  // Erst alles pruefen. Eine einzige krumme Zeile beendet den Import, bevor
  // irgendetwas geschrieben wurde -- sonst haette der Nutzer einen halben
  // Beleg im Vorrat und keine Vorstellung davon, welche Haelfte.
  for (const [index, entry] of input.entries()) {
    const position = index + 1;
    const name = entry.name?.trim();
    if (!name) {
      return NextResponse.json(
        { error: `Zeile ${position}: Name fehlt` },
        { status: 400 },
      );
    }
    if (!entry.category || !categoryKeys.has(entry.category)) {
      return NextResponse.json(
        { error: `Zeile ${position} („${name}“): ungültige Kategorie` },
        { status: 400 },
      );
    }
    if (entry.placeId != null && !placeIds.has(entry.placeId)) {
      return NextResponse.json(
        { error: `Zeile ${position} („${name}“): ungültiger Ort` },
        { status: 400 },
      );
    }

    const quantity =
      entry.quantity === undefined ? 1 : Math.round(entry.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return NextResponse.json(
        {
          error: `Zeile ${position} („${name}“): Menge muss mindestens 1 sein`,
        },
        { status: 400 },
      );
    }

    const expiryDate = entry.expiryDate ? new Date(entry.expiryDate) : null;
    if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
      return NextResponse.json(
        { error: `Zeile ${position} („${name}“): ungültiges Datum` },
        { status: 400 },
      );
    }

    prepared.push({
      name,
      rawName: entry.rawName?.trim() || null,
      barcode: entry.barcode?.trim().slice(0, MAX_BARCODE_LENGTH) || null,
      note: entry.note?.trim() || null,
      category: entry.category,
      placeId: entry.placeId ?? null,
      quantity,
      expiryDate,
    });
  }

  // better-sqlite3 verlangt einen vollstaendig synchronen Transaktionsrumpf
  // (siehe CLAUDE.md) -- deshalb hier ueberall .all()/.run() und ein
  // rememberProduct, das den Executor entgegennimmt.
  const summary = db.transaction((tx) => {
    const active = tx
      .select()
      .from(items)
      .where(
        and(
          eq(items.listId, listId),
          eq(items.status, "active"),
          isNull(items.hiddenAt),
        ),
      )
      .all();

    let created = 0;
    let merged = 0;

    for (const entry of prepared) {
      const target = findMergeTarget(active, entry);

      if (target) {
        const quantity = target.quantity + entry.quantity;
        // Den Barcode nachtragen, wenn die Zielzeile noch keinen hat --
        // dieselbe Regel wie in der Einzelerfassung (POST /api/items).
        // findMergeTarget fasst auch ueber den Namen zusammen, eine von Hand
        // angelegte Zeile kann also das Ziel eines Scans sein; ohne das
        // Nachtragen bliebe sie ohne Barcode. Ein bereits vorhandener wird
        // nicht ueberschrieben: der gehoert zu dem Produkt, das dort steht.
        tx.update(items)
          .set({
            quantity,
            ...(entry.barcode && !target.barcode ? { barcode: entry.barcode } : {}),
          })
          .where(eq(items.id, target.id))
          .run();
        if (entry.barcode && !target.barcode) target.barcode = entry.barcode;
        // Auch im Speicher fortschreiben: steht dasselbe Produkt zweimal auf
        // demselben Beleg, muss die zweite Zeile auf die bereits erhoehte
        // Menge treffen und nicht auf den Stand von vorhin.
        target.quantity = quantity;
        merged += 1;
      } else {
        const [row] = tx
          .insert(items)
          .values({
            name: entry.name,
            category: entry.category,
            barcode: entry.barcode,
            placeId: entry.placeId,
            note: entry.note,
            quantity: entry.quantity,
            addedAt: now,
            expiryDate: entry.expiryDate,
            status: "active",
            listId,
            addedById: session.user.id,
          })
          .returning()
          .all();
        // Die neue Zeile ist ab sofort selbst Kandidat -- zwei gleiche
        // Positionen auf einem Beleg sollen zusammenfallen.
        active.push(row);
        created += 1;
      }

      // Genau wie bei der Einzelerfassung: jeder gespeicherte Artikel ist
      // zugleich die Aussage, wohin dieses Produkt in diesem Haushalt gehoert.
      // Ohne das waere die zweite Rechnung so muehsam wie die erste.
      rememberProduct(
        listId,
        {
          barcode: entry.barcode,
          name: entry.name,
          category: entry.category,
          placeId: entry.placeId,
        },
        tx,
      );

      // Wurde der Name im Pruefschritt begradigt, bekommt die Rohform vom
      // Beleg einen eigenen Eintrag auf denselben Anzeigenamen. Sonst waere
      // das Umbenennen folgenlos: der naechste Beleg schreibt wieder
      // "KAROTTE SNACK RL", und die Liste haette nur "Karotten" gelernt.
      // Zwei Zeilen statt einer ist derselbe Zustand, den ein spaeterer
      // Handeintrag ohnehin erzeugt haette -- nur frueher.
      //
      // Bewusst OHNE barcode, auch wenn der Artikel gescannt wurde:
      // rememberProduct sucht mit Barcode ausschliesslich ueber den Barcode
      // und faende die Zeile von eben wieder -- der Alias ueberschriebe dann
      // ihren nameKey, statt danebenzustehen. Die Rohform braucht einen
      // eigenen, namensbasierten Eintrag.
      if (
        entry.rawName &&
        normalizeProductName(entry.rawName) !== normalizeProductName(entry.name)
      ) {
        rememberProduct(
          listId,
          {
            name: entry.name,
            category: entry.category,
            placeId: entry.placeId,
            lookupName: entry.rawName,
          },
          tx,
        );
      }
    }

    return { created, merged };
  });

  return NextResponse.json(summary, { status: 201 });
}
