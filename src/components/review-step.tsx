"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { DateCalendar } from "@/components/date-calendar";
import { EmptyState } from "@/components/empty-state";
import { SectionLabel } from "@/components/section-label";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import {
  addDays,
  daysUntil,
  formatLong,
  formatShort,
  fromDateInputValue,
  toDateInputValue,
} from "@/lib/expiry";
import {
  clearBatch,
  updateBatch,
  useBatch,
  type BatchEntry,
} from "@/lib/review-batch";
import { startOfDay } from "@/lib/stats";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import type { Category, Place } from "@/db/schema";

/**
 * Die Haltbarkeit einer Kategorie, die es nicht (mehr) gibt.
 *
 * Derselbe Wert wie `categories.shelfLifeDays` in der Schemadefinition. Er
 * greift, solange im vorgeschalteten Schritt noch keine Kategorie gewählt
 * ist -- der Kalender braucht auch dann schon einen Monat, den er zeigen
 * kann.
 */
const DEFAULT_SHELF_LIFE_DAYS = 14;

/**
 * Wie viele Kategorien als Chips dastehen, bevor auf das Blatt verwiesen wird.
 *
 * Sechs sind zwei Zeilen -- genug, dass die übliche Wahl dabei ist, und wenig
 * genug, dass die Frage nicht wie ein Formular aussieht. Der Rest steht im
 * Blatt "Alle Kategorien", zusammen mit den Fächern.
 */
const CATEGORY_CHIPS = 6;

/**
 * Die fünf Sprünge über dem Kalender.
 *
 * Sie bewegen ausschließlich den Cursor und setzen kein Datum -- die
 * Entscheidung aus Runde 6 des Entwurfs, wörtlich: "die Plus-Chips springen
 * nur im Kalender". Ein Sprung ist eine Blätterbewegung, keine Antwort; die
 * Antwort gibt der Nutzer mit einem Tipp ins Raster oder mit dem CTA, der den
 * Richtwert übernimmt.
 *
 * Mono, weil fünf Zellen nebeneinander nur dann gleich breit wirken, wenn die
 * Ziffern es sind.
 */
const JUMPS = [
  { label: "+3 Tg", days: 3 },
  { label: "+1 Wo", days: 7 },
  { label: "+2 Wo", days: 14 },
  { label: "+1 Mon", days: 30 },
  { label: "+1 Jahr", days: 365 },
] as const;

/**
 * "in 7 Tagen" -- die zweite Hälfte der Ergebniszeile.
 *
 * Bewusst nicht `expiryLabel`: das schreibt einen Satzanfang ("In 7 Tagen")
 * und rundet ab zwei Wochen auf Größenordnungen ("In 5 Wochen"). Hier steht
 * die Angabe hinter einem Mittelpunkt in derselben Zeile wie das ausgeschriebene
 * Datum, also klein geschrieben, und sie muss den Tag genau benennen: wer den
 * Kalender offen vor sich hat, vergleicht sie mit dem geringelten Feld.
 */
function relativeSuffix(days: number): string {
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}

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

