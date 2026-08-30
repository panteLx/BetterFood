/**
 * Was aus einer Rechnung herausfaellt, bevor irgendetwas davon in den Vorrat
 * darf. Bewusst nah am Papier gehalten -- Produktname, Menge, Steuersatz --
 * und ohne jeden Bezug zu Kategorien oder Faechern: die Zuordnung passiert
 * eine Schicht darueber, gegen das, was die Liste bereits gelernt hat.
 */
export type ReceiptLine = {
  /** Der Name, wie er auf der Rechnung steht. */
  rawName: string;
  quantity: number;
  /**
   * Gewichtsangabe aus der Mengenspalte ("600g" bei lose gewogener Ware),
   * sonst null. Landet spaeter in der Notiz des Artikels und ausdruecklich
   * nicht im Namen: der Name ist der Schluessel, unter dem die Liste das
   * Produkt wiedererkennt, und der darf nicht mit jedem Einkauf wechseln.
   */
  weight: string | null;
  /** Steuerklasse laut Beleg: "A" (19 %), "B" (7 %) oder etwas anderes. */
  vatClass: string | null;
};

/** Warum eine erkannte Zeile gar nicht erst zur Auswahl gestellt wird. */
export type IgnoreReason = "pfand" | "gebuehr" | "gutschrift";

export type IgnoredLine = {
  rawName: string;
  reason: IgnoreReason;
};

export type ParsedReceipt = {
  /** Erkannter Haendler, oder null wenn nur das generische Profil griff. */
  retailer: string | null;
  /**
   * Der Tag, auf den sich alle Haltbarkeiten beziehen -- Liefertermin vor
   * Rechnungsdatum vor Bestelldatum. Null, wenn der Beleg keinen hergibt;
   * dann tritt der heutige Tag an seine Stelle.
   */
  referenceDate: Date | null;
  receiptNumber: string | null;
  lines: ReceiptLine[];
  ignored: IgnoredLine[];
};

export const IGNORE_LABELS: Record<IgnoreReason, string> = {
  pfand: "Pfand",
  gebuehr: "Gebühr",
  gutschrift: "Rückgabe",
};

/**
 * Eine Zeile, wie sie der Pruef-Schritt anzeigt: die Rohdaten vom Beleg,
 * angereichert um das, was die Liste ueber das Produkt bereits weiss.
 *
 * Liegt hier und nicht in der Route, damit die Client-Komponente den Typ
 * bekommt, ohne ein Server-Modul zu importieren.
 */
export type ReceiptDraftLine = {
  /** Nur fuer den Client, damit React die Zeilen auseinanderhalten kann. */
  id: string;
  /** Der Name laut Beleg -- bleibt sichtbar, auch wenn der Anzeigename abweicht. */
  rawName: string;
  name: string;
  note: string | null;
  quantity: number;
  /**
   * Steuerklasse laut Beleg. Waehlt nichts mehr vor (siehe `included`),
   * sondern sortiert unbekannte 19-%-Zeilen im Pruefschritt in den
   * Abschnitt "Vermutlich kein Lebensmittel".
   */
  vatClass: string | null;
  /** Immer true beim Einlesen; abwaehlen ist Sache des Nutzers. */
  included: boolean;
  category: string | null;
  /**
   * Die Erstbelegung des Orts: das ueber genau dieses Produkt Gelernte vor
   * dem Standardort der Kategorie. Ab hier gehoert der Ort dem Client --
   * ein aktiver Kategoriewechsel im Pruefschritt holt sich das Fach der
   * neuen Kategorie, solange der Nutzer den Ort nicht selbst gesetzt hat.
   */
  placeId: number | null;
  known: boolean;
};

export type ReceiptDraft = {
  retailer: string | null;
  /** ISO-String; der Tag, auf den sich alle Haltbarkeiten beziehen. */
  referenceDate: string;
  receiptNumber: string | null;
  lines: ReceiptDraftLine[];
  ignored: IgnoredLine[];
};
