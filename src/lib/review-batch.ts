"use client";

/**
 * Der Zwischenspeicher zwischen "erfassen" und "prüfen".
 *
 * Bis Runde 8 war Erfassen ein Artikel pro Besuch: scannen -> /confirm ->
 * speichern -> wieder scannen. Nach dem Wocheneinkauf war das ein Dutzend
 * Formulare hintereinander. Jetzt wird erst gesammelt und danach einmal
 * geprüft, und dieser Batch ist das, was zwischen beiden Schritten liegt.
 *
 * Drei Stellen benutzen ihn:
 *
 * 1. `/scan` (Batch-Scan) schreibt je bestätigtem Barcode einen Eintrag.
 * 2. `/review/[index]` (Prüf-Flow) liest ihn, ergänzt MHD und Status je
 *    Eintrag, und löscht ihn nach dem erfolgreichen
 *    `POST /api/items/import`.
 * 3. Der Rechnungsimport (`receipt-import.tsx`) schreibt die geparsten
 *    Belegzeilen in denselben Batch und schickt den Nutzer ebenfalls nach
 *    `/review/0` -- er bekommt damit denselben Prüf-Bildschirm statt eines
 *    zweiten, eigenen.
 *
 * ## Warum `sessionStorage` und kein Server-State
 *
 * Der Batch ist flüchtig: er existiert zwischen Kasse und Kühlschrank und
 * danach nie wieder. Eine Tabelle dafür anzulegen hieße, halbfertige
 * Einkäufe dauerhaft aufzubewahren und irgendwann wieder aufzuräumen.
 * `sessionStorage` gilt pro Tab -- zwei Personen im selben Haushalt können
 * gleichzeitig einräumen, ohne sich gegenseitig die Liste zu verändern --
 * und übersteht einen Reload, was `localStorage` zwar auch täte, aber
 * `localStorage` überlebt auch das Schließen des Tabs: ein abgebrochener
 * Einkauf von vorgestern begrüßte den Nutzer dann Tage später wieder.
 *
 * ## Warum ein eigener Typ und nicht direkt `ImportInput`
 *
 * `POST /api/items/import` nimmt fertige Artikel entgegen (Name, Kategorie,
 * Ort, MHD). Der Batch enthält aber gerade das Halbfertige: ein Eintrag
 * kann ohne Kategorie und ohne Datum darin liegen, weil genau das im
 * Prüf-Flow noch entschieden wird. Die Felder sind trotzdem so benannt wie
 * dort, damit der Abschluss eine reine Projektion ist und keine Übersetzung.
 *
 * ## Vertrag für die Schreiber
 *
 * - Der Scan-Screen setzt `barcode`, `name`, `quantity`, `known`,
 *   `category`, `placeId`, `source: "scan"`. `status` bleibt `"pending"`,
 *   `expiryDate` bleibt `null` -- beides gehört dem Prüf-Flow.
 * - Der Rechnungsimport setzt zusätzlich `rawName` (die Schreibweise vom
 *   Beleg, aus der `POST /api/items/import` den Alias in `product_knowledge`
 *   lernt), `purchasedAt`, `sourceQuantity` und `foodDoubt`. `barcode` ist
 *   dort `null`, Belegzeilen haben keinen.
 * - `expiryDate` und `status` schreibt ausschließlich der Prüf-Flow. Auch
 *   eine Zeile mit `foodDoubt` kommt `pending` herein: der Verdacht ist ein
 *   Hinweis, keine Entscheidung.
 *
 * ## `purchasedAt`
 *
 * Die Haltbarkeit rechnet ab dem Bezugsdatum, nicht ab heute. Beim Scannen
 * ist das dasselbe und das Feld bleibt `null`; eine Rechnung, die erst zwei
 * Tage später eingelesen wird, ergäbe sonst durchweg zwei Tage zu lange
 * Haltbarkeiten (derselbe Fehler, den `receipt-import.tsx` mit seinem
 * `referenceDate` schon einmal behoben hat). Der Prüf-Flow rechnet den
 * Richtwert deshalb ab `purchasedAt ?? heute`.
 */

