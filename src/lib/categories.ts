/**
 * Die Fächer, mit denen eine neue Liste startet. Bewusst kurz gehalten:
 * drei Orte decken einen normalen Haushalt ab, alles darüber (Keller,
 * Speisekammer, Garage) legt der Nutzer selbst an.
 */
export const DEFAULT_PLACES = ["Kühlschrank", "Gefrierfach", "Vorratsschrank"] as const;

/**
 * Reihenfolge und Inhalt der Standardkategorien, mit denen eine neue
 * Datenbank befüllt wird (siehe drizzle/-Migration). Nur hier für die
 * Seed-Migration als Referenz gepflegt -- Nutzer können Kategorien danach
 * frei umbenennen, hinzufügen oder löschen.
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
 * "Wurst & Aufschnitt" und "Süßwaren & Snacks" sind nachgezogen, weil beide
 * vorher in einer Kategorie landeten, deren Zahlen nicht passten. Salami fiel
 * entweder unter "Fleisch & Fisch" — 3 Tage, für eine vakuumierte Packung
 * viel zu kurz, die App mahnt dann ohne Anlass — oder unter "Kühlware
 * (sonstig)": die 7 Tage stimmen dort, aber 500 g CO₂ untertreiben
 * verarbeitetes Schweinefleisch um rund das Vierfache. Schokolade und Chips
 * erbten von "Trockenwaren" 270 Tage und den CO₂-Wert von Nudeln.
 * Käse-Aufschnitt bleibt dagegen bewusst bei "Milchprodukte" — deren 1400 g
 * passen dort.
 *
 * Die beiden neuen Zahlenpaare entstehen nach derselben Rechnung wie oben:
 * 200 g Wurst mal rund 10 kg CO₂e/kg für verarbeitetes Schweinefleisch
 * ergeben 2000 g, mal rund 12,50 €/kg ergeben 2,50 €. 200 g Schokolade oder
 * Chips mal 6 kg CO₂e/kg ergeben 1200 g — Schokolade liegt wegen des Kakaos
 * deutlich darüber, Chips deutlich darunter, 6 ist der nach unten gerundete
 * Mischwert — mal rund 10 €/kg ergeben 2 €.
 *
 * Bewusst ohne Migration: seedDefaultCategories läuft nur beim Anlegen einer
 * Liste, bestehende Listen bekommen die beiden also nicht nachträglich und
 * legen sie bei Bedarf selbst an. Ein Nachtrag würde sonst in jeder Liste
 * zwei Kategorien einblenden, die dort womöglich längst von Hand unter einem
 * anderen Namen stehen.
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
  { key: "wurst_aufschnitt", label: "Wurst & Aufschnitt", shelfLifeDays: 7, defaultPlace: "Kühlschrank", avgPriceCents: 250, avgCo2Grams: 2000 },
  { key: "obst_gemuese", label: "Obst & Gemüse", shelfLifeDays: 5, defaultPlace: "Kühlschrank", avgPriceCents: 200, avgCo2Grams: 300 },
  { key: "brot_backwaren", label: "Brot & Backwaren", shelfLifeDays: 4, defaultPlace: "Vorratsschrank", avgPriceCents: 250, avgCo2Grams: 400 },
  { key: "kuehlware_sonstig", label: "Kühlware (sonstig)", shelfLifeDays: 7, defaultPlace: "Kühlschrank", avgPriceCents: 250, avgCo2Grams: 500 },
  { key: "tiefkuehl", label: "Tiefkühl", shelfLifeDays: 180, defaultPlace: "Gefrierfach", avgPriceCents: 300, avgCo2Grams: 900 },
  { key: "konserven", label: "Konserven", shelfLifeDays: 365, defaultPlace: "Vorratsschrank", avgPriceCents: 120, avgCo2Grams: 500 },
  { key: "trockenwaren", label: "Trockenwaren", shelfLifeDays: 270, defaultPlace: "Vorratsschrank", avgPriceCents: 180, avgCo2Grams: 600 },
  { key: "suesswaren_snacks", label: "Süßwaren & Snacks", shelfLifeDays: 120, defaultPlace: "Vorratsschrank", avgPriceCents: 200, avgCo2Grams: 1200 },
  { key: "getraenke", label: "Getränke", shelfLifeDays: 180, defaultPlace: "Vorratsschrank", avgPriceCents: 120, avgCo2Grams: 400 },
  { key: "sonstiges", label: "Sonstiges", shelfLifeDays: 14, defaultPlace: null, avgPriceCents: null, avgCo2Grams: null },
] as const;

export function estimateExpiryDate(shelfLifeDays: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + shelfLifeDays);
  return result;
}

/**
 * Label -> Kategorie-Key. Nur die Route POST /api/categories benutzt das; sie
 * hängt bei einer Kollision "_2" an, ein doppelter Key kann hier also nicht
 * entstehen.
 *
 * Die Umlaute werden vor der NFD-Zerlegung ausgeschrieben, weil die Zerlegung
 * sie nicht gleich behandelt: "ü" zerfällt in u + Diakritikum und verliert
 * das Diakritikum eine Zeile später, "ß" zerfällt gar nicht und fällt danach
 * unter die Regel "alles außer a-z0-9 wird zum Unterstrich". Aus "Süßwaren &
 * Snacks" wurde so "su_waren_snacks" statt "suesswaren_snacks" -- also nicht
 * der Key der gleichnamigen Standardkategorie, und die von Hand angelegte
 * Kategorie bekam in der Liste das Fallback-Symbol (Kiste) statt ihres
 * eigenen. Das trifft bestehende Listen unmittelbar: die bekommen die zwei
 * neuen Standardkategorien nicht nachgeliefert und legen sie von Hand an.
 * "Kühlware (sonstig)" ergab aus demselben Grund "kuhlware_sonstig".
 *
 * Das NFC davor, weil ein bereits zerlegt hereingereichtes "ü" (u + U+0308)
 * sonst an /ü/ vorbeiliefe.
 */
export function slugifyCategoryKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "kategorie";
}
