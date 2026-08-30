import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList, lookupKnownProduct } from "@/lib/data";
import { extractLayoutLines, ReceiptTooComplexError } from "@/lib/receipt/layout";
import { parseReceipt } from "@/lib/receipt/parse";
import type { ReceiptDraft, ReceiptDraftLine } from "@/lib/receipt/types";

/** Eine Lieferdienst-Rechnung wiegt ein paar hundert Kilobyte. Alles darueber ist keine. */
const MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

/**
 * Wer gerade einen Beleg einliest.
 *
 * Die Groesse allein schuetzt den Prozess nicht: dreissig gleichzeitige
 * Uploads sind dreissig parallele pdf.js-Laeufe in demselben einen Node-
 * Prozess, der auch alle anderen Anfragen bedient. Ein Beleg auf einmal pro
 * Person reicht voellig -- niemand liest zwei Rechnungen gleichzeitig ein.
 *
 * Im Speicher und pro Prozess, dieselbe Bauart wie lib/attempt-limit.ts: die
 * App laeuft als ein einzelner Container, und ein Neustart soll den Eintrag
 * ohnehin vergessen.
 */
const parsing = new Set<string>();

/**
 * Liest eine PDF-Rechnung und macht daraus einen Vorschlag -- mehr nicht.
 *
 * Die Datei wird im Speicher gelesen und nirgends abgelegt: auf einem Beleg
 * stehen Name, Anschrift und Kundennummer, und nichts davon hat einen Grund,
 * die Anfrage zu ueberleben. Gespeichert wird spaeter nur, was der Nutzer im
 * Pruef-Schritt bestaetigt hat.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  if (parsing.has(session.user.id)) {
    return NextResponse.json(
      { error: "Es wird bereits ein Beleg eingelesen. Einen Moment noch." },
      { status: 429 },
    );
  }

  parsing.add(session.user.id);
  try {
    return await parseUpload(req, listId);
  } finally {
    // Auch wenn oben etwas wirft -- ein haengengebliebener Eintrag wuerde den
    // Rechnungsimport fuer diese Person bis zum Neustart sperren.
    parsing.delete(session.user.id);
  }
}

async function parseUpload(req: NextRequest, listId: number) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei übergeben" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Die Datei ist zu groß – höchstens 10 MB." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Ueber die Kennung am Dateianfang statt ueber Endung oder MIME-Typ: beides
  // kommt vom Client und sagt nur, was er glaubt hochzuladen.
  if (new TextDecoder().decode(bytes.slice(0, PDF_MAGIC.length)) !== PDF_MAGIC) {
    return NextResponse.json(
      { error: "Das ist keine PDF-Datei." },
      { status: 400 },
    );
  }

  let layoutLines: string[];
  try {
    layoutLines = await extractLayoutLines(bytes);
  } catch (error) {
    // Eine PDF, die an eine der Schranken stoesst, ist etwas anderes als eine
    // kaputte -- und der Nutzer soll nicht nach einem Fehler suchen, den seine
    // Datei nicht hat.
    if (error instanceof ReceiptTooComplexError) {
      return NextResponse.json(
        {
          error:
            "Diese PDF ist zu umfangreich zum Einlesen. Bitte die Original-Rechnung des Lieferdienstes verwenden.",
        },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: "Die PDF konnte nicht gelesen werden." },
      { status: 400 },
    );
  }

  // Ein Foto oder Scan hat keine Textebene. Das ist kein Fehler des Nutzers,
  // aber ohne Texterkennung auch nichts, was diese Version leisten kann --
  // also sagt sie es, statt eine leere Liste anzuzeigen.
  if (layoutLines.length === 0) {
    return NextResponse.json(
      {
        error:
          "Diese PDF enthält keinen auslesbaren Text – vermutlich ein Scan oder Foto. Bitte die Original-Rechnung des Lieferdienstes verwenden.",
      },
      { status: 422 },
    );
  }

  const receipt = parseReceipt(layoutLines);

  if (receipt.lines.length === 0) {
    return NextResponse.json(
      {
        error:
          "In dieser PDF ließen sich keine Artikel erkennen. Bislang funktionieren Rechnungen von Lieferdiensten – ein Kassenbon vom Markt noch nicht.",
      },
      { status: 422 },
    );
  }

  const [listCategories, listPlaces] = await Promise.all([
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);
  const placeIds = new Set(listPlaces.map((place) => place.id));

  const lines: ReceiptDraftLine[] = [];
  for (const [index, line] of receipt.lines.entries()) {
    // Serverseitig nachgeschlagen statt vom Client aus: dreissig Zeilen
    // waeren sonst dreissig zusaetzliche Anfragen an /api/items/known.
    const known = await lookupKnownProduct(listId, { name: line.rawName });
    // Die gelernte Kategorie kann seit damals umbenannt oder geloescht
    // worden sein -- dasselbe Gegenpruefen wie in /api/items/known.
    const category = listCategories.find((entry) => entry.key === known?.category);
    const learnedPlace =
      known?.placeId != null && placeIds.has(known.placeId) ? known.placeId : null;

    lines.push({
      id: `${index}`,
      rawName: line.rawName,
      // Die eigene Schreibweise des Haushalts gewinnt: wer "Mozzarella" aus
      // "ja! Mozzarella 125g" gemacht hat, will das nicht jedes Mal wieder
      // wegwischen.
      name: known?.name ?? line.rawName,
      note: line.weight,
      quantity: line.quantity,
      vatClass: line.vatClass,
      // Alles angehakt. Der Steuersatz waehlte hier frueher vor -- 19 % sind
      // meistens Drogerie oder Haushalt --, hat dabei aber auch jede Limonade
      // ausgelassen: ein Getraenk mit MHD, das der Nutzer suchen musste. Ein
      // vergessener Artikel kostet mehr als ein abzuwaehlender, deshalb
      // entscheidet der Satz jetzt nichts mehr und ist im Pruefschritt nur
      // noch ein Hinweis an unbekannten Zeilen (vatClass).
      included: true,
      category: category?.key ?? null,
      // Der gelernte Ort des Produkts schlaegt den Standardort der Kategorie
      // -- aber nur fuer diese Erstbelegung: wer im Pruefschritt die
      // Kategorie aktiv wechselt, bekommt deren Fach (ausser er hat den Ort
      // selbst gesetzt).
      placeId: learnedPlace ?? category?.defaultPlaceId ?? null,
      known: Boolean(category),
    });
  }

  const draft: ReceiptDraft = {
    retailer: receipt.retailer,
    // Ohne Datum auf dem Beleg zaehlt der heutige Tag -- irgendein Bezug muss
    // es geben, sonst laesst sich keine Haltbarkeit rechnen.
    referenceDate: (receipt.referenceDate ?? new Date()).toISOString(),
    receiptNumber: receipt.receiptNumber,
    lines,
    ignored: receipt.ignored,
  };

  return NextResponse.json(draft);
}
