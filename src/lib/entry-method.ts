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
export type EntryMethod = "scan" | "ean" | "receipt" | "manual";

export const ENTRY_METHODS: Record<
  EntryMethod,
  { href: string; nextLabel: string }
> = {
  scan: { href: "/scan", nextLabel: "Nächsten Artikel scannen" },
  ean: { href: "/scan-ean", nextLabel: "Nächste EAN eingeben" },
  // Seit der Rechnungsimport im gemeinsamen Prüf-Flow endet, ist /saved auch
  // sein Abschluss-Screen -- und der Weg zurück ist der nächste Beleg, nicht
  // das Formular. Ohne diesen Eintrag bot er "Einen weiteren Artikel manuell
  // eingeben" an, also genau den Weg, den man mit einer Rechnung vermeidet.
  receipt: { href: "/receipt", nextLabel: "Noch eine Rechnung einlesen" },
  manual: {
    href: "/add",
    nextLabel: "Einen weiteren Artikel manuell eingeben",
  },
};

export function parseEntryMethod(value: string | undefined): EntryMethod {
  return value === "scan" || value === "ean" || value === "receipt"
    ? value
    : "manual";
}
