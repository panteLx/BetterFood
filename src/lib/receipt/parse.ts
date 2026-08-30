import { detectProfile } from "@/lib/receipt/profiles";
import type { IgnoreReason, IgnoredLine, ParsedReceipt, ReceiptLine } from "@/lib/receipt/types";

/**
 * Wie eine Zeile gelesen wird. Zwei Muster, ein Ergebnis -- benannte Gruppen
 * gehen nicht, das Projekt kompiliert gegen ES2017, deshalb steht die
 * Bedeutung der Nummern hier statt im Muster.
 */
type RowPattern = {
  pattern: RegExp;
  read: (match: RegExpExecArray) => { name: string; qty?: string; vat?: string };
};

/**
 * Eine Position, wie sie auf einer Lieferdienst-Rechnung steht:
 *
 *   Name  ␣␣  Menge  ␣  MwSt.  ␣  Einzelpreis €  ␣  Gesamt €
 *
 * Die zwei Leerzeichen vor der Menge sind die Spaltengrenze, die
 * extractLayoutLines aus den Abstaenden im PDF zurueckgewonnen hat -- ein
 * Produktname darf beliebig viele einfache Leerzeichen enthalten und wird
 * trotzdem nicht zerschnitten.
 */
const PRODUCT_ROW: RowPattern = {
  //      1 Name        2 Menge                          3 MwSt.       4 Einzelpreis                      5 Gesamt
  pattern:
    /^(.+?)\s{2,}(-?\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|Stk\.?|stk\.?)?)\s+([A-Z](?:\/[A-Z])?)\s+(?:[\d.,]+\s*€(?:\s*\/\s*(?:kg|l|Stk\.?|stk\.?))?)\s+(?:-?[\d.,]+\s*€)$/,
  read: (match) => ({ name: match[1], qty: match[2], vat: match[3] }),
};

/**
 * Notnagel fuer Belege ohne Mengen- und Steuerspalte: Name, Luecke, Betrag.
 *
 * Wird nur eingesetzt, wenn das strenge Muster im ganzen Dokument keine
 * einzige Position gefunden hat -- sonst wuerde es zwischen den echten Zeilen
 * auch Summen und Steuersaetze einsammeln. Entweder das eine Muster traegt
 * den ganzen Beleg, oder das andere.
 */
const SIMPLE_ROW: RowPattern = {
  pattern: /^(.+?)\s{2,}(?:-?[\d.,]+\s*€)$/,
  read: (match) => ({ name: match[1] }),
};

/** Zeilen, die nach Position aussehen, aber Bilanz sind statt Ware. */
const NON_PRODUCT =
  /^(?:gesamt(?:summe|betrag)?|zwischensumme|summe|steuersatz|nettobetrag|mwst\.?|umsatzsteuer|gezahlter\s+betrag|zu\s+zahlen|bezahlt\s+per|rückgeld|gegeben|produkt|seite\s+\d+|[A-Za-z]\s*=\s*\d)/i;

/**
 * Was auf der Rechnung steht, aber nicht in den Vorrat gehoert.
 *
 * Bewusst hart aussortiert statt nur abgewaehlt: Pfand und Liefergebuehr sind
 * keine Lebensmittel, die man vergessen koennte -- sie als Artikel
 * anzubieten waere schlicht falsch. Dass sie da waren, meldet der Parser
 * trotzdem, damit auf dem Bildschirm "4 Zeilen ignoriert" stehen kann statt
 * einer stillschweigend kuerzeren Liste.
 */
const IGNORE_PATTERNS: { pattern: RegExp; reason: IgnoreReason }[] = [
  { pattern: /^(?:einweg|mehrweg)?pfand/i, reason: "pfand" },
  { pattern: /^leergut/i, reason: "pfand" },
  { pattern: /^(?:liefer|service|bearbeitungs|versand)?(?:gebühr|gebuehr)/i, reason: "gebuehr" },
  { pattern: /(?:gebühr|gebuehr)$/i, reason: "gebuehr" },
  { pattern: /^versandkosten/i, reason: "gebuehr" },
  { pattern: /^trinkgeld/i, reason: "gebuehr" },
];

const DATE = /(\d{1,2})\.(\d{1,2})\.(\d{4})/;

