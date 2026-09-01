/**
 * Die Schätzwerte einer Kategorie -- Ø Preis und Ø CO₂ je Artikel -- zwischen
 * Formular und Datenbank.
 *
 * Gespeichert wird in Ganzzahlen (Cent, Gramm), eingegeben wird in Euro und
 * Kilogramm: der Nutzer denkt in "1,50 €" und "1,4 kg", die Summe über
 * hundert Artikel darf sich dabei aber nicht verrechnen. Die Umrechnung
 * gehört deshalb an eine Stelle und nicht in jedes Formular, das sie braucht
 * -- Kategorie-Editor heute, Rechnungsimport womöglich morgen.
 */

/** 1000 € je Artikel: darüber ist es kein Lebensmittel mehr, sondern ein Tippfehler. */
export const MAX_PRICE_CENTS = 100_000;

/** 100 kg CO₂e je Artikel -- dieselbe Überlegung, weit jenseits jedes Einkaufs. */
export const MAX_CO2_GRAMS = 100_000;

/**
 * Prüft einen von außen kommenden Ganzzahlwert.
 *
 * `null` ist ein gültiger Wert und heißt "diese Kategorie zählt nicht mit";
 * `"invalid"` unterscheidet das vom Fehlerfall, damit der Aufrufer 400 statt
 * eines stillen Leerens liefern kann.
 */
export function parseEstimate(
  value: number | null,
  max: number,
): number | null | "invalid" {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > max) return "invalid";
  return Math.round(value);
}

/**
 * Eine Dezimalzahl, wie ein Mensch sie tippt: Ziffern, höchstens ein Komma
 * oder Punkt, höchstens eine Nachkommagruppe.
 *
 * Streng und nicht `Number()` allein, weil `Number()` deutlich mehr durchlässt
 * als hier gemeint ist -- "1e5" wären 100.000, "0x10" wären 16, und beides
 * landete kommentarlos als Schätzwert in der Datenbank.
 */
const DECIMAL = /^\d+(?:[.,]\d+)?$/;

/**
 * Eingabefeld -> Ganzzahl. Leer heißt `null` ("zählt nicht mit").
 *
 * Akzeptiert Komma wie Punkt: auf einer deutschen Tastatur tippt niemand
 * "1.50" für eineinhalb Euro, und `Number("1,50")` ist NaN.
 *
 * Das Feld dahinter ist bewusst `type="text"` mit `inputMode="decimal"` und
 * kein `type="number"`. Ein Zahlenfeld gibt bei einer Eingabe, die es selbst
 * nicht versteht, über `value` den leeren String zurück -- ein Komma in einem
 * Browser ohne deutsche Zahlenlokalisierung reicht dafür. Diese Funktion
 * bekäme dann "" zu sehen, läse daraus "der Nutzer hat den Wert bewusst
 * geleert" und würde einen bestehenden Schätzwert löschen, statt einen Fehler
 * zu melden. Als Textfeld überlebt die Rohschreibweise bis hierher, und
 * "ungültig" bleibt von "geleert" unterscheidbar.
 */
export function parseEstimateInput(
  input: string,
  factor: number,
  max: number,
): number | null | "invalid" {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!DECIMAL.test(trimmed)) return "invalid";
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
  const scaled = Math.round(parsed * factor);
  if (scaled > max) return "invalid";
  return scaled;
}

/**
 * Ganzzahl -> Eingabefeld. `null` wird zum leeren Feld, damit "nicht gesetzt"
 * beim Bearbeiten nicht versehentlich zu einer 0 wird.
 *
 * Mit Komma, weil das Feld ein Textfeld ist und der Nutzer im selben Feld
 * auch mit Komma weiterschreibt. Ein Punkt stünde dort als einziges Zeichen
 * der Oberfläche in englischer Schreibweise.
 *
 * `minDecimals` erzwingt nachlaufende Nullen. Geld braucht sie -- "2,5 €" ist
 * keine Schreibweise, die jemand auf einem Kassenbon findet, und genau das
 * fiel im Test der Runde 8 an der Kategorieliste auf. Kilogramm brauchen sie
 * nicht: "0,40 kg" behauptet eine Genauigkeit, die eine Schätzung nicht hat.
 * Deshalb ein Parameter und nicht zwei Funktionen -- der Unterschied liegt in
 * der Einheit, nicht im Zweck.
 */
export function formatEstimateInput(
  value: number | null,
  factor: number,
  minDecimals = 0,
): string {
  if (value === null) return "";
  return (value / factor)
    .toFixed(Math.max(minDecimals, decimalsOf(value, factor)))
    .replace(".", ",");
}

/** Wie viele Nachkommastellen der Wert selbst braucht, höchstens drei. */
function decimalsOf(value: number, factor: number): number {
  for (let digits = 0; digits < 3; digits += 1) {
    if (Number((value / factor).toFixed(digits)) === value / factor) return digits;
  }
  return 3;
}

/** Cent je Euro. */
export const PRICE_FACTOR = 100;

/** Gramm je Kilogramm. */
export const CO2_FACTOR = 1000;
