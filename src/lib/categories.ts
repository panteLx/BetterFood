/**
 * Die Faecher, mit denen eine neue Liste startet. Bewusst kurz gehalten:
 * drei Orte decken einen normalen Haushalt ab, alles darueber (Keller,
 * Speisekammer, Garage) legt der Nutzer selbst an.
 */
export const DEFAULT_PLACES = ["Kühlschrank", "Gefrierfach", "Vorratsschrank"] as const;

/**
 * Reihenfolge und Inhalt der Standardkategorien, mit denen eine neue
 * Datenbank befuellt wird (siehe drizzle/-Migration). Nur hier fuer die
 * Seed-Migration als Referenz gepflegt -- Nutzer koennen Kategorien danach
 * frei umbenennen, hinzufuegen oder loeschen.
 *
 * defaultPlace ist das Fach, in dem eine Kategorie ueblicherweise liegt --
 * die Vorbelegung von categories.defaultPlaceId. Das ist keine Vermutung
 * ueber ein konkretes Produkt (die trifft weiterhin allein
 * product_knowledge), sondern eine Aussage ueber die app-eigenen Kategorien
 * und die app-eigenen Faecher: Tiefkuehl liegt im Gefrierfach, sonst waere
 * es keins. Unter /knowledge jederzeit aenderbar -- und "Sonstiges" bekommt
 * bewusst keins, weil die Kategorie ueber den Ort nichts aussagt.
 */
export const DEFAULT_CATEGORIES = [
  { key: "milchprodukte", label: "Milchprodukte", shelfLifeDays: 7, defaultPlace: "Kühlschrank" },
  { key: "fleisch_fisch", label: "Fleisch & Fisch", shelfLifeDays: 3, defaultPlace: "Kühlschrank" },
  { key: "obst_gemuese", label: "Obst & Gemüse", shelfLifeDays: 5, defaultPlace: "Kühlschrank" },
  { key: "brot_backwaren", label: "Brot & Backwaren", shelfLifeDays: 4, defaultPlace: "Vorratsschrank" },
  { key: "kuehlware_sonstig", label: "Kühlware (sonstig)", shelfLifeDays: 7, defaultPlace: "Kühlschrank" },
  { key: "tiefkuehl", label: "Tiefkühl", shelfLifeDays: 180, defaultPlace: "Gefrierfach" },
  { key: "konserven", label: "Konserven", shelfLifeDays: 365, defaultPlace: "Vorratsschrank" },
  { key: "trockenwaren", label: "Trockenwaren", shelfLifeDays: 270, defaultPlace: "Vorratsschrank" },
  { key: "getraenke", label: "Getränke", shelfLifeDays: 180, defaultPlace: "Vorratsschrank" },
  { key: "sonstiges", label: "Sonstiges", shelfLifeDays: 14, defaultPlace: null },
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