import { useSyncExternalStore } from "react";

/** Woher der Eintrag stammt -- der Prüf-Flow zeigt je Quelle andere Hinweise. */
export type BatchSource = "scan" | "receipt";

/**
 * Wo der Eintrag im Prüf-Flow steht.
 *
 * `skipped` ist nicht dasselbe wie gelöscht: der Eintrag bleibt sichtbar
 * (durchgestrichen, mit "Doch übernehmen"), landet aber weder im Vorrat noch
 * in `product_knowledge`.
 */
export type BatchEntryStatus = "pending" | "done" | "skipped";

export type BatchEntry = {
  /**
   * Stabile Kennung innerhalb des Batches. Nicht der Barcode: Belegzeilen
   * haben keinen, und zwei Zeilen desselben Belegs dürfen sich nicht
   * gegenseitig überschreiben. Der Prüf-Flow adressiert seine Schritte über
   * den Index, braucht für die Fertig-/Übersprungen-Listen und als
   * React-Key aber etwas, das ein Umsortieren übersteht.
   */
  id: string;
  /** EAN/UPC, sofern gescannt. `null` bei Belegzeilen und Handeingabe. */
  barcode: string | null;
  /** Anzeigename. Beim Scan zunächst der Barcode, bis die Abfrage antwortet. */
  name: string;
  /**
   * Der Name, wie er ursprünglich dastand, falls der Nutzer ihn geändert
   * hat -- `POST /api/items/import` lernt daraus beide Schreibweisen.
   */
  rawName: string | null;
  /** Immer >= 1. Derselbe Barcode ein zweites Mal erhöht diese Zahl. */
  quantity: number;
  /**
   * Die Menge, wie die Quelle sie gemeldet hat -- `null` beim Scan, wo es
   * keine gibt (dort zählt der Nutzer selbst, indem er ein zweites Mal
   * scannt).
   *
   * Steht daneben, sobald `quantity` davon abweicht: „laut Beleg 6×" neben
   * einer korrigierten 4 sagt, dass die Abweichung Absicht war und nicht ein
   * Vertipper. Ohne diesen Bezug ließe sich eine falsch erkannte Menge nicht
   * von einer bewusst geänderten unterscheiden.
   */
  sourceQuantity: number | null;
  /**
   * Der Beleg legt nahe, dass das kein Lebensmittel ist: 19 % Mehrwertsteuer
   * an einer Zeile, die diese Liste noch nicht kennt.
   *
   * Ein Hinweis und keine Vorauswahl. Der erste Anlauf ließ solche Zeilen
   * bereits `skipped` in den Batch laufen, damit Klopapier und Spülmittel
   * keinen eigenen Schritt kosten -- nur trifft der Steuersatz eben auch
   * jede Limonade. Der Testlauf fand einen Energydrink, der so unbemerkt
   * aus dem Einkauf fiel: übersprungene Zeilen stehen erst am Ende und
   * niemand liest dort 34 Namen gegen. Ein vergessener Artikel kostet mehr
   * als ein abzuwählender, also kommt die Zeile `pending` herein und trägt
   * ihren Verdacht sichtbar im Schritt.
   */
  foodDoubt: boolean;
  /**
   * Treffer in `product_knowledge` dieser Liste -- also "diese Liste hat das
   * schon einmal einsortiert". **Nicht** "bei Open Food Facts gefunden":
   * OFF liefert nur einen Namen, keine Einordnung, und ein dort bekanntes
   * Produkt ist für den Nutzer trotzdem neu.
   */
  known: boolean;
  /** Kategorie-`key`, sofern gelernt. Sonst fragt der Prüf-Flow danach. */
  category: string | null;
  /** Ort, sofern gelernt. `null` heißt "kein Fach", nicht "unbekannt". */
  placeId: number | null;
  note: string | null;
  /** Bezugsdatum als `yyyy-mm-dd`; `null` heißt "ab heute rechnen". */
  purchasedAt: string | null;
  /** Vom Prüf-Flow gesetztes MHD als `yyyy-mm-dd`. */
  expiryDate: string | null;
  status: BatchEntryStatus;
  source: BatchSource;
};

