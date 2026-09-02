"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  Home,
  Minus,
  Plus,
  ScanBarcode,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ExpiryPicker } from "@/components/expiry-picker";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import {
  DEFAULT_SHELF_LIFE_DAYS,
  formatShort,
  fromDateInputValue,
  jumpTarget,
  startOfDay,
} from "@/lib/expiry";
import {
  MAX_QUANTITY,
  clearBatch,
  firstPendingIndex,
  updateBatch,
  useBatch,
  type BatchEntry,
} from "@/lib/review-batch";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import type { Category, Place } from "@/db/schema";

/**
 * Der Prüf-Flow "Kurz prüfen".
 *
 * Bis Runde 8 hieß Erfassen: scannen, Formular, speichern, wieder scannen.
 * Nach dem Wocheneinkauf war das ein Dutzend Formulare. Jetzt sammelt
 * `/scan` (oder ab Einheit 9 der Rechnungsimport) erst alles im Batch, und
 * hier wird einmal durchgegangen -- ein Artikel je Schritt, und die einzige
 * Frage je Schritt ist das MHD.
 *
 * Der Kalender steht deshalb fest in der Karte und nicht in einem Blatt: ein
 * Blatt, das man für jeden von zwanzig Artikeln öffnet und wieder schließt,
 * wäre zwanzigmal eine Bewegung zu viel. Genau dafür wurde `DateCalendar` in
 * Welle 1 aus `DateSheet` herausgelöst.
 */
export function ReviewStep({
  index,
  categories,
  places,
}: {
  index: number;
  categories: Category[];
  places: Place[];
}) {
  // Der Batch lebt im sessionStorage und ist auf dem Server leer; der Rest
  // dieses Screens rechnet mit dem heutigen Tag. Beides zusammen heißt: vor
  // der Hydration gibt es hier nichts Ehrliches zu zeigen. Der Skelettrahmen
  // ist deshalb kein Ladezustand, sondern der einzige Zustand, den der
  // Server überhaupt kennen kann -- und hinter dieser Grenze darf `new Date()`
  // stehen, ohne den Prerender der Route abzubrechen.
  const isClient = useIsClient();
  const batch = useBatch();

  if (!isClient) return <ReviewSkeleton />;

  return (
    <ReviewFlow index={index} batch={batch} categories={categories} places={places} />
  );
}

/**
 * Der Platzhalter dieses Bildschirms -- vor der Hydration hier, und als
 * Suspense-Fallback der Route (`/review/[index]`). Beide zeigen dieselbe
 * Karte; zwei Kopien wären zwei Stellen, die auseinanderlaufen.
 */
export function ReviewSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-2">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-1 animate-pulse rounded-full bg-muted" />
      <div className="h-[520px] animate-pulse rounded-[24px] bg-muted" />
    </div>
  );
}

