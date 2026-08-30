import { normalizeProductName } from "@/lib/utils";

/**
 * Das Minimum, das eine Vorratszeile mitbringen muss, um als Ziel einer
 * Zusammenfassung in Frage zu kommen.
 */
export type MergeCandidate = {
  name: string;
  category: string;
  barcode: string | null;
  expiryDate: Date;
};

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Findet die Zeile, in der ein neuer Artikel aufgehen soll -- oder keine.
 *
 * Drei gleiche Joghurts aus einem Einkauf sollen eine Zeile mit Menge 3
 * werden, nicht drei identische Zeilen; genau dafuer gibt es quantity.
 * Zusammengefasst wird aber nur bei gleichem MHD-Tag: eine frische Milch darf
 * nicht stillschweigend mit einer aelteren verschmelzen und deren Warnung
 * erben.
 *
 * Der Barcode ist dabei das genauere von zwei Erkennungsmerkmalen, kein
 * Trennzeichen: zweimal gescannte Margarine und dieselbe Margarine von Hand
 * nachgetragen sind derselbe Artikel, standen aber in getrennten Zeilen, weil
 * die eine Seite einen Barcode hatte und die andere nicht. Der Name wird
 * normalisiert verglichen, sonst trennt schon "Milch " von "Milch".
 *
 * Reine Funktion und ohne eigene Abfrage, weil die beiden Aufrufer ihre
 * Kandidaten verschieden beschaffen: die Einzelerfassung liest sie pro
 * Kategorie, der Rechnungsimport einmal fuer den ganzen Beleg. Die Regel,
 * nach der zusammengefasst wird, darf davon nicht abhaengen.
 */
export function findMergeTarget<T extends MergeCandidate>(
  candidates: T[],
  target: { name: string; category: string; barcode?: string | null; expiryDate: Date },
): T | undefined {
  const sameDay = candidates.filter(
    (candidate) =>
      candidate.category === target.category &&
      isSameDay(candidate.expiryDate, target.expiryDate),
  );

  const barcode = target.barcode?.trim();
  const byBarcode = barcode
    ? sameDay.find((candidate) => candidate.barcode === barcode)
    : undefined;
  if (byBarcode) return byBarcode;

  const nameKey = normalizeProductName(target.name);
  return sameDay.find((candidate) => normalizeProductName(candidate.name) === nameKey);
}
