"use client";

/**
 * Der Abschluss eines Prüf-Durchlaufs: ein einziger Import für den ganzen
 * Einkauf.
 *
 * Stand bis zu dieser Einheit in `review-step.tsx`, weil es dort nur einen
 * Aufrufer gab. Seit das MHD auch direkt beim Scannen eingetragen werden kann,
 * gibt es zwei: wer alles schon im Blatt entschieden hat, soll nicht durch einen
 * leeren Prüf-Flow laufen müssen, um auf "Übernehmen" zu drücken.
 *
 * Hier liegt ausschließlich, was ohne React auskommt -- die Projektion auf
 * `ImportInput`, der Aufruf und der Text daneben. `setCommitting`, `clearBatch`,
 * `router.refresh()` und die Navigation bleiben bei den Aufrufern: sie haben
 * unterschiedliche UI-Zustände, aber dieselbe Reihenfolge danach, und die steht
 * in der Spec und nicht in diesem Modul.
 */

import type { EntryMethod } from "@/lib/entry-method";
import { fromDateInputValue } from "@/lib/expiry";
import type { BatchEntry } from "@/lib/review-batch";

export type CommitOutcome =
  /**
   * Alles übersprungen -- es gibt nichts zu schreiben. Der Aufrufer muss den
   * Batch trotzdem leeren, sonst begrüßt derselbe Einkauf den Nutzer beim
   * nächsten Scan erneut.
   */
  | { wrote: false }
  | {
      wrote: true;
      /** Fertig formulierte Bilanz für `/saved`. */
      summary: string;
      /** Der Weg, auf dem der Einkauf hereinkam -- und der Weg zurück. */
      method: EntryMethod;
    };

/**
 * Schickt alles Entschiedene an `POST /api/items/import`.
 *
 * Wirft mit der Meldung der Route, wenn der Import fehlschlägt. Der Batch
 * bleibt dann unberührt, der Nutzer kann denselben Knopf noch einmal drücken.
 */
export async function commitBatch(batch: BatchEntry[]): Promise<CommitOutcome> {
  // Typprädikat statt eines "!" weiter unten: der Filter beweist, dass
  // expiryDate dasteht, und TypeScript kann das aus einem gewöhnlichen
  // Vergleich nicht ableiten.
  const ready = batch.filter(
    (item): item is BatchEntry & { expiryDate: string } =>
      item.status === "done" && item.expiryDate !== null,
  );
  if (ready.length === 0) return { wrote: false };

  const res = await fetch("/api/items/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: ready.map((item) => ({
        name: item.name.trim(),
        // Die Schreibweise vom Beleg bzw. aus Open Food Facts, falls der
        // Nutzer den Namen begradigt hat -- daraus lernt der Import den
        // Alias in product_knowledge.
        rawName: item.rawName,
        // Der Barcode muss mit, obwohl der Prüf-Flow ihn nirgends mehr
        // anzeigt: ohne ihn lernt `product_knowledge` den Scan nur unter
        // dem Namen, und der nächste Scan desselben Artikels fragt
        // `GET /api/items/known?barcode=…` -- also genau nach dem Feld,
        // das dann leer ist. Der Artikel bliebe für immer "neu", und das
        // Versprechen "Danach merkt sich die Liste die Einordnung für den
        // nächsten Einkauf" wäre keins. Auf dem alten Weg (/scan ->
        // /confirm -> POST /api/items) ging er mit; beim Batch-Import
        // fiel er heraus. `null` bei Belegzeilen, die keinen haben.
        barcode: item.barcode,
        note: item.note,
        category: item.category,
        placeId: item.placeId,
        quantity: item.quantity,
        expiryDate: fromDateInputValue(item.expiryDate).toISOString(),
      })),
    }),
  });
  const payload = (await res.json()) as {
    created?: number;
    merged?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(payload.error ?? "Der Import ist fehlgeschlagen.");

  const created = payload.created ?? 0;
  const merged = payload.merged ?? 0;

  return {
    wrote: true,
    summary:
      merged > 0
        ? `${created} angelegt · ${merged} zusammengefasst`
        : `${created} Artikel übernommen`,
    // Der letzte Eintrag und nicht der erste: der Rechnungsimport hängt seine
    // Zeilen an einen laufenden Batch an, statt ihn zu ersetzen
    // (receipt-import.tsx, handOver). Wer erst ein paar Artikel scannt und dann
    // einen Beleg einliest, kam über den Beleg herein -- `batch[0]` zeigte in
    // dem Fall auf den ersten Scan und schickte ihn zurück an die Kamera.
    method: batch[batch.length - 1]?.source === "receipt" ? "receipt" : "scan",
  };
}