function ReviewSkeleton() {
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
    const next =
      ahead >= 0 ? ahead : updated.findIndex((item) => item.status === "pending");
    router.push(`/review/${next >= 0 ? next : updated.length}`);
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
      router.replace(
        `/saved?name=${encodeURIComponent(summary)}&method=${
          batch[0]?.source === "scan" ? "scan" : "manual"
        }`,
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
        {index > 0 && (
          <button
            type="button"
            onClick={() => router.push(`/review/${index - 1}`)}
            className="inline-flex h-[30px] w-fit items-center gap-1 rounded-[10px] border border-border bg-card pr-3 pl-2 text-[12px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="size-3.5" strokeWidth={2.4} />
            Voriger Artikel
          </button>
        )}

        <h1 className="text-[20px] leading-tight font-extrabold">Kurz prüfen</h1>

        <p className="text-[12.5px] font-bold text-muted-foreground">
          {entry ? `Artikel ${index + 1} von ${batch.length}` : `Alle ${batch.length} geprüft`}
          {" · "}
          <span className="text-primary">{decidedCount} geprüft</span>
        </p>

        {/* Ein Segment je Artikel statt einer durchgehenden Leiste: der
            Fortschritt ist hier abzählbar, und die Lücken sagen, wie viele
            Griffe noch bevorstehen. Die Farbe unterscheidet außerdem
            "übernommen" von "übersprungen" -- eine gefüllte Leiste könnte das
            nicht. */}
        <div className="flex h-1 gap-1" aria-hidden="true">
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
                      ? "bg-primary-tint"
                      : "bg-track",
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
  const todayKey = toDateInputValue(today);

  // Ein Sprung ab einem alten Bezugsdatum kann in der Vergangenheit landen,
  // und dort nimmt der Kalender keine Tipps entgegen. Dann steht der Cursor
  // auf heute: "schon abgelaufen" ist eine Aussage, die der Nutzer treffen
  // soll, nicht der Richtwert.
  function jumpTarget(days: number): string {
    const key = toDateInputValue(addDays(days, reference));
    return key < todayKey ? todayKey : key;
  }

  const suggestion = jumpTarget(shelfLife);

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

  const selected = fromDateInputValue(date);
  const days = daysUntil(selected, today);
  const place = places.find((row) => row.id === placeId) ?? null;
  const patch: StepPatch = { category, placeId };

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
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] leading-tight font-extrabold tracking-[-0.01em]">
              {entry.name || entry.barcode || "Unbenannt"}
              {entry.quantity > 1 && (
                <span className="ml-2 text-muted-foreground">×{entry.quantity}</span>
              )}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold text-faint">
              {categoryRow
                ? [categoryRow.label, place?.name].filter(Boolean).join(" · ")
                : "Noch nicht einsortiert"}
            </p>
          </div>
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

            {/* Woran die Sprünge rechnen, muss dastehen. "+3 Tg" neben einem
                Richtwert von 7 Tagen liest sich sonst als "drei Tage auf den
                Richtwert drauf", gemeint sind aber drei Tage ab heute -- beim
                Rechnungsimport ab dem Kaufdatum, weil die Ware da schon im
                Regal lag. */}
            <p className="mt-2.5 text-[11px] font-semibold text-faint">
              {entry.purchasedAt ? "Sprünge ab Kaufdatum" : "Sprünge ab heute"}
            </p>

            <div className="mt-1.5 overflow-hidden rounded-[16px] border border-border">
              <div className="flex border-b border-border">
                {JUMPS.map((jump, position) => {
                  const target = jumpTarget(jump.days);
                  return (
                    <button
                      key={jump.days}
                      type="button"
                      aria-pressed={target === date}
                      onClick={() => {
                        setDate(target);
                        // Ein Sprung ist eine Wahl. Wer "+1 Wo" antippt, hat den
                        // Tag genauso benannt, als hätte er ihn im Raster
                        // getroffen -- der Ring bleibt damit dem einen Zustand
                        // vorbehalten, in dem noch gar nichts entschieden ist:
                        // dem unangetasteten Richtwert.
                        setConfirmed(true);
                      }}
                      className={cn(
                        "min-w-0 flex-1 py-[9px] font-mono text-[11.5px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        position > 0 && "border-l border-border",
                        target === date
                          ? "bg-primary-tint font-bold text-primary"
                          : "font-semibold text-muted-foreground",
                      )}
                    >
                      {jump.label}
                    </button>
                  );
                })}
              </div>
              <div className="p-2.5">
                <DateCalendar
                  value={date}
                  onChange={(next) => {
                    setDate(next);
                    setConfirmed(true);
                  }}
                  today={today}
                  confirmed={confirmed}
                  markToday={false}
                />
              </div>
            </div>

            {/* Was gespeichert wird, steht hier -- in beiden Fällen, ob der
                Nutzer getippt hat oder den Richtwert stehen lässt. Genau das
                war der Einwand aus Runde 5 gegen geschätzte Daten: nicht das
                Schätzen selbst, sondern dass es unsichtbar geschah. */}
            <p className="mt-3 text-[13px] font-bold">
              {formatLong(selected)}
              <span className="font-semibold text-faint"> · {relativeSuffix(days)}</span>
            </p>

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
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.slice(0, CATEGORY_CHIPS).map((option) => (
                <Chip
                  key={option.key}
                  onClick={() => chooseCategory(option)}
                  className="text-[12.5px]"
                >
                  {option.label}
                </Chip>
              ))}
              {categories.length > CATEGORY_CHIPS && (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="inline-flex h-[34px] items-center rounded-[10px] border border-dashed border-border px-3 text-[12.5px] font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Alle Kategorien
                </button>
              )}
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

  if (rows.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      <SectionLabel title="Fertig" count={rows.length} hint="antippen zum Ändern" />
      {rows.map(({ entry, index }) => {
        const label =
          categories.find((row) => row.key === entry.category)?.label ?? entry.category;
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
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-faint line-through">
            {entry.name}
            {entry.quantity > 1 && <span className="ml-1.5">×{entry.quantity}</span>}
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
