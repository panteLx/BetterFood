/**
 * Wie ein Beleg gelesen wird, sobald man weiss, von wem er ist.
 *
 * Bewusst duenn gehalten: ein Profil liefert nur die Beschriftungen, unter
 * denen Datum und Belegnummer stehen -- die Zeilenerkennung selbst ist fuer
 * alle gleich. Ein Regel-Framework auf Grundlage eines einzigen bekannten
 * Musters waere geraten statt gewusst; weitere Haendler kommen dazu, wenn ein
 * echter Beleg zeigt, worin sie sich unterscheiden.
 */
export type ReceiptProfile = {
  id: string;
  /** Anzeigename des Haendlers, oder null wenn nur das generische Profil griff. */
  retailer: string | null;
  /**
   * Datumsfelder in genau der Reihenfolge, in der sie den Bezugstag
   * bestimmen. Der Liefertermin steht vorn, weil die Ware an dem Tag im Haus
   * war -- bestellt wurde sie unter Umstaenden eine Woche vorher.
   */
  dateLabels: string[];
  receiptNumberLabels: string[];
};

const REWE: ReceiptProfile = {
  id: "rewe",
  retailer: "REWE",
  dateLabels: ["Liefertermin", "Rechnungsdatum", "Bestelldatum"],
  receiptNumberLabels: ["Belegnummer"],
};

const GENERIC: ReceiptProfile = {
  id: "generic",
  retailer: null,
  dateLabels: [
    "Liefertermin",
    "Lieferdatum",
    "Rechnungsdatum",
    "Belegdatum",
    "Kaufdatum",
    "Bestelldatum",
    "Datum",
  ],
  receiptNumberLabels: ["Belegnummer", "Rechnungsnummer", "Bonnummer"],
};

const KNOWN: { profile: ReceiptProfile; detect: RegExp }[] = [
  { profile: REWE, detect: /REWE\s+Markt\s+GmbH/i },
];

export function detectProfile(lines: string[]): ReceiptProfile {
  const text = lines.join("\n");
  return KNOWN.find((entry) => entry.detect.test(text))?.profile ?? GENERIC;
}
