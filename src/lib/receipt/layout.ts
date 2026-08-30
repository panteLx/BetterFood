import "server-only";
import { getDocumentProxy } from "unpdf";

/** Zwei Textstuecke gelten als dieselbe Zeile, wenn ihre Grundlinien so nah beieinander liegen. */
const ROW_TOLERANCE = 2.5;

/**
 * Ab welchem Abstand -- relativ zur Schrifthoehe -- eine Luecke keine
 * Wortluecke mehr ist, sondern ein Spaltenwechsel. Der Parser trennt die
 * Spalten spaeter an zwei oder mehr Leerzeichen, deshalb muss dieser
 * Unterschied hier entstehen.
 */
const COLUMN_GAP_RATIO = 0.55;
const WORD_GAP_RATIO = 0.12;

type Fragment = { text: string; x: number; y: number; width: number; height: number };

/**
 * Macht aus einer PDF wieder die Zeilen, die ein Mensch auf dem Papier sieht.
 *
 * PDF kennt keine Zeilen, nur Textstuecke mit Koordinaten -- in der
 * Lesereihenfolge stehen die Zellen einer Tabellenzeile zwar hintereinander,
 * aber ohne jede Spaltengrenze. Genau die wird hier aus den Abstaenden
 * zurueckgewonnen: gleiche Grundlinie ergibt eine Zeile, eine grosse Luecke
 * darin ergibt zwei Leerzeichen. Das ist dasselbe Ergebnis wie bei
 * "pdftotext -layout", und daran ist die Zeilenerkennung in parse.ts geeicht.
 */
export async function extractLayoutLines(data: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(data);
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const fragments: Fragment[] = [];
    for (const item of content.items) {
      // Nur echte Textstuecke: PDFs setzen Spaltenabstaende oft als eigene
      // Leerzeichen-Items mit voller Luecken-Breite. Die wieder mitzuzaehlen
      // wuerde genau den Abstand verschlucken, aus dem hier die Spalten
      // entstehen.
      if (!("str" in item) || !item.str.trim()) continue;
      fragments.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      });
    }

    for (const row of groupIntoRows(fragments)) {
      const text = joinRow(row).trimEnd();
      if (text) lines.push(text);
    }
  }

  return lines;
}

function groupIntoRows(fragments: Fragment[]): Fragment[][] {
  const rows: Fragment[][] = [];

  // Von oben nach unten: in PDF-Koordinaten waechst y nach oben.
  for (const fragment of [...fragments].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(current[0].y - fragment.y) <= ROW_TOLERANCE) {
      current.push(fragment);
    } else {
      rows.push([fragment]);
    }
  }

  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

function joinRow(row: Fragment[]): string {
  let text = "";
  let cursor = Number.NEGATIVE_INFINITY;

  for (const fragment of row) {
    if (text) {
      const gap = fragment.x - cursor;
      // Die Schrifthoehe als Massstab, nicht ein fester Punktwert: dieselbe
      // Luecke bedeutet in einer 6-pt-Fusszeile etwas anderes als in einer
      // 14-pt-Ueberschrift.
      const scale = fragment.height || 10;
      if (gap > scale * COLUMN_GAP_RATIO) text += "  ";
      else if (gap > scale * WORD_GAP_RATIO) text += " ";
    }
    text += fragment.text;
    cursor = fragment.x + fragment.width;
  }

  return text;
}
