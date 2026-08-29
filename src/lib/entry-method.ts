/**
 * Auf welchem Weg ein Artikel erfasst wurde -- und wie der Weg zurueck dorthin
 * heisst.
 *
 * Der Abschluss-Screen nach dem Speichern (/saved) bot bisher immer entweder
 * die Kamera oder "Noch etwas eintragen" an, je nachdem ob ein Barcode am
 * Artikel hing. Die EAN-Eingabe fiel damit unter den Tisch, und wer von Hand
 * eintrug, bekam einen Knopf, der nicht sagte, wohin er fuehrt. Nach dem
 * Einkauf erfasst man mehrere Artikel hintereinander -- fast immer auf
 * demselben Weg, deshalb steht hier genau der wieder.
 */
export type EntryMethod = "scan" | "ean" | "manual";

export const ENTRY_METHODS: Record<
  EntryMethod,
  { href: string; nextLabel: string }
> = {
  scan: { href: "/scan", nextLabel: "Nächsten Artikel scannen" },
  ean: { href: "/scan-ean", nextLabel: "Nächste EAN eingeben" },
  manual: {
    href: "/add",
    nextLabel: "Einen weiteren Artikel manuell eingeben",
  },
};

export function parseEntryMethod(value: string | undefined): EntryMethod {
  return value === "scan" || value === "ean" ? value : "manual";
}