function ReviewFlow({
  index,
  batch,
  categories,
  places,
}: {
  index: number;
  batch: BatchEntry[];
  categories: Category[];
  places: Place[];
}) {
  const router = useRouter();
  // Nur hier, nicht in ReviewStep: dieser Baum wird ausschließlich im Browser
  // gerendert (siehe oben), und damit ist der Stichtag ein stabiler Wert.
  const today = useMemo(() => startOfDay(new Date()), []);
  const [committing, setCommitting] = useState(false);

  const doneCount = batch.filter((entry) => entry.status === "done").length;
  // Der Zähler in der Kopfzeile zählt entschiedene Artikel, nicht nur
  // übernommene. Die Segmentleiste färbt ein übersprungenes Segment ein, der
  // Zähler zählte es aber nicht mit -- "Artikel 2 von 2 · 0 fertig" bei einem
  // halb gefüllten Balken war der Widerspruch, den der Test der Runde 8
  // gefunden hat. Beide sprechen jetzt von derselben Menge.
  const decidedCount = batch.filter((entry) => entry.status !== "pending").length;
  const entry = batch[index] ?? null;

  /**
   * Schreibt die Entscheidung dieses Schritts und geht weiter.
   *
   * `updateBatch` und nicht `writeBatch(batch.map(...))`, obwohl der Batch
   * hier als Prop danebensteht: `/scan` bleibt unter cacheComponents per
   * <Activity> am Leben und trägt Produktnamen nach, sobald seine Abfragen
   * antworten. Der Stand aus dem letzten Render wäre dann bereits überholt,
   * und das Zurückschreiben machte die Antwort wieder zunichte.
   *
   * Das Ergebnis wird aus dem Updater herausgereicht, weil die Frage "welcher
   * Artikel kommt als Nächstes?" den Stand NACH dieser Änderung braucht --
   * sonst wäre der gerade abgehakte Artikel noch "pending" und der Flow liefe
   * im Kreis.
   */
  function applyAndAdvance(patch: Partial<BatchEntry>) {
    let updated: BatchEntry[] = batch;
    updateBatch((previous) => {
      updated = previous.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      );
      return updated;
    });

    // Erst nach vorn suchen, dann von vorn: wer einen fertigen Artikel noch
    // einmal geöffnet hat, soll danach nicht am Ende landen, sondern bei dem
    // ersten, der noch offen ist.
    const ahead = updated.findIndex(
      (item, position) => position > index && item.status === "pending",
    );
    const next = ahead >= 0 ? ahead : firstPendingIndex(updated);
    // replace und nicht push: der ganze Prüf-Flow belegt genau einen
    // History-Eintrag. Ein Beleg mit 34 Zeilen legte sonst 34 an, und die
    // Zurück-Geste hangelte sich durch sie hindurch, bis eine davon aus dem
    // Flow hinausführte -- mit dem ganzen ungeprüften Einkauf. Jetzt heißt
    // Zurück eindeutig "abbrechen" und der ReviewBatchGuard kann danach
    // fragen; artikelweise zurück geht über "Voriger Artikel".
    router.replace(`/review/${next >= 0 ? next : updated.length}`);
  }

  /**
   * Der Abschluss: ein einziger Import für den ganzen Einkauf.
   *
   * `POST /api/items/import` schreibt in einer Transaktion, fasst über
   * `findMergeTarget` zusammen und lernt über `rememberProduct` -- genau
   * deshalb entsteht der Eintrag in `product_knowledge` auch erst hier und
   * nicht schon bei der Kategoriewahl: sonst lernte die App auch aus
   * Durchläufen, die der Nutzer abgebrochen hat.
   */
  async function commit() {
    // Typprädikat statt eines "!" weiter unten: der Filter beweist, dass
    // expiryDate dasteht, und TypeScript kann das aus einem gewöhnlichen
    // Vergleich nicht ableiten.
    const ready = batch.filter(
      (item): item is BatchEntry & { expiryDate: string } =>
        item.status === "done" && item.expiryDate !== null,
    );
    if (ready.length === 0) {
      // Alles übersprungen: es gibt nichts zu schreiben, aber der Batch muss
      // trotzdem weg -- sonst begrüßt derselbe Einkauf den Nutzer beim
      // nächsten Scan erneut.
      setCommitting(true);
      clearBatch();
      router.replace("/");
      return;
    }

    setCommitting(true);
    try {
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
      const summary =
        merged > 0
          ? `${created} angelegt · ${merged} zusammengefasst`
          : `${created} Artikel übernommen`;

      clearBatch();
      // Die Vorratsseiten sind serverseitig gerendert und müssen den Zuwachs
      // sehen, sobald der Nutzer hinüberwechselt.
      router.refresh();
      // replace statt push: der Prüf-Flow ist abgearbeitet, ein Schritt
      // zurück führte nur auf einen leeren Batch.
      // Der Weg zurück ist der, auf dem der Einkauf hereinkam: nach einem
      // Beleg der nächste Beleg, nach einem Scan die Kamera.
      // Der letzte Eintrag und nicht der erste: der Rechnungsimport haengt
      // seine Zeilen an einen laufenden Batch an, statt ihn zu ersetzen
      // (receipt-import.tsx, handOver). Wer erst ein paar Artikel scannt und
      // dann einen Beleg einliest, kam ueber den Beleg herein -- `batch[0]`
      // zeigte in dem Fall auf den ersten Scan und schickte ihn zurueck an
      // die Kamera.
      const arrivedVia = batch[batch.length - 1]?.source === "receipt" ? "receipt" : "scan";
      router.replace(
        `/saved?name=${encodeURIComponent(summary)}&method=${arrivedVia}`,
      );
    } catch (caught) {
      setCommitting(false);
      toast.error(
        caught instanceof Error ? caught.message : "Der Import ist fehlgeschlagen.",
      );
    }
  }

  if (batch.length === 0 && !committing) {
    return (
      <div className="flex flex-1 flex-col justify-center px-5">
        <EmptyState
          icon={ScanBarcode}
          title="Nichts zu prüfen"
          body="Scanne erst ein paar Artikel — geprüft wird danach, alles auf einmal."
          action={
            <Link
              href="/scan"
              className="flex h-11 items-center justify-center rounded-[14px] bg-primary px-5 text-[14px] font-bold text-primary-foreground"
            >
              Zum Scanner
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3.5 px-5 pt-2 pb-8">
      <div className="flex flex-col gap-2.5">
        {/* Der Prüf-Flow blendet die Navigationsleiste aus (bottom-nav.tsx,
            HIDDEN_PREFIXES) -- ohne diesen Knopf war die Startseite von hier
            aus nur über den Zurück-Schritt des Browsers erreichbar. Er führt
            fest auf "/" und nicht über router.back(): die Zurück-Geste bricht
            den Durchlauf ab (ReviewBatchGuard fragt vorher nach), und ein
            Artikel früher steht auf dem Chip rechts daneben.

            Der Batch bleibt liegen. Wer den Einkauf halb geprüft verlässt,
            findet ihn beim nächsten Besuch von /review wieder -- verloren
            geht er erst mit dem Tab. */}
        <div className="flex items-center gap-2.5">
          {/* Mit Rückfrage, weil der Weg hier hinaus etwas wegwirft: der Batch
              liegt bis zum Abschluss nur im sessionStorage, und der
              ReviewBatchGuard verwirft ihn beim Verlassen von /review. Ohne
              die Frage kostete ein Fehlgriff neben dem Kalender den ganzen
              Einkauf -- und der Knopf sitzt oben links, also genau dort, wo
              der Daumen sonst "zurück" erwartet. Dieselbe Frage stellt der
              Guard für die Zurück-Geste selbst; hier steht sie, weil dieser
              Knopf sie direkt auslöst und nicht über die History läuft.

              Auch die bereits abgehakten Artikel sind dann weg: geschrieben
              wird erst am Ende, in einem einzigen Import. Deshalb nennt der
              Text die Gesamtzahl und nicht die der offenen. */}
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-touch"
                aria-label="Zur Startseite"
                className="-ml-2 rounded-2xl"
              >
                <Home className="size-5" />
              </Button>
            }
            icon={TriangleAlert}
            title="Prüfen abbrechen?"
            description={
              <>
                Nichts davon ist gespeichert
                {batch.length === 1
                  ? " — der Artikel dieses Durchlaufs wird verworfen"
                  : ` — die ${batch.length} Artikel dieses Durchlaufs werden verworfen`}
                . Eine Rechnung müsstest du danach neu einlesen.
              </>
            }
            confirmLabel="Verwerfen"
            onConfirm={() => router.push("/")}
          />

          <h1 className="min-w-0 flex-1 text-[20px] leading-tight font-extrabold">
            Kurz prüfen
          </h1>

          {index > 0 && (
            <button
              type="button"
              onClick={() => router.replace(`/review/${index - 1}`)}
              className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-[10px] border border-border bg-card pr-3 pl-2 text-[12px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronLeft className="size-3.5" strokeWidth={2.4} />
              Voriger Artikel
            </button>
          )}
        </div>

        {/* Der Zaehler steht nur, solange noch etwas offen ist. Am Ende las
            sich dieselbe Zeile als "Alle 34 geprüft · 34 geprüft" -- die
            Bilanz danach sagt ohnehin genauer, was uebernommen und was
            uebersprungen wurde. */}
        <p className="text-[12.5px] font-bold text-muted-foreground">
          {entry ? (
            <>
              {`Artikel ${index + 1} von ${batch.length}`}
              {" · "}
              <span className="text-primary">{decidedCount} geprüft</span>
            </>
          ) : (
            `Alle ${batch.length} geprüft`
          )}
        </p>

        {/* Ein Segment je Artikel statt einer durchgehenden Leiste: der
            Fortschritt ist hier abzählbar, und die Lücken sagen, wie viele
            Griffe noch bevorstehen. Die Farbe unterscheidet außerdem
            "übernommen" von "übersprungen" -- eine gefüllte Leiste könnte das
            nicht.

            Die Farben der ersten Fassung waren im Hellmodus keine: --track
            ist #eef2ec auf einem Grund von #f2f4f0 (Kontrast 1.02) und
            --primary-tint #e6f0e8 (1.04). Beim ersten Artikel ist noch nichts
            entschieden, also bestand die Leiste ausschließlich aus diesen
            beiden Tönen -- sie war schlicht unsichtbar, und der Test der
            Runde 8 hat sie folgerichtig nicht als Fortschritt erkannt. Im
            Dunkeln fiel es nicht auf, weil --track dort #313632 auf #191b1a
            ist. Deshalb jetzt durchgehend Töne mit Deckkraft statt der
            vorgemischten Flächenfarben: die offene Spur trägt den
            Text-Grauton, der laufende Artikel den Primärton, und beide
            behalten ihren Abstand zum Grund in beiden Themes.

            6px statt 4px und 2px Lücke statt 4px, weil die Farbe Fläche
            braucht: bei 34 Positionen blieben von der Breite sonst zwei
            Drittel Lücke. */}
        <div className="flex h-1.5 gap-0.5" aria-hidden="true">
          {batch.map((item, position) => (
            <span
              key={item.id}
              className={cn(
                "min-w-0 flex-1 rounded-full",
                item.status === "done"
                  ? "bg-primary"
                  : item.status === "skipped"
                    ? "bg-faint"
                    : position === index
                      ? "bg-primary/50"
                      : "bg-faint/25",
              )}
            />
          ))}
        </div>
      </div>

      {entry ? (
        <StepCard
          // Der Schlüssel setzt den Entwurf des Schritts zurück: gewählte
          // Kategorie, Cursor und das Ob-bestätigt gehören zu genau diesem
          // Artikel und dürfen den nächsten nicht vorbelegen.
          key={entry.id}
          entry={entry}
          categories={categories}
          places={places}
          today={today}
          onCommit={(patch) => applyAndAdvance({ ...patch, status: "done" })}
          onSkip={(patch) =>
            applyAndAdvance({ ...patch, status: "skipped", expiryDate: null })
          }
        />
      ) : (
        <FinishCard
          doneCount={doneCount}
          skippedCount={batch.filter((item) => item.status === "skipped").length}
          busy={committing}
          onCommit={commit}
        />
      )}

      <DoneList batch={batch} categories={categories} />
      <SkippedList batch={batch} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Der Schritt selbst
 * ------------------------------------------------------------------ */

type StepPatch = {
  category: string | null;
  placeId: number | null;
  /** Nur gesetzt, wenn der Nutzer den Namen in diesem Schritt geändert hat. */
  name?: string;
  /** Die Schreibweise, unter der die Zeile hereinkam -- siehe `renameTo`. */
  rawName?: string | null;
  quantity?: number;
  expiryDate?: string | null;
};

function StepCard({
  entry,
  categories,
  places,
  today,
  onCommit,
  onSkip,
}: {
  entry: BatchEntry;
  categories: Category[];
  places: Place[];
  today: Date;
  onCommit: (patch: StepPatch) => void;
  onSkip: (patch: StepPatch) => void;
}) {
  const [category, setCategory] = useState<string | null>(entry.category);
  // Ein bekanntes Produkt bringt seine Kategorie mit, aber nicht zwingend einen
  // Ort: `product_knowledge` lernt den Ort erst, wenn er beim Anlegen dastand,
  // und ein aufgelöstes Fach fällt in /api/items/known einzeln weg. Ohne diesen
  // Rückfall landete so ein Artikel ortlos im Vorrat, obwohl seine Kategorie
  // ein Standardfach kennt -- der Rückfall lief bisher nur, wenn der Nutzer die
  // Kategorie selbst antippte, also gerade bei bekannten Produkten nie.
  const [placeId, setPlaceId] = useState<number | null>(
    entry.placeId ??
      categories.find((row) => row.key === entry.category)?.defaultPlaceId ??
      null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState(entry.name);
  const [quantity, setQuantity] = useState(entry.quantity);
  // Der Umbenennen-Entwurf steht neben `name` und nicht darin: "Abbrechen"
  // muss zum vorigen Namen zurückkommen, und ein leer getipptes Feld darf
  // den Artikel nicht namenlos machen. null heißt "wird gerade nicht
  // umbenannt" -- ein zweites Flag daneben wäre derselbe Zustand doppelt
  // geführt.
  const [draftName, setDraftName] = useState<string | null>(null);

  const categoryRow = categories.find((row) => row.key === category) ?? null;
  const shelfLife = categoryRow?.shelfLifeDays ?? DEFAULT_SHELF_LIFE_DAYS;

  /**
   * Ab wann die Haltbarkeit zählt.
   *
   * Beim Scannen ist das heute. Eine Rechnung von vorgestern rechnet ab dem
   * Rechnungsdatum -- sonst wären alle MHDs zwei Tage zu lang, genau der
   * Fehler, den `receipt-import.tsx` mit seinem `referenceDate` schon einmal
   * behoben hat.
   */
  const reference = entry.purchasedAt ? fromDateInputValue(entry.purchasedAt) : today;

  const suggestion = jumpTarget(shelfLife, reference, today);

  const [date, setDate] = useState(entry.expiryDate ?? suggestion);
  // Ein wiedergeöffneter fertiger Artikel trägt eine Entscheidung, ein
  // frischer nur einen Richtwert. Der Unterschied ist es, der den Tag im
  // Kalender füllt statt ihn nur zu ringeln.
  const [confirmed, setConfirmed] = useState(entry.expiryDate !== null);

  // Wechselt die Kategorie, wechselt der Richtwert -- aber nur, solange der
  // Nutzer noch keinen Tag angetippt hat. Ableitung während des Renders statt
  // in einem Effekt: react-hooks/set-state-in-effect ist scharf gestellt, und
  // derselbe Weg steht in date-calendar.tsx und archive-view.tsx.
  const [previousSuggestion, setPreviousSuggestion] = useState(suggestion);
  if (suggestion !== previousSuggestion) {
    setPreviousSuggestion(suggestion);
    if (!confirmed) setDate(suggestion);
  }

  const place = places.find((row) => row.id === placeId) ?? null;

  /**
   * Der Name, wie er hereinkam -- und damit der Alias, den
   * `POST /api/items/import` in `product_knowledge` schreibt.
   *
   * Beim Beleg steht er schon da (`rawName` ist dort die Schreibweise vom
   * Papier). Beim Scan ist er leer, und der Anzeigename kommt von Open Food
   * Facts: wer "ja! Vollmilch 3,5% 1l" zu "Vollmilch" begradigt, soll beim
   * nächsten Scan desselben Barcodes seine eigene Schreibweise wiedersehen,
   * und dafür muss die alte als Alias mitgehen. `??` und nicht `||`: eine
   * zweite Umbenennung im selben Schritt darf die erste nicht überschreiben.
   */
  const originalName = entry.rawName ?? entry.name;
  const renamed = name.trim() !== entry.name;

  const patch: StepPatch = {
    category,
    placeId,
    quantity,
    ...(renamed ? { name: name.trim(), rawName: originalName } : {}),
  };

  /** Übernimmt den Entwurf aus dem Eingabefeld; ein leerer bleibt wirkungslos. */
  function commitRename() {
    const trimmed = draftName?.trim();
    if (trimmed) setName(trimmed);
    setDraftName(null);
  }

  function chooseCategory(next: Category) {
    setCategory(next.key);
    // Die Kategorie beantwortet die Ortsfrage gleich mit -- dieselbe Regel wie
    // im Formular (item-form.tsx, applyCategory). Ein bereits gelernter Ort
    // bleibt stehen: was der Haushalt über dieses Produkt weiß, schlägt den
    // Standard der Kategorie.
    setPlaceId((current) => current ?? next.defaultPlaceId ?? null);
  }

  return (
    <>
      <div className="rounded-[24px] border border-border bg-card p-[18px] shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-tint text-primary">
            <CategoryIcon categoryKey={category ?? "sonstiges"} className="size-6" />
          </span>

          {draftName !== null ? (
            <>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setDraftName(null);
                }}
                autoFocus
                aria-label="Name des Artikels"
                className="h-10 min-w-0 flex-1 rounded-[12px] border border-primary bg-surface-2 px-2.5 text-[15px] font-bold outline-none"
              />
              <button
                type="button"
                aria-label="Namen übernehmen"
                onClick={commitRename}
                className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Check className="size-4" strokeWidth={2.6} />
              </button>
              <button
                type="button"
                aria-label="Umbenennen abbrechen"
                onClick={() => setDraftName(null)}
                className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-border bg-surface-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-4" strokeWidth={2.4} />
              </button>
            </>
          ) : (
            <>
              {/* Der Name ist selbst der Knopf, wie im Rechnungsimport, aus
                  dem dieser Schritt ihn geerbt hat: ein Stift daneben wäre
                  ein zweites Ziel für dieselbe Absicht. Er ist der
                  Schlüssel, unter dem die Liste das Produkt wiedererkennt --
                  "KAROTTE SNACK RL" jetzt zu begradigen ist billiger, als es
                  bei jedem künftigen Einkauf erneut vorgeschlagen zu
                  bekommen.

                  Zwei Zeilen und kein Abschnitt: seit der Stepper rechts
                  steht, blieben von "REWE Beste Wahl Pesto Alla Genovese mit
                  Basilikum und Käse 190g" noch neunzehn Zeichen übrig -- und
                  auf dem Kategorie-Schritt ist der Name das Einzige, woran
                  der Artikel zu erkennen ist. */}
              <button
                type="button"
                onClick={() => setDraftName(name)}
                aria-label={`${name || entry.barcode || "Artikel"} umbenennen`}
                className="line-clamp-2 min-w-0 flex-1 rounded-[10px] text-left text-[17px] leading-tight font-extrabold tracking-[-0.01em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {name || entry.barcode || "Unbenannt"}
              </button>

              {/* Der Stepper und nicht nur ein "×3": eine falsch erkannte
                  Belegmenge war bis hierher nicht mehr zu korrigieren, und im
                  Vorrat steht sie danach als drei Flaschen, die es nie gab. */}
              <div className="flex h-9 shrink-0 items-center gap-0.5 rounded-[12px] border border-border bg-surface-2 px-1">
                <button
                  type="button"
                  aria-label="Menge verringern"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  className="flex size-7 items-center justify-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
                >
                  <Minus className="size-3.5" strokeWidth={2.6} />
                </button>
                <span
                  aria-label={`Menge ${quantity}`}
                  className="min-w-6 text-center font-mono text-[13px] font-bold"
                >
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Menge erhöhen"
                  disabled={quantity >= MAX_QUANTITY}
                  onClick={() =>
                    setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))
                  }
                  className="flex size-7 items-center justify-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
                >
                  <Plus className="size-3.5" strokeWidth={2.6} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Die Einordnung steht in einer eigenen Zeile unter dem Namen, seit
            der Stepper den Platz rechts daneben belegt. Was der Beleg
            zusätzlich hergab -- Gewicht als Notiz, und die gemeldete Menge,
            sobald sie von der eingestellten abweicht -- hängt hier mit dran:
            es beantwortet "warum steht da 4 und nicht 6?" an der Stelle, an
            der die Frage aufkommt. */}
        <div className="mt-2 flex items-center gap-2">
          {/* Umbrechend statt abschneidend: mit Kategorie, Fach, Gewicht und
              Belegmenge stehen hier bis zu vier Angaben, und die letzte --
              „laut Beleg 1×“ -- ist die einzige, die eine Abweichung
              erklaert. Sie war die erste, die wegfiel. */}
          <p className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-semibold text-faint">
            {[
              categoryRow
                ? [categoryRow.label, place?.name].filter(Boolean).join(" · ")
                : "Noch nicht einsortiert",
              entry.note,
              entry.sourceQuantity !== null && entry.sourceQuantity !== quantity
                ? `laut Beleg ${entry.sourceQuantity}×`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {categoryRow && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="shrink-0 text-[12.5px] font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Ändern
            </button>
          )}
        </div>

        {/* Der Steuersatz-Verdacht gehört in den Schritt, nicht vor ihn: die
            Zeile lief bis eben bereits übersprungen in den Batch und stand
            erst am Ende unter "Übersprungen". Bei 34 Positionen liest dort
            niemand mehr gegen, und der Testlauf verlor auf genau diesem Weg
            einen Energydrink -- 19 % Mehrwertsteuer, trotzdem ein
            Lebensmittel. Jetzt wird die Zeile abgefragt wie jede andere und
            trägt nur ihren Hinweis mit. */}
        {entry.foodDoubt && (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-[12px] bg-warning-tint px-2.5 py-2 text-[12px] leading-snug font-semibold text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={2.4} />
            <span>
              19 % Mehrwertsteuer — laut Beleg vermutlich kein Lebensmittel.
              Getränke tragen den Satz allerdings auch.
            </span>
          </p>
        )}

        {categoryRow ? (
          <>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-semibold tracking-[0.05em] uppercase">
                MHD eingeben
              </span>
              <span className="text-[11.5px] font-semibold text-faint">
                Richtwert: {shelfLife} {shelfLife === 1 ? "Tag" : "Tage"}
              </span>
            </div>

            <ExpiryPicker
              value={date}
              onChange={(next) => {
                setDate(next);
                setConfirmed(true);
              }}
              confirmed={confirmed}
              today={today}
              reference={reference}
              shelfLife={shelfLife}
              fromPurchase={Boolean(entry.purchasedAt)}
            />

            <button
              type="button"
              onClick={() => onCommit({ ...patch, expiryDate: date })}
              className="mt-3.5 h-[50px] w-full rounded-[14px] bg-primary text-[15px] font-bold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Übernehmen &amp; weiter
            </button>
            <button
              type="button"
              onClick={() => onSkip(patch)}
              className="h-10 w-full text-[13px] font-bold text-danger outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Nicht übernehmen
            </button>
          </>
        ) : (
          /* Der vorgeschaltete Schritt für ein Produkt, das diese Liste noch
             nicht kennt. Ohne Kategorie gibt es keinen Richtwert und keinen
             Monat, in dem der Kalender sinnvoll aufginge -- die Einordnung
             ist deshalb die erste Frage, nicht eine nebenbei. */
          <>
            <p className="mt-4 text-[15px] font-bold">Wozu gehört es?</p>
            <p className="mt-1 text-[12.5px] font-semibold text-faint">
              Danach merkt sich die Liste die Einordnung für den nächsten Einkauf.
            </p>
            {/* Alle Kategorien, nicht die ersten sechs mit einem Verweis auf
                das Blatt dahinter. Die Abkürzung sollte die Frage klein
                halten, kostete aber genau bei den Artikeln zwei Griffe mehr,
                die nicht in die üblichen Fächer fallen -- und das sind
                dieselben, bei denen der Nutzer ohnehin überlegt. Die Liste
                ist zweistellig, nicht hundert Einträge lang: sie passt in
                drei bis vier Zeilen, und dann ist Blättern teurer als
                Hinsehen. Das Blatt bleibt für den Ort und für spätere
                Korrekturen ("Ändern"). */}
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((option) => (
                <Chip
                  key={option.key}
                  onClick={() => chooseCategory(option)}
                  className="text-[12.5px]"
                >
                  {option.label}
                </Chip>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onSkip(patch)}
              className="mt-3 h-10 w-full text-[13px] font-bold text-danger outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Nicht übernehmen
            </button>
          </>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Einordnung">
        <p className="px-1.5 pb-2 text-[12.5px] font-semibold text-faint">Kategorie</p>
        <div className="flex flex-wrap gap-2 px-1.5">
          {categories.map((option) => (
            <Chip
              key={option.key}
              active={option.key === category}
              onClick={() => chooseCategory(option)}
              className="text-[12.5px]"
            >
              {option.label}
            </Chip>
          ))}
        </div>

        {places.length > 0 && (
          <>
            <p className="px-1.5 pt-4 pb-2 text-[12.5px] font-semibold text-faint">
              Wo liegt es?
            </p>
            <div className="flex flex-wrap gap-2 px-1.5">
              {places.map((option) => (
                <Chip
                  key={option.id}
                  active={option.id === placeId}
                  onClick={() => setPlaceId(option.id)}
                  className="h-10 flex-1 px-2.5 text-xs"
                >
                  {option.name}
                </Chip>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          disabled={category === null}
          onClick={() => setSheetOpen(false)}
          className="mt-5 h-13.5 w-full rounded-lg bg-primary text-base font-bold text-primary-foreground disabled:opacity-40"
        >
          Übernehmen
        </button>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Abschluss und Listen
 * ------------------------------------------------------------------ */

function FinishCard({
  doneCount,
  skippedCount,
  busy,
  onCommit,
}: {
  doneCount: number;
  skippedCount: number;
  busy: boolean;
  onCommit: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-border bg-card p-[18px] text-center shadow-card">
      <span className="mx-auto flex size-14 items-center justify-center rounded-[20px] bg-primary-tint text-primary">
        <Check className="size-7" strokeWidth={2.2} />
      </span>
      <p className="mt-3 text-[17px] leading-tight font-extrabold">Alles geprüft</p>
      <p className="mt-1.5 text-[12.5px] font-semibold text-faint">
        {doneCount === 0
          ? "Kein Artikel zum Übernehmen."
          : `${doneCount} ${doneCount === 1 ? "Artikel wandert" : "Artikel wandern"} in den Vorrat`}
        {skippedCount > 0 && ` · ${skippedCount} übersprungen`}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onCommit}
        className="mt-4 h-[50px] w-full rounded-[14px] bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy
          ? "Wird gespeichert…"
          : doneCount === 0
            ? "Ohne Artikel beenden"
            : `${doneCount} Artikel übernehmen`}
      </button>
    </div>
  );
}

function DoneList({ batch, categories }: { batch: BatchEntry[]; categories: Category[] }) {
  const router = useRouter();
  const rows = batch
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.status === "done");
  // Einmal aufgebaut statt find() je Zeile: bei einem Beleg mit 34 Positionen
  // und zwölf Kategorien waren das gut vierhundert Vergleiche je Render.
  const categoryLabels = new Map(categories.map((row) => [row.key, row.label]));

  if (rows.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      <SectionLabel title="Fertig" count={rows.length} hint="antippen zum Ändern" />
      {rows.map(({ entry, index }) => {
        const label =
          (entry.category === null ? null : categoryLabels.get(entry.category)) ??
          entry.category;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => router.push(`/review/${index}`)}
            className="flex items-center gap-2.5 rounded-[16px] border border-border bg-card py-2.5 pr-3.5 pl-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-primary-tint text-primary">
              <CategoryIcon categoryKey={entry.category ?? "sonstiges"} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-tight font-bold">
                {entry.name}
                {entry.quantity > 1 && (
                  <span className="ml-1.5 text-muted-foreground">×{entry.quantity}</span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] leading-tight font-semibold text-faint">
                {label}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[12px] font-semibold text-faint">
              {entry.expiryDate ? formatShort(fromDateInputValue(entry.expiryDate)) : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SkippedList({ batch }: { batch: BatchEntry[] }) {
  const router = useRouter();
  const rows = batch
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.status === "skipped");

  if (rows.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      <SectionLabel title="Übersprungen" count={rows.length} />
      {rows.map(({ entry, index }) => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 rounded-[16px] border border-border bg-surface-2 py-2.5 pr-3.5 pl-3.5"
        >
          {/* Durchgestrichen und nicht ausgeblendet: übersprungen heißt "nicht
              in den Vorrat und nicht in die Produkt-DB", nicht "war nie da" --
              und die Rücknahme braucht etwas, worauf sie zeigen kann. */}
          {/* Mit der Menge, genau wie in der Fertig-Liste: wer zwei Flaschen
              Milch gescannt und dann übersprungen hat, muss sehen, dass beide
              draußen bleiben -- "Vollmilch" allein liest sich wie eine. */}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-faint line-through">
              {entry.name}
              {entry.quantity > 1 && <span className="ml-1.5">×{entry.quantity}</span>}
            </span>
            {/* Die einzige Zeile hier, die nicht der Nutzer selbst
                verursacht hat: sie stand schon übersprungen da, als er
                ankam. Ohne die Begründung sähe das nach einem Fehler des
                Einlesens aus -- nach einer Zeile, die die App verschluckt
                hat, statt nach einer Frage, die sie stellt. */}
            {entry.foodDoubt && (
              <span className="mt-0.5 flex items-center gap-1 text-[11.5px] leading-tight font-semibold text-warning">
                <TriangleAlert className="size-3 shrink-0" strokeWidth={2.4} />
                Vermutlich kein Lebensmittel
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              updateBatch((previous) =>
                previous.map((item, position) =>
                  position === index ? { ...item, status: "pending" as const } : item,
                ),
              );
              router.push(`/review/${index}`);
            }}
            className="shrink-0 text-[12px] font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Doch übernehmen
          </button>
        </div>
      ))}
    </div>
  );
}
