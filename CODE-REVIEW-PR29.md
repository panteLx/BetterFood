# Code review — PR #29 (branch `redesign/round-8`)

Deep pre-merge review focused on security, performance and standards compliance.

**Status:** all six findings addressed on `redesign/round-8`. `npx tsc --noEmit`, `npm run lint`
and `npm run build` all pass; the history-guard behaviour of finding 2 has not been exercised in a
real browser (no test framework in the repo).

## Build status

- `npx tsc --noEmit` — clean.
- `npm run lint` — 22k errors, all from generated bundles under `.claude/worktrees/*/public/worker-*.js`
  and `public/sw.js`. Untracked build artefacts, not source touched by this PR.
- `npm run build` — not run as part of the review.

---

## 1. HIGH — The scanned barcode is never persisted

**File:** `src/components/review-step.tsx:190`
**Also:** `src/app/api/items/import/route.ts:177`, `:198`

`commit()` posts `name, rawName, note, category, placeId, quantity, expiryDate` — but never
`entry.barcode`. `ImportInput` in the import route has no `barcode` field, the insert writes
`barcode: null` (line 177), and `rememberProduct(listId, { name, category, placeId }, tx)` (line 198)
is called without a barcode.

On `main` the scan path went `/scan` → `/confirm?barcode=…` → `POST /api/items`, which stored the
barcode both on the item and on the `product_knowledge` row.

**Failure scenario:** scan a yoghurt, pick "Milchprodukte", finish the import. Next week, scan the
same yoghurt. `resolveEntry` calls `GET /api/items/known?barcode=…`; `lookupKnownProduct` gets only a
barcode and no name, finds no row with that barcode and returns `found: false`. The tray shows "neu"
and the review step asks "Wozu gehört es?" again — contradicting the on-screen promise
"Danach merkt sich die Liste die Einordnung für den nächsten Einkauf."

Secondary effect: `items.barcode` stays permanently `null` for everything captured with the camera.

`/scan-ean` is unaffected — `ean-entry-page.tsx:30` still routes through `/confirm`.

**Fix:** thread `entry.barcode` through `commit()` → `ImportInput` → the item insert → `rememberProduct`.

---

## 2. HIGH — Browser back gesture silently destroys the whole batch

**File:** `src/components/review-batch-guard.tsx:49`

The guard clears the batch on *any* navigation out of `/review`. `/review` is listed in
`HIDDEN_PREFIXES` in `bottom-nav.tsx`, so there is no nav bar and back-swipe / back-button is the
natural way out. `applyAndAdvance` does a `router.push` per item, so a 34-line receipt puts 34
entries on the history stack.

**Failure scenario:** one back press too many at `/review/0` lands on `/scan` (or `/receipt`) and
takes the entire unfinished purchase with it, with no confirmation.

The in-app exit *is* guarded by a `ConfirmDialog` (`review-step.tsx:282`); the far more likely
gesture is not.

**Fix:** either confirm before clearing on a back navigation, or keep the batch in storage and clear
it only on an explicit discard / successful finish.

---

## 3. MEDIUM — Over 300 entries: lines dropped silently, flow can jump to the finish card

**File:** `src/components/receipt-import.tsx:161`, `:168`

`const batch = [...readBatch(), ...entries]` (line 161) is passed to `writeBatch`, which truncates to
`MAX_BATCH_ENTRIES = 300`. But `firstPendingIndex(batch)` on line 168 runs on the **un-truncated**
array.

**Failure scenario:** a partially-reviewed scan batch plus a long receipt exceeds 300. The first
pending entry sits at index >= 300, so `router.push('/review/312')` renders `FinishCard`
("Alles geprüft") for a batch that still has pending items — and the surplus receipt lines are gone
with no message.

**Fix:** compute the index from the truncated array that `writeBatch` actually stored, and tell the
user when lines were dropped.

---

## 4. LOW/MEDIUM — Silent-restart path bypasses `stopReader()`

**File:** `src/app/scan/page.tsx:466` (helper at `:206`)

`stopReader()` exists specifically because `IScannerControls.stop()` is async on torch-capable
devices, and `applyConstraints` on an already-stopped track rejects. The cleanup path uses it; the
restart branch calls `controlsRef.current?.stop()` bare.

**Effect:** with the torch on, each of the up-to-12 startup restarts produces an unhandled promise
rejection in the console.

**Fix:** use `stopReader(controlsRef.current)` here too.

---

## 5. LOW — Settings fetch has no `.catch`

**File:** `src/app/settings/goal/page.tsx:27`

`fetch("/api/settings").then(...).then(...).finally(...)` — the sibling
`src/app/settings/page.tsx:105` adds a `.catch()` on the identical chain.

**Effect:** offline or a 5xx produces an unhandled promise rejection. `loaded` still flips via
`finally`, so the UI degrades acceptably; only the rejection is unhandled.

**Fix:** add the same `.catch()` as the sibling page.

---

## 6. LOW — Mixed batch reports the wrong entry method on the success screen

**File:** `src/components/review-step.tsx:227`

`method=${batch[0]?.source === "receipt" ? "receipt" : "scan"}` keys off the first entry only.

**Failure scenario:** the user scans a few items and then adds a receipt — a supported flow, since
`receipt-import.tsx:161` explicitly appends rather than replaces (see its doc comment). `batch[0]` is
a scan entry, so `/saved` offers "Nächsten Artikel scannen" instead of "Noch eine Rechnung einlesen".

**Fix:** key off the last entry, or off whichever source dominates the batch.
