# MHD direkt beim Scannen eingeben

## Das Problem

Erfassen läuft heute in zwei Hälften: `/scan` sammelt Barcodes in den Batch
(`src/lib/review-batch.ts`), danach geht `/review/[index]` einen Artikel nach
dem anderen durch und fragt das MHD ab. Das ist für den Wocheneinkauf richtig
-- man scannt zwanzig Packungen leer und setzt sich danach hin.

Für den kleinen Einkauf ist es die falsche Reihenfolge. Wer drei Sachen
mitgebracht hat, hat die Packung in der Hand und liest das Datum sowieso gerade
ab; sie erst weglegen zu müssen, um sie im Prüf-Flow nochmal aufzurufen, ist
ein Umweg. Gewünscht ist: scannen, MHD eintragen, nächsten Artikel scannen.

## Was gebaut wird

**Kein zweiter Modus, sondern ein Schritt, der auch schon auf `/scan`
erreichbar ist.** Der Prüf-Schritt (`StepCard`) wird als Blatt über dem
laufenden Kamerabild geöffnet -- entweder automatisch nach jedem neuen Code
(Schalter „MHD gleich abfragen") oder durch Antippen einer Zeile in der Ablage.
Was dort entschieden wird, steht als `status: "done"` im Batch; der Prüf-Flow
fragt anschließend nur noch, was offen geblieben ist (`firstPendingIndex`).

Damit ist beides mischbar: den Joghurt jetzt datieren, weil man ihn in der Hand
hält, die Nudeln später im Prüf-Flow. Ein starrer Modus könnte das nicht.

Der Batch bleibt die einzige Wahrheit, es gibt keine neue Route und keinen
neuen Zustand neben ihm. Geschrieben wird weiterhin genau einmal, in einem
Import am Ende.

## Architektur

| Datei | Änderung |
| --- | --- |
| `src/lib/scan-prefs.ts` | *neu* -- der Schalter, `localStorage` über `useSyncExternalStore`, Muster wie `review-batch.ts` |
| `src/lib/batch-commit.ts` | *neu* -- `commitBatch()`, aus `ReviewFlow.commit()` herausgezogen |
| `src/components/scan-expiry-sheet.tsx` | *neu* -- `Sheet` über dem Kamerabild, rendert `StepCard` |
| `src/components/scan-screen.tsx` | aus `src/app/scan/page.tsx` verschoben, plus Blatt, Schalter, Ablage-Zeilen als Knöpfe, zweizuständiger Fußknopf |
| `src/app/scan/page.tsx` | jetzt Server-Seite: Session, Kategorien, Fächer |
| `src/components/review-step.tsx` | `StepCard` wird exportiert und bekommt `embedded`; `commit()` nutzt `commitBatch()` |

### Warum `/scan` eine Server-Seite wird

`StepCard` braucht `categories` und `places` (Richtwerte, Standardfächer,
Kategorie-Chips). Die liegen hinter `getCategoriesForList` /
`getPlacesForList`, sind gecacht und gehören auf den Server -- derselbe Weg,
den `/review/[index]` schon geht. Die Kamera-Seite zieht deshalb nach
`src/components/scan-screen.tsx`, wie `ean-entry-page.tsx` und
`add-item-page.tsx` es im Repo vormachen. Nebeneffekt: `/scan` prüft die
Session jetzt selbst, wie CLAUDE.md es für datentragende Seiten verlangt.

### Der Schalter

Steht auf `/scan` unter dem Hinweis-Kärtchen, nicht in `/settings` -- dort, wo
die Entscheidung fällt, und sichtbar bevor der erste Code gelesen ist.
Gespeichert in `localStorage` (`bf.scan.auto-expiry.v1`): synchron lesbar, also
kein Flackern beim ersten Scan, und es ist eine Gewohnheit dieses Geräts, keine
Einstellung des Haushalts. Präzedenz: `install-hint.tsx`, `reminder-hint.tsx`.

Der Text des Hinweis-Kärtchens folgt dem Schalter -- „Geprüft wird danach"
wäre im eingeschalteten Zustand schlicht falsch.

## Kamera

`IScannerControls` kennt nur `stop()`, und in `decodeFromConstraints` beendet
das auch die Tracks (`@zxing/browser`, `BrowserCodeReader.js:715`, `:1101`).
Jedes Anhalten ist also ein Kaltstart -- und Kaltstarts sind der Grund, warum
der Batch-Scan überhaupt existiert.

Pausiert wird deshalb im eigenen Callback: `blockCaptureRef` wird gleich nach
`if (!active) return;` geprüft. Die Schleife dreht mit
`delayBetweenScanAttempts: 500` weiter, kostet also zwei Dekodierungen pro
Sekunde, solange das Blatt offen ist. Das ist billiger als ein Kaltstart.

`video.pause()` bewusst nicht: `drawImageOnCanvas` dekodierte dann denselben
Frame in Endlosschleife, und das `video.play()` danach ist auf iOS ein Promise,
das ablehnen kann. Angenehme Nebenwirkung des Nicht-Anfassens: das Licht bleibt
an, weil der Torch-Zustand am Stream hängt.

### Sperrzeit nach dem Blatt

`REHIT_COOLDOWN_MS` (1500 ms) rechnet ab der letzten vollständigen Serie.
Während das Blatt offen ist, kehrt der Callback vor `lastHitRef` um, der
Zeitstempel bleibt also auf dem Moment vor dem Öffnen stehen. Wer nach zehn
Sekunden Datumseingabe die Packung noch in der Hand hält, liefert sofort wieder
lesbare Frames -- und der Cooldown ist längst abgelaufen. Ergebnis wäre Menge 2
ohne Zutun. Beim Schließen werden deshalb beide Refs frisch gestempelt:
`streakRef` auf null, `lastHitRef` auf den gerade behandelten Code mit
`Date.now()`.

### Wann das Blatt automatisch aufgeht

Nur wenn der Scan einen **neuen** Eintrag angelegt hat. `captureBarcode` weiß
das bereits (`existing`): ein zweiter gleicher Code erhöht die Menge, und dann
wäre ein zweites Datums-Blatt für denselben Artikel falsch. Über die Ablage
antippen geht weiter.

### Das Wettrennen mit `resolveEntry`

Name (Open Food Facts) und Einordnung (`/api/items/known`) kommen asynchron.
`StepCard` initialisiert seinen Entwurf aus `entry` **einmal** -- eine später
eintreffende Antwort würde verworfen, der Nutzer bliebe auf der rohen EAN
sitzen.

Deshalb: das Blatt geht sofort auf (sonst fehlt der Beleg, dass der Scan
gezählt hat) und zeigt bis zum Eintreffen der Antwort eine Ladezeile;
`StepCard` wird erst danach montiert, mit `key={entry.id}`. Schlägt die Abfrage
fehl, montiert es mit der EAN als Namen -- genau wie der Prüf-Flow es heute
auch täte.

### Der Ausweg

Blatt runterwischen oder schließen lässt den Eintrag `pending`: er bleibt in
der Ablage und wird am Ende im Prüf-Flow gefragt. Kein Datenverlust, keine
Rückfrage nötig -- der Abbruch-Dialog gehört weiterhin allein `/review`.

## Abschluss

`commitBatch(batch)` übernimmt aus `ReviewFlow.commit()` alles ohne React:
Projektion `BatchEntry -> ImportInput` (inklusive `barcode`, ohne den
`product_knowledge` blind bleibt), `fetch`, Fehlermeldung, Zusammenfassung und
den Weg zurück (`method`). Nicht darin: `setCommitting`, `clearBatch()`,
`router.refresh()`, `router.replace()` -- die beiden Aufrufer haben
unterschiedliche UI-Zustände, aber dieselbe Reihenfolge danach.

Der Fußknopf auf `/scan` zählt über `firstPendingIndex(batch)`:

| Bedingung | Label | Aktion |
| --- | --- | --- |
| `>= 0` | „{n} Artikel prüfen" (n = offene) | Link auf `/review/<index>` |
| `=== -1` | „{batch.length} Artikel übernehmen" | `commitBatch()` direkt hier |

Gezählt wird der ganze Batch, nicht nur die eigenen Scans: liegt eine
angefangene Rechnung darin, ist nichts „vollständig entschieden", auch wenn die
vier Scans datiert sind. Der Hinweis darüber („Aus einer Rechnung warten noch
n Artikel …") erklärt das bereits.

### Erfassen während des Imports

Ein Code, der gelesen wird, während der Import läuft, legt einen Eintrag an,
der nicht im abgeschickten Payload steht -- und das `clearBatch()` nach der
Antwort löscht ihn. Ein still verschluckter Artikel. Deshalb sperrt
`committing` das Erfassen genauso wie ein offenes Blatt, gesetzt bevor der
`fetch` fliegt. Weil damit nichts hinzukommen kann, bleibt `clearBatch()`
korrekt (und entsorgt weiterhin auch `skipped`-Zeilen, die absichtlich
nirgends landen).

### Der Guard bleibt unangetastet

`ReviewBatchGuard` reagiert ausschließlich auf das Verlassen von `/review`. Wer
von `/scan` aus übernimmt, war nie dort; der Batch wird vor der Navigation nach
`/saved` geleert. Kein Diff in `review-batch-guard.tsx`.

## Randfälle

- **Gemischt datiert:** `/review` steigt über `firstPendingIndex` beim offenen
  Artikel ein, die erledigten stehen in `DoneList` als „Fertig · antippen zum
  Ändern". Fällt geschenkt ab.
- **Fehlgeschlagener Import:** `toast.error`, Sperre zurück, Batch unberührt,
  derselbe Knopf für den zweiten Versuch -- wie heute in `/review`.
- **`method` für `/saved`:** die bestehende Regel (letzter Eintrag `receipt` ->
  Rechnung, sonst Kamera) stimmt unverändert.
- **`MAX_BATCH_ENTRIES` / `MAX_QUANTITY`:** unverändert, beide Grenzen liegen
  in `mergeEntry` / `createEntry`.
- **Blatt-im-Blatt:** `StepCard` hat für „Ändern" ein eigenes `Sheet`. Base UI
  stapelt Dialoge; der Fall tritt nur bei bekannten Produkten auf, bei neuen
  stehen die Kategorie-Chips ohnehin in der Karte.

## Verifikation

Es gibt kein Testframework im Repo -- das bleibt so, ein Framework einzuziehen
ist nicht Teil dieser Einheit. Geprüft wird deshalb:

1. `npx tsc --noEmit`, `npm run lint`, `npm run build` -- alle drei grün.
2. Durchlauf im Browser mit vorbelegtem Batch (`sessionStorage`): Ablage-Zeile
   antippen, datieren, Fußknopf wechselt auf „übernehmen", Import landet im
   Vorrat.
3. Der Weg über die echte Kamera bleibt Handarbeit auf dem Telefon: Kaltstart,
   Licht, Sperrzeit und Mengen-Plus sind im Emulator nicht ehrlich prüfbar.
