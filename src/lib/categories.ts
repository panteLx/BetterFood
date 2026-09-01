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
 * defaultPlace ist das Fach, in dem eine Kategorie üblicherweise liegt —
 * die Vorbelegung von categories.defaultPlaceId. Das ist keine Vermutung
 * über ein konkretes Produkt (die trifft weiterhin allein
 * product_knowledge), sondern eine Aussage über die app-eigenen Kategorien
 * und die app-eigenen Fächer: Tiefkühl liegt im Gefrierfach, sonst wäre
 * es keins. Unter /knowledge jederzeit änderbar — und "Sonstiges" bekommt
 * bewusst keins, weil die Kategorie über den Ort nichts aussagt.
 *
 * avgPriceCents und avgCo2Grams schätzen, was ein durchschnittlicher Artikel
 * dieser Kategorie wert ist — die Grundlage der Ersparnis-Zahlen auf der
 * Startseite. Zugrunde liegt je eine typische Einkaufseinheit (Milch 500 g
 * bzw. 1 l, Fleisch 400 g, Obst 500 g, Getränke 1 l) mal einem üblichen
 * Lebenszyklus-Kennwert pro Kilogramm. Bewusst nach unten gerundet: eine zu
 * niedrige Zahl untertreibt, eine zu hohe behauptet eine Ersparnis, die es
 * nicht gab — und die zweite Sorte Fehler kostet das Vertrauen in alle
 * anderen Zahlen der App gleich mit.
 *
 * "Sonstiges" bekommt keine Werte: eine Kategorie, die alles sein kann, kann
 * nichts schätzen. null heißt hier "zählt nicht mit", nicht "kostet nichts".
 * Beides ist im Kategorie-Editor überschreibbar; bestehende Listen haben
 * dieselben Startwerte einmalig über die Migration 0012 bekommen.
 */
export const DEFAULT_CATEGORIES = [
  // key, label, shelfLifeDays, defaultPlace, avgPriceCents, avgCo2Grams
  { key: "milchprodukte", label: "Milchprodukte", shelfLifeDays: 7, defaultPlace: "Kühlschrank", avgPriceCents: 150, avgCo2Grams: 1400 },
  { key: "fleisch_fisch", label: "Fleisch & Fisch", shelfLifeDays: 3, defaultPlace: "Kühlschrank", avgPriceCents: 500, avgCo2Grams: 2800 },
  { key: "obst_gemuese", label: "Obst & Gemüse", shelfLifeDays: 5, defaultPlace: "Kühlschrank", avgPriceCents: 200, avgCo2Grams: 300 },
  { key: "brot_backwaren", label: "Brot & Backwaren", shelfLifeDays: 4, defaultPlace: "Vorratsschrank", avgPriceCents: 250, avgCo2Grams: 400 },
  { key: "kuehlware_sonstig", label: "Kühlware (sonstig)", shelfLifeDays: 7, defaultPlace: "Kühlschrank", avgPriceCents: 250, avgCo2Grams: 500 },
  { key: "tiefkuehl", label: "Tiefkühl", shelfLifeDays: 180, defaultPlace: "Gefrierfach", avgPriceCents: 300, avgCo2Grams: 900 },
  { key: "konserven", label: "Konserven", shelfLifeDays: 365, defaultPlace: "Vorratsschrank", avgPriceCents: 120, avgCo2Grams: 500 },
  { key: "trockenwaren", label: "Trockenwaren", shelfLifeDays: 270, defaultPlace: "Vorratsschrank", avgPriceCents: 180, avgCo2Grams: 600 },
  { key: "getraenke", label: "Getränke", shelfLifeDays: 180, defaultPlace: "Vorratsschrank", avgPriceCents: 120, avgCo2Grams: 400 },
  { key: "sonstiges", label: "Sonstiges", shelfLifeDays: 14, defaultPlace: null, avgPriceCents: null, avgCo2Grams: null },
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
