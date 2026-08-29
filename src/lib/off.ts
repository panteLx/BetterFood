import { cacheLife } from "next/cache";

export type ProductLookupResult = {
  found: boolean;
  name?: string;
};

// Ohne Timeout haengt /confirm unbegrenzt, wenn Open Food Facts langsam ist --
// und der Nutzer sieht im Mobilfunknetz einen leeren Screen, statt einfach
// weiterzutippen.
const LOOKUP_TIMEOUT_MS = 6000;

// Nur die drei tatsaechlich verwendeten Felder anfordern. Die vollstaendige
// Produktantwort von OFF ist ein Vielfaches davon gross. Die
// "categories_tags" sind bewusst nicht mehr dabei: aus ihnen wurde frueher
// die Kategorie geraten, was zu oft danebenlag -- die Vorauswahl kommt
// jetzt aus der Historie der Liste (siehe lookupKnownProduct).
const FIELDS = "product_name,product_name_de,brands";

/**
 * Produktabfrage bei Open Food Facts.
 *
 * "use cache": derselbe Barcode wird beim wiederholten Scannen -- und beim
 * Stapel-Scan nach dem Einkauf -- nicht erneut geholt, sondern sofort
 * beantwortet. Der Barcode ist das einzige Argument und damit der Cache-Key.
 */
export async function lookupProductByBarcode(barcode: string): Promise<ProductLookupResult> {
  "use cache";
  cacheLife("days");

  let res: Response;
  try {
    res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
      {
        headers: { "User-Agent": "food-tracker-poc/1.0" },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      },
    );
  } catch {
    // Timeout oder Netzfehler: der Nutzer traegt den Namen selbst ein, statt
    // auf einer haengenden Seite zu warten.
    return { found: false };
  }

  if (!res.ok) return { found: false };

  const data = await res.json();
  if (data.status !== 1 || !data.product) return { found: false };

  const product = data.product;
  // brands nur als Rueckfall: viele Produkte in OFF haben eine Marke, aber
  // keinen Produktnamen -- "Ferrero" ist immer noch besser als ein leeres Feld.
  const name: string | undefined =
    product.product_name_de || product.product_name || product.brands || undefined;
  return { found: Boolean(name), name };
}
