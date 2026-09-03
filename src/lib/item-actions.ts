/**
 * Die vier Schreibzugriffe auf einen Artikel, die von mehreren Screens aus
 * ausgelöst werden: aufbrauchen/entsorgen, nachkaufen, ausblenden und das
 * Rückgängigmachen des ersten.
 *
 * Als schlanke Funktionen über fetch und nicht als Hook: Vorratsliste und
 * Detailseite führen sehr unterschiedliche optimistische Zustände, teilen
 * sich aber exakt dieselben Endpunkte und dieselbe Undo-Mechanik. Vorher
 * stand diese Mechanik nur in der Vorratsliste -- und jeder weitere Screen
 * hätte sie nachgebaut.
 */

export type ResolveStatus = "used" | "thrown_away";

/** Alles, was zum Zurücknehmen eines Abhakens nötig ist (siehe /resolve). */
export type UndoInfo = { itemId: number; archiveId: number | null };

async function expectOk(response: Response) {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Anfrage fehlgeschlagen");
  }
  return response;
}

export async function resolveItem(itemId: number, status: ResolveStatus): Promise<UndoInfo> {
  const res = await expectOk(
    await fetch(`/api/items/${itemId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  );
  const { undo } = (await res.json()) as { undo: UndoInfo };
  return undo;
}

/**
 * Nimmt ein Abhaken zurück.
 *
 * Bei quantity === 1 wurde die Zeile selbst umgestellt und muss nur zurück
 * auf "active". Bei mehreren Einheiten hat der Server eine eigene Archivzeile
 * angelegt: die muss weg, und die Menge am aktiven Artikel wieder hoch.
 */
export async function undoResolve(undo: UndoInfo, quantityBefore: number) {
  if (undo.archiveId === null) {
    await expectOk(
      await fetch(`/api/items/${undo.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
    );
    return;
  }

  await expectOk(await fetch(`/api/items/${undo.archiveId}`, { method: "DELETE" }));
  await setQuantity(undo.itemId, quantityBefore);
}

export async function setQuantity(itemId: number, quantity: number) {
  await expectOk(
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    }),
  );
}

/**
 * Trägt eine nachgekaufte Packung ein.
 *
 * Bewusst über POST /api/items und nicht als "quantity + 1": eine frisch
 * gekaufte Packung hat ein eigenes MHD, und eine hochgezählte Menge hätte
 * das der alten geerbt -- die neue Milch wäre damit ab dem Tag als
 * abgelaufen gemeldet worden, an dem die alte es war. Die Route entscheidet
 * über findMergeTarget selbst, was daraus wird: bei gleichem MHD-Tag geht
 * die Packung in der vorhandenen Zeile auf (dann ist die hochgezählte Menge
 * richtig), sonst entsteht eine zweite Zeile mit eigenem Datum.
 *
 * Ort und Notiz wandern mit: sie beschreiben, wo das Produkt in diesem
 * Haushalt liegt, und das ändert sich mit dem Nachkauf nicht.
 *
 * Die Liste wandert ebenfalls mit, und als einzige der Aktionen hier
 * ausdrücklich: es gibt keine Artikel-ID, aus der die Route sie ableiten
 * könnte, und hinter einem Deep-Link aus einer Benachrichtigung ist die
 * aktive Liste nicht zwangsläufig die des Artikels. Die Packung landete
 * sonst im falschen Haushalt.
 */
export async function restockItem(
  item: {
    id: number;
    name: string;
    category: string;
    barcode: string | null;
    placeId: number | null;
    note: string | null;
    listId: number | null;
  },
  expiryDate: Date,
): Promise<{ id: number; merged: boolean }> {
  const res = await expectOk(
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        category: item.category,
        barcode: item.barcode ?? undefined,
        placeId: item.placeId,
        note: item.note,
        quantity: 1,
        expiryDate: expiryDate.toISOString(),
        listId: item.listId ?? undefined,
      }),
    }),
  );
  const row = (await res.json()) as { id: number; merged?: boolean };
  return { id: row.id, merged: row.merged === true };
}

/** Blendet den Artikel aus -- die Zeile bleibt in der Datenbank (siehe DELETE-Route). */
export async function hideItem(itemId: number) {
  await expectOk(await fetch(`/api/items/${itemId}`, { method: "DELETE" }));
}

export async function restoreItem(itemId: number) {
  await expectOk(
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    }),
  );
}

export function resolveVerb(status: ResolveStatus) {
  return status === "used" ? "aufgebraucht" : "entsorgt";
}
