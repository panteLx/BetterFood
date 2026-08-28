export const CATEGORY_SHELF_LIFE_DAYS: Record<string, number> = {
  milchprodukte: 7,
  fleisch_fisch: 3,
  obst_gemuese: 5,
  brot_backwaren: 4,
  kuehlware_sonstig: 7,
  tiefkuehl: 180,
  konserven: 365,
  trockenwaren: 270,
  getraenke: 180,
  sonstiges: 14,
};

export const CATEGORY_LABELS: Record<string, string> = {
  milchprodukte: "Milchprodukte",
  fleisch_fisch: "Fleisch & Fisch",
  obst_gemuese: "Obst & Gemüse",
  brot_backwaren: "Brot & Backwaren",
  kuehlware_sonstig: "Kühlware (sonstig)",
  tiefkuehl: "Tiefkühl",
  konserven: "Konserven",
  trockenwaren: "Trockenwaren",
  getraenke: "Getränke",
  sonstiges: "Sonstiges",
};

export type Category = keyof typeof CATEGORY_SHELF_LIFE_DAYS;

export function estimateExpiryDate(category: string, from: Date = new Date()): Date {
  const days = CATEGORY_SHELF_LIFE_DAYS[category] ?? CATEGORY_SHELF_LIFE_DAYS.sonstiges;
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Sehr grobe Zuordnung von Open Food Facts "categories_tags" zu unseren
 * eigenen Kategorien. Deckt nicht alles ab -- unbekanntes faellt auf
 * "sonstiges" zurueck und der Nutzer korrigiert bei Bedarf manuell.
 */
export function guessCategoryFromOffTags(tags: string[]): string {
  const joined = tags.join(" ").toLowerCase();
  if (/milk|dairy|cheese|yogurt|yoghurt|milchprodukt/.test(joined)) return "milchprodukte";
  if (/meat|fish|poultry|seafood|fleisch|fisch/.test(joined)) return "fleisch_fisch";
  if (/fruit|vegetable|obst|gemuese/.test(joined)) return "obst_gemuese";
  if (/bread|bakery|brot|backwaren/.test(joined)) return "brot_backwaren";
  if (/frozen|tiefkuehl/.test(joined)) return "tiefkuehl";
  if (/canned|conserve|konserve/.test(joined)) return "konserven";
  if (/pasta|rice|cereal|flour|trocken/.test(joined)) return "trockenwaren";
  if (/beverage|drink|water|juice|getraenk/.test(joined)) return "getraenke";
  return "sonstiges";
}
