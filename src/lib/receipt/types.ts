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
   * Steuerklasse laut Beleg. Waehlt nichts ab, sondern stellt eine Frage:
   * eine unbekannte Zeile mit "A" (19 %) geht als `foodDoubt` in den Batch
   * und wird im Pruef-Flow abgefragt wie jede andere -- nur mit dem Hinweis
   * "vermutlich kein Lebensmittel" im Schritt. Uebersprungen wird sie nicht
   * mehr vorab: 19 % tragen auch Limonaden, und der Testlauf verlor so einen
   * Energydrink, den niemand am Ende unter 34 Namen wieder herausfischt.
   */
  vatClass: string | null;
  category: string | null;
  /**
   * Die Erstbelegung des Orts: das ueber genau dieses Produkt Gelernte vor
   * dem Standardort der Kategorie. Ab hier gehoert der Ort dem Client --
   * im Pruef-Flow schlaegt ein bereits gesetzter Ort den Standard einer
   * spaeter gewaehlten Kategorie, weil das ueber dieses Produkt Gelernte
   * genauer ist als die Regel der Kategorie.
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