export function parseReceipt(layoutLines: string[]): ParsedReceipt {
  const profile = detectProfile(layoutLines);

  const strict = collectLines(layoutLines, PRODUCT_ROW);
  // Nur wenn das strenge Muster ueberhaupt nichts gefunden hat, uebernimmt
  // das einfache -- siehe SIMPLE_ROW.
  const collected = strict.lines.length > 0 ? strict : collectLines(layoutLines, SIMPLE_ROW);

  return {
    retailer: profile.retailer,
    referenceDate: findDate(layoutLines, profile.dateLabels),
    receiptNumber: findReceiptNumber(layoutLines, profile.receiptNumberLabels),
    lines: collected.lines,
    ignored: collected.ignored,
  };
}

function collectLines(layoutLines: string[], row: RowPattern) {
  const lines: ReceiptLine[] = [];
  const ignored: IgnoredLine[] = [];

  for (const line of layoutLines) {
    const match = row.pattern.exec(line);
    if (!match) continue;
    const fields = row.read(match);

    const name = cleanName(fields.name);
    // Ein Betrag im Namen heisst: hier wurden mehrere Zahlenspalten
    // eingesammelt, das ist keine Position (die Steuertabelle am Belegende
    // sieht sonst wie eine aus).
    if (!name || name.includes("€") || !/[A-Za-zÀ-ÿ]/.test(name)) continue;
    if (NON_PRODUCT.test(name)) continue;

    const reason = IGNORE_PATTERNS.find((entry) => entry.pattern.test(name))?.reason;
    if (reason) {
      ignored.push({ rawName: name, reason });
      continue;
    }

    const { quantity, weight } = parseQuantity(fields.qty);
    // Eine negative Menge ist eine Rueckgabe (zurueckgegebene Pfandtaschen,
    // stornierte Position) -- die legt nichts an, darf aber auch nicht
    // spurlos verschwinden.
    if (quantity < 1) {
      ignored.push({ rawName: name, reason: "gutschrift" });
      continue;
    }

    lines.push({
      rawName: name,
      quantity,
      weight,
      vatClass: fields.vat?.toUpperCase() ?? null,
    });
  }

  return { lines, ignored };
}

function cleanName(value: string | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    // Sternchen und Fussnotenzeichen am Ende ("Pfandtasche*") gehoeren zum
    // Beleg, nicht zum Produkt.
    .replace(/[*†‡]+$/, "")
    .trim();
}

function parseQuantity(value: string | undefined): { quantity: number; weight: string | null } {
  if (!value) return { quantity: 1, weight: null };

  const raw = value.replace(/\s+/g, "");
  // Lose gewogene Ware ("600g" bei 5,99 €/kg): das ist ein Gewicht, keine
  // Stueckzahl. Ein Artikel, das Gewicht wandert in die Notiz.
  const weight = /^(-?[\d.,]+)(kg|g|ml|l)$/i.exec(raw);
  if (weight) return { quantity: 1, weight: raw };

  const quantity = Math.round(Number(raw.replace(",", ".")));
  return {
    quantity: Number.isFinite(quantity) ? quantity : 1,
    weight: null,
  };
}

/**
 * Der Bezugstag aller Haltbarkeiten. Die Reihenfolge der Beschriftungen
 * entscheidet, nicht die Reihenfolge auf dem Papier -- der Liefertermin
 * gewinnt auch dann, wenn das Bestelldatum weiter oben steht.
 */
function findDate(layoutLines: string[], labels: string[]): Date | null {
  for (const label of labels) {
    for (const line of layoutLines) {
      if (!line.toLowerCase().includes(label.toLowerCase())) continue;
      const match = DATE.exec(line.slice(line.toLowerCase().indexOf(label.toLowerCase())));
      if (!match) continue;

      const [, day, month, year] = match;
      // Ueber die Einzelteile statt ueber einen Datums-String: new Date("...")
      // liest je nach Format als UTC und verschiebt den Tag.
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

function findReceiptNumber(layoutLines: string[], labels: string[]): string | null {
  for (const label of labels) {
    for (const line of layoutLines) {
      const index = line.toLowerCase().indexOf(label.toLowerCase());
      if (index === -1) continue;
      const rest = line.slice(index + label.length).trim();
      const match = /^[:\s]*([\w-]{4,})/.exec(rest);
      if (match) return match[1];
    }
  }
  return null;
}
