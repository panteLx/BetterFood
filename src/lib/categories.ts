import type { Category } from "@/db/schema";

/**
 * Reihenfolge und Inhalt der Standardkategorien, mit denen eine neue
 * Datenbank befuellt wird (siehe drizzle/-Migration). Nur hier fuer die
 * Seed-Migration und den OFF-Tag-Abgleich als Referenz gepflegt -- Nutzer
 * koennen Kategorien danach frei umbenennen, hinzufuegen oder loeschen.
 */
export const DEFAULT_CATEGORIES = [
  { key: "milchprodukte", label: "Milchprodukte", shelfLifeDays: 7 },
  { key: "fleisch_fisch", label: "Fleisch & Fisch", shelfLifeDays: 3 },
  { key: "obst_gemuese", label: "Obst & Gemüse", shelfLifeDays: 5 },
  { key: "brot_backwaren", label: "Brot & Backwaren", shelfLifeDays: 4 },
  { key: "kuehlware_sonstig", label: "Kühlware (sonstig)", shelfLifeDays: 7 },
  { key: "tiefkuehl", label: "Tiefkühl", shelfLifeDays: 180 },
  { key: "konserven", label: "Konserven", shelfLifeDays: 365 },
  { key: "trockenwaren", label: "Trockenwaren", shelfLifeDays: 270 },
  { key: "getraenke", label: "Getränke", shelfLifeDays: 180 },
  { key: "sonstiges", label: "Sonstiges", shelfLifeDays: 14 },
] as const;

export function estimateExpiryDate(shelfLifeDays: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + shelfLifeDays);
  return result;
}

export function slugifyCategoryKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "kategorie";
}

/**
 * Sehr grobe Zuordnung von Open Food Facts "categories_tags" zu einer
 * bekannten Kategorie. Deckt nicht alles ab -- unbekanntes faellt auf die
 * uebergebene Fallback-Kategorie zurueck und der Nutzer korrigiert bei
 * Bedarf manuell.
 */
export function guessCategoryFromOffTags(
  tags: string[],
  availableCategories: Pick<Category, "key">[],
): string | undefined {
  const joined = tags.join(" ").toLowerCase();
  const keys = new Set(availableCategories.map((c) => c.key));

  const guess = (() => {
    if (/milk|dairy|cheese|yogurt|yoghurt|milchprodukt/.test(joined)) return "milchprodukte";
    if (/meat|fish|poultry|seafood|fleisch|fisch/.test(joined)) return "fleisch_fisch";
    if (/fruit|vegetable|obst|gemuese/.test(joined)) return "obst_gemuese";
    if (/bread|bakery|brot|backwaren/.test(joined)) return "brot_backwaren";
    if (/frozen|tiefkuehl/.test(joined)) return "tiefkuehl";
    if (/canned|conserve|konserve/.test(joined)) return "konserven";
    if (/pasta|rice|cereal|flour|trocken/.test(joined)) return "trockenwaren";
    if (/beverage|drink|water|juice|getraenk/.test(joined)) return "getraenke";
    return undefined;
  })();

  return guess && keys.has(guess) ? guess : undefined;
}
