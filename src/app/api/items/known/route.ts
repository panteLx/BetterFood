import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, lookupKnownProduct } from "@/lib/data";

/**
 * "Kennen wir dieses Produkt schon?" -- beantwortet aus der Historie der
 * aktiven Liste.
 *
 * Bewusst ein API-Aufruf aus dem Formular heraus und keine Vorbelegung aus
 * dem Server-Render: unter Cache Components bleibt eine verlassene Seite via
 * <Activity> am Leben, und /confirm zeigte deshalb nach dem Speichern eines
 * Artikels beim naechsten Scan desselben Barcodes noch den alten Stand.
 * Ueber diesen Weg wird bei jedem Anzeigen frisch nachgefragt.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const barcode = req.nextUrl.searchParams.get("barcode")?.trim() || undefined;
  const name = req.nextUrl.searchParams.get("name")?.trim().slice(0, 200) || undefined;

  if (!barcode && !name) {
    return NextResponse.json({ found: false });
  }

  const known = await lookupKnownProduct(listId, { barcode, name });
  if (!known) return NextResponse.json({ found: false });

  // Die gelernte Kategorie kann inzwischen geloescht oder umbenannt worden
  // sein -- dann ist sie keine gueltige Vorauswahl mehr.
  const categories = await getCategoriesForList(listId);
  const category = categories.find((c) => c.key === known.category);
  if (!category) return NextResponse.json({ found: false });

  return NextResponse.json({
    found: true,
    category: category.key,
    shelfLifeDays: category.shelfLifeDays,
    name: known.name,
  });
}