/** Alles außer den Feldern, die `createEntry` selbst vergibt. */
export type NewBatchEntry = Partial<Omit<BatchEntry, "id" | "source">> & {
  source: BatchSource;
};

/**
 * Der Schlüssel trägt eine Version, weil hier ein Objektgraph liegt und kein
 * String. Ändert sich die Form der Einträge, bekommt der Schlüssel eine neue
 * Nummer -- ein Nutzer mit offenem Tab über ein Deploy hinweg bekommt dann
 * einen leeren Batch statt halb gelesener Einträge.
 *
 * v2: `sourceQuantity` und `foodDoubt` kamen mit dem Rechnungsimport dazu.
 * `parseEntry` läse einen v1-Eintrag zwar fehlerfrei -- beide Felder haben
 * einen Vorgabewert --, aber die Regel oben gilt trotzdem: ein halber Einkauf
 * aus dem Stand vor dem Deploy ist die schlechtere Hinterlassenschaft als ein
 * leerer Batch, und diese Klasse von Fehlern soll gar nicht erst entstehen.
 *
 * v3: die Form ist dieselbe, die Bedeutung nicht -- eine Zeile mit
 * `foodDoubt` kommt seither `pending` statt `skipped` herein. Ein v2-Batch
 * trüge genau die Vorauswahl weiter, die hier abgeschafft wird, und zwar
 * unsichtbar. Deshalb auch hier eine neue Nummer.
 */
export const REVIEW_BATCH_KEY = "bf.review-batch.v3";

/**
 * Mehr Positionen nimmt `POST /api/items/import` ohnehin nicht an (MAX_ITEMS
 * dort). Der Deckel steht auch hier, damit ein hängengebliebener Scanner den
 * `sessionStorage` nicht vollschreibt.
 */
export const MAX_BATCH_ENTRIES = 300;

/**
 * Kein Artikel wiegt mehr als das -- alles darüber ist ein Zählfehler.
 *
 * Exportiert, weil der Stepper im Prüf-Schritt gegen denselben Deckel sperren
 * muss: eine zweite 999 dort wäre eine, die beim Ändern übersehen wird.
 */
export const MAX_QUANTITY = 999;

function isStatus(value: unknown): value is BatchEntryStatus {
  return value === "pending" || value === "done" || value === "skipped";
}

function isSource(value: unknown): value is BatchSource {
  return value === "scan" || value === "receipt";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Ein einzelner Eintrag aus dem Speicher.
 *
 * Geprüft wird nicht gegen einen Angreifer -- `sessionStorage` ist
 * gleichursprünglich und niemand Fremdes schreibt hinein -- sondern gegen
 * den eigenen Bestand: ein Tab, der ein Deploy überlebt hat, kann Einträge
 * einer älteren Form enthalten. Eine Zeile, die nicht passt, fällt weg;
 * einen ganzen Einkauf wegen eines krummen Feldes zu verwerfen wäre die
 * teurere Reaktion.
 */
function parseEntry(raw: unknown): BatchEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.name !== "string") return null;
  if (!isSource(value.source)) return null;

  const quantity = typeof value.quantity === "number" ? Math.round(value.quantity) : 1;

  return {
    id: value.id,
    barcode: nullableString(value.barcode),
    name: value.name,
    rawName: nullableString(value.rawName),
    quantity: Number.isFinite(quantity) ? Math.min(Math.max(quantity, 1), MAX_QUANTITY) : 1,
    sourceQuantity: typeof value.sourceQuantity === "number" ? value.sourceQuantity : null,
    foodDoubt: value.foodDoubt === true,
    known: value.known === true,
    category: nullableString(value.category),
    placeId: typeof value.placeId === "number" ? value.placeId : null,
    note: nullableString(value.note),
    purchasedAt: nullableString(value.purchasedAt),
    expiryDate: nullableString(value.expiryDate),
    status: isStatus(value.status) ? value.status : "pending",
    source: value.source,
  };
}

/** Der Batch, so wie er im `sessionStorage` steht. Leer, wenn nichts Lesbares dasteht. */
function readStorage(): BatchEntry[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(REVIEW_BATCH_KEY);
  } catch {
    // Safari im privaten Modus und Browser mit gesperrtem Speicher werfen
    // hier, statt null zu liefern. Ohne Zwischenspeicher ist der Batch
    // eben leer -- das ist unschön, aber kein Grund, den Screen zu töten.
    return EMPTY;
  }
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed
      .map(parseEntry)
      .filter((entry): entry is BatchEntry => entry !== null)
      .slice(0, MAX_BATCH_ENTRIES);
  } catch {
    return EMPTY;
  }
}

function writeStorage(entries: BatchEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    // Ein leerer Batch loescht den Schluessel, statt "[]" abzulegen: dann
    // unterscheidet sich "der Einkauf ist eingeraeumt" nicht von "hier war
    // noch nie einer", und das soll es auch nicht.
    if (entries.length === 0) {
      window.sessionStorage.removeItem(REVIEW_BATCH_KEY);
      return;
    }
    window.sessionStorage.setItem(REVIEW_BATCH_KEY, JSON.stringify(entries));
  } catch {
    // Voller oder gesperrter Speicher. Der Batch lebt dann nur im Cache
    // dieses Moduls weiter und übersteht keinen Reload -- immer noch besser
    // als ein abgebrochener Scan.
  }
}

/* ------------------------------------------------------------------ *
 * Der Batch als externer Speicher
 *
 * Nicht als React-State in einem der Screens, und das ist der Kern der
 * Sache: `/scan` und `/review` sehen denselben Batch, und unter Cache
 * Components hängt Next die verlassene Route nicht aus, sondern versteckt
 * sie per <Activity> (node_modules/next/dist/docs/01-app/02-guides/
 * preserving-ui-state.md). Eine Kopie im State von `/scan` überlebte das --
 * und zeigte nach der Rückkehr aus dem Prüf-Flow noch den Stand von davor,
 * genau der Bug, den `/confirm` mit `product_knowledge` schon einmal hatte.
 * Ein Speicher außerhalb von React hat diese Klasse von Fehlern nicht: es
 * gibt keine zweite Kopie, die veralten könnte.
 *
 * `useSyncExternalStore` ist dafür das vorgesehene Werkzeug -- dasselbe
 * Muster wie `use-is-client.ts`. Der Schnappschuss wird gecacht, weil
 * `getSnapshot` bei unverändertem Zustand referenzgleich antworten muss;
 * ein frisches `JSON.parse` je Aufruf ließe React endlos rendern.
 * ------------------------------------------------------------------ */

/** Eine einzige leere Liste, damit `getSnapshot` referenzstabil bleibt. */
const EMPTY: BatchEntry[] = [];

let snapshot: BatchEntry[] | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BatchEntry[] {
  snapshot ??= readStorage();
  return snapshot;
}

/**
 * Auf dem Server gibt es keinen `sessionStorage`, also auch keinen Batch.
 * React hydratisiert mit diesem Wert und wechselt danach auf den echten --
 * das ist der Grund, warum hier kein Hydration-Mismatch entsteht, obwohl
 * Server und Browser Unterschiedliches sehen.
 */
function getServerSnapshot(): BatchEntry[] {
  return EMPTY;
}

/** Der Batch dieses Tabs, reaktiv. Nur in Client-Komponenten. */
export function useBatch(): BatchEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Der Batch, ohne React. Für Aufrufer außerhalb des Renderns -- etwa den
 * Rechnungsimport, der seine Zeilen anhängt und danach weiternavigiert.
 */
export function readBatch(): BatchEntry[] {
  return getSnapshot();
}

/** Setzt den Batch: Cache, `sessionStorage` und alle Abonnenten in einem Zug. */
export function writeBatch(entries: BatchEntry[]): void {
  const next = entries.length > MAX_BATCH_ENTRIES ? entries.slice(0, MAX_BATCH_ENTRIES) : entries;
  snapshot = next;
  writeStorage(next);
  for (const listener of listeners) listener();
}

/**
 * Lesen, ändern, schreiben in einem Schritt.
 *
 * Der bevorzugte Weg für alles, was den vorigen Stand braucht: zwischen
 * `readBatch()` und `writeBatch()` von Hand kann eine zweite Änderung
 * liegen -- beim Batch-Scan etwa die Antwort einer Produktabfrage, die
 * eintrifft, während der nächste Code schon erfasst wird.
 */
export function updateBatch(change: (previous: BatchEntry[]) => BatchEntry[]): void {
  writeBatch(change(getSnapshot()));
}

export function clearBatch(): void {
  writeBatch(EMPTY);
}

/**
 * Ein Eintrag mit gesetzten Vorgaben.
 *
 * `crypto.randomUUID` ist in jedem Browser da, der `getUserMedia` über
 * einen sicheren Kontext liefert -- und ohne den gibt es hier ohnehin
 * nichts zu scannen. Der Rückfall auf Zeit + Zufall steht trotzdem da,
 * weil der Rechnungsimport auch ohne Kamera läuft.
 */
export function createEntry(input: NewBatchEntry): BatchEntry {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    barcode: input.barcode ?? null,
    name: input.name ?? "",
    rawName: input.rawName ?? null,
    quantity: Math.min(Math.max(Math.round(input.quantity ?? 1), 1), MAX_QUANTITY),
    sourceQuantity: input.sourceQuantity ?? null,
    foodDoubt: input.foodDoubt ?? false,
    known: input.known ?? false,
    category: input.category ?? null,
    placeId: input.placeId ?? null,
    note: input.note ?? null,
    purchasedAt: input.purchasedAt ?? null,
    expiryDate: input.expiryDate ?? null,
    status: input.status ?? "pending",
    source: input.source,
  };
}

/**
 * Hängt einen Eintrag an -- oder erhöht die Menge, wenn derselbe Barcode
 * schon dasteht.
 *
 * Das ist die Regel, die alle drei Schreiber teilen und die deshalb hier
 * liegt und nicht im Scan-Screen: zwei gleiche Joghurts sind ein Artikel
 * mit Menge 2, keine zwei Zeilen, die der Nutzer im Prüf-Flow zweimal
 * durchklicken muss. Zusammengefasst wird nur über den Barcode, weil nur
 * er beweist, dass es dasselbe Produkt ist -- zwei Belegzeilen mit
 * demselben abgekürzten Namen können durchaus zwei verschiedene Dinge sein.
 *
 * Rein und ohne Speicherzugriff, damit der Aufrufer sie im
 * `setState`-Updater benutzen kann, wo er den vorigen Stand hat.
 */
export function mergeEntry(entries: BatchEntry[], entry: BatchEntry): BatchEntry[] {
  if (entry.barcode) {
    const index = entries.findIndex((existing) => existing.barcode === entry.barcode);
    if (index >= 0) {
      const existing = entries[index];
      const next = [...entries];
      next[index] = {
        ...existing,
        quantity: Math.min(existing.quantity + entry.quantity, MAX_QUANTITY),
      };
      return next;
    }
  }
  if (entries.length >= MAX_BATCH_ENTRIES) return entries;
  return [...entries, entry];
}

/**
 * Der erste noch offene Eintrag, oder -1, wenn keiner mehr offen ist.
 *
 * Alle Einstiege in den Prüf-Flow stellen dieselbe Frage: wer nach einem
 * halb durchgegangenen Einkauf zurückkommt, soll dort weitermachen, wo er
 * aufgehört hat, und nicht bei einem Artikel, über den längst entschieden
 * ist.
 */
export function firstPendingIndex(entries: BatchEntry[]): number {
  return entries.findIndex((entry) => entry.status === "pending");
}
