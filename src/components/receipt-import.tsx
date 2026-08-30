"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Refrigerator,
  Tags,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { PickerButton, PickerOption } from "@/components/ui/picker";
import { SubPageHeader } from "@/components/sub-page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateSheet } from "@/components/date-sheet";
import { estimateExpiryDate } from "@/lib/categories";
import {
  formatMedium,
  formatShort,
  fromDateInputValue,
  toDateInputValue,
} from "@/lib/expiry";
import { useIsClient } from "@/lib/use-is-client";
import {
  IGNORE_LABELS,
  type ReceiptDraft,
  type ReceiptDraftLine,
} from "@/lib/receipt/types";
import { cn } from "@/lib/utils";
import type { Category, Place } from "@/db/schema";

type CategoryOption = Pick<
  Category,
  "key" | "label" | "shelfLifeDays" | "defaultPlaceId"
>;
type PlaceOption = Pick<Place, "id" | "name">;

/** Der lokale Stand einer Zeile: was der Server vorschlug, plus was der Nutzer daran geaendert hat. */
type Line = ReceiptDraftLine & {
  /** Einmal selbst gewaehlt, bleibt der Ort stehen -- auch bei einem Kategoriewechsel. */
  placeTouched: boolean;
  /**
   * Von Hand gesetztes MHD (yyyy-mm-dd). Schlaegt das aus der Kategorie
   * gerechnete Datum und ueberlebt einen Kategoriewechsel -- dieselbe Regel
   * wie `dateTouched` im Artikelformular.
   */
  expiryOverride: string | null;
  /** Die Menge laut Beleg. Bleibt stehen, damit eine Abweichung sichtbar ist. */
  receiptQuantity: number;
  /** Die Antwort "Doch, ist eins" auf den 19-%-Verdacht, fuer diesen Beleg. */
  hintDismissed: boolean;
  /** Nur im Auswahlmodus: fuer die Sammelaktion markiert. */
  selected: boolean;
};

/**
 * Einen ganzen Einkauf auf einmal erfassen: PDF-Rechnung hochladen, die
 * erkannten Zeilen pruefen, uebernehmen.
 *
 * Der teuerste Moment der App ist der Abend nach dem Wocheneinkauf --
 * dreissig Artikel einzeln zu scannen macht niemand zweimal. Lieferdienste
 * schicken ohnehin eine PDF mit Textebene, und was darin steht (Name, Menge,
 * Lieferdatum), reicht dem Formular vollstaendig; die fehlende EAN kostet
 * nichts, weil die Wiedererkennung ohnehin ueber den Namen laeuft.
 *
 * Der Import bleibt trotzdem ein Vorschlag: nichts landet ungesehen im
 * Vorrat. Dieselbe Haltung wie bei der Kategorie-Vorauswahl -- lieber einmal
 * fragen als dreissig falsche Eintraege hinterher aufraeumen.
 */
export function ReceiptImport({
  categories,
  places,
}: {
  categories: CategoryOption[];
  places: PlaceOption[];
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Das Datumsblatt schliesst sich nach "Auf ... setzen" selbst. Im Lauf ist
  // das der Uebergang zur naechsten Zeile und kein Abbruch -- ohne diese
  // Notiz wuerde das darauffolgende onOpenChange(false) den Rest der
  // Warteschlange verwerfen.
  const advancingRef = useRef(false);

  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<{
    created: number;
    merged: number;
  } | null>(null);

  const [selecting, setSelecting] = useState(false);
  // Abgewaehlte Zeilen sind beantwortet: sie stehen eingeklappt am Ende,
  // damit sie die noch offenen Fragen nicht verduennen.
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [categoryPickerFor, setCategoryPickerFor] = useState<string | null>(
    null,
  );
  const [placePickerFor, setPlacePickerFor] = useState<string | null>(null);
  /**
   * Die Zeilen, deren MHD nacheinander abgefragt wird: eine einzelne beim
   * Tipp auf ihr Datum, mehrere nach einer Sammelaktion. Ein gemeinsames
   * Datum fuer alle Markierten gibt es nicht mehr -- es traf die sechs
   * Joghurts aus derselben Kiste, aber ungefragt auch die Butter daneben,
   * und in der zusammengeklappten Auswahlzeile war das kaum zu sehen.
   * Gefragt wird stattdessen je Artikel, mit seinem Namen im Titel.
   */
  const [dateQueue, setDateQueue] = useState<string[]>([]);
  /**
   * Das zuletzt im Lauf von Hand angetippte Datum -- der Vorschlag fuer die
   * naechste Zeile. Damit bleibt die Kiste Joghurt ein Tipp je Zeile statt
   * eines Kalenders je Zeile. Nur ein aktiv gewaehlter Tag wandert mit, nicht
   * das blosse Bestaetigen einer Schaetzung: sonst bekaeme ein
   * durchgeklickter Lauf ueber gemischte Kategorien am Ende doch wieder
   * ueberall dasselbe Datum.
   */
  const [carriedDate, setCarriedDate] = useState<string | null>(null);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [editingNameFor, setEditingNameFor] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const referenceDate = draft ? new Date(draft.referenceDate) : null;
  const included = lines.filter((line) => line.included);
  const skipped = lines.filter((line) => !line.included);
  const missing = included.filter((line) => !line.category);
  const selected = lines.filter((line) => line.selected);

  // Der Steuersatz waehlt nichts mehr ab, er stellt nur eine Frage -- und
  // auch das nur, solange die Liste das Produkt nicht kennt: ab dem ersten
  // Import ist sie beantwortet. "Gehoert das ueberhaupt in den Vorrat?"
  // kommt vor "wohin gehoert es?", deshalb sortiert der Verdacht die Zeile
  // in einen eigenen Abschnitt ganz oben statt in ein Band in der Zeile.
  const needsFoodAnswer = (line: Line) =>
    line.included &&
    !line.known &&
    line.vatClass === "A" &&
    !line.hintDismissed;
  const hintLines = lines.filter(needsFoodAnswer);
  const missingLines = lines.filter(
    (line) => line.included && !line.category && !needsFoodAnswer(line),
  );
  const readyLines = lines.filter(
    (line) => line.included && line.category !== null && !needsFoodAnswer(line),
  );
  // "Alle" heisst im Auswahlmodus: alle Zeilen im Spiel (included), denn
  // Abgewaehltes wird dort gar nicht erst angeboten. Vorher zaehlte der
  // Umschalter ueber saemtliche Zeilen -- wer zwei bewusst aussortiert
  // hatte, las bei "31 markiert" trotzdem noch "Alle markieren".
  const allMarked =
    included.length > 0 && included.every((line) => line.selected);

  const reset = useCallback(() => {
    setSummary(null);
    setDraft(null);
    setLines([]);
    setError(null);
    setSelecting(false);
    setSkippedOpen(false);
  }, []);

  // <Activity> haelt eine weggeblaetterte Route mitsamt State am Leben: wer
  // nach dem Import in den Vorrat wechselt und spaeter erneut "Rechnung
  // einlesen" waehlt, stuende sonst wieder vor der Bilanz von vorhin statt
  // vor der Dateiauswahl. Bewusst nur die Bilanz -- ein halb gepruefter
  // Beleg soll einen Blick in den Vorrat ueberleben.
  const summaryRef = useRef(summary);
  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);
  useEffect(
    () => () => {
      if (summaryRef.current) reset();
    },
    [reset],
  );

  function categoryFor(key: string | null) {
    return categories.find((category) => category.key === key);
  }

  function placeName(placeId: number | null) {
    return places.find((place) => place.id === placeId)?.name;
  }

  /**
   * Das MHD einer Zeile als yyyy-mm-dd -- von Hand gesetzt, sonst gerechnet
   * ab dem Liefertag des Belegs und nicht ab heute. Eine Rechnung, die
   * erst zwei Tage spaeter eingelesen wird, ergibt sonst durchweg zu lange
   * Haltbarkeiten.
   */
  function expiryValue(line: Line): string {
    if (line.expiryOverride) return line.expiryOverride;
    const category = categoryFor(line.category);
    if (!category || !referenceDate) return "";
    return toDateInputValue(
      estimateExpiryDate(category.shelfLifeDays, referenceDate),
    );
  }

  function updateLine(id: string, change: (line: Line) => Line) {
    setLines((previous) =>
      previous.map((line) => (line.id === id ? change(line) : line)),
    );
  }

  function updateSelected(change: (line: Line) => Line) {
    setLines((previous) =>
      previous.map((line) => (line.selected ? change(line) : line)),
    );
  }

  /** Beginnt einen Lauf durch die Datumsabfrage; ohne Zeilen passiert nichts. */
  function startDateQueue(ids: string[]) {
    setCarriedDate(null);
    setDateQueue(ids);
  }

  /**
   * Schreibt das Datum auf die gerade gefragte Zeile und rueckt eine weiter.
   * `carry` nur beim aktiv angetippten Tag -- siehe carriedDate.
   */
  function commitDate(value: string, carry: boolean) {
    const id = dateQueue[0];
    if (!id) return;
    updateLine(id, (line) => ({ ...line, expiryOverride: value }));
    if (carry) setCarriedDate(value);
    setDateQueue((previous) => previous.slice(1));
  }

  /**
   * Setzt die Kategorie und mit ihr deren Standardfach -- ausser der Nutzer
   * hat den Ort schon selbst gewaehlt. Was die Liste ueber das Produkt
   * gelernt hat, fuellt nur die Erstbelegung (im Server); einen aktiven
   * Kategoriewechsel ueberlebt es nicht: wer umsortiert, meint das Fach der
   * neuen Kategorie.
   */
  function withCategory(line: Line, key: string): Line {
    // Eine Kategorie beantwortet den 19-%-Verdacht mit: wer die Zeile nach
    // Milchprodukten einsortiert, hat "gehoert das ueberhaupt in den Vorrat?"
    // laengst mit ja beantwortet. Ohne das bliebe sie mit Fach und Datum
    // unter "Vermutlich kein Lebensmittel" stehen und saehe unerledigt aus.
    const next = { ...line, category: key, hintDismissed: true };
    if (!line.placeTouched) {
      next.placeId = categoryFor(key)?.defaultPlaceId ?? line.placeId;
    }
    return next;
  }

  function withPlace(line: Line, placeId: number | null): Line {
    return { ...line, placeId, placeTouched: true };
  }

  /** Setzt die Markierung genau der Zeilen eines Abschnitts; andere bleiben. */
  function markLines(sectionLines: Line[], selected: boolean) {
    const ids = new Set(sectionLines.map((line) => line.id));
    setLines((previous) =>
      previous.map((line) => (ids.has(line.id) ? { ...line, selected } : line)),
    );
  }

  /**
   * Die eine Statuszeile der kompakten Auswahlzeile. Dass eine Zeile nicht
   * uebernommen wird, sagt hier der Text -- nicht die Deckkraft: als beides
   * dieselbe Zeile faerbte (Markierung als Rand, Abwahl als Ausgrauen), sah
   * eine markierte abgewaehlte Zeile halb angehakt aus.
   */
  function markStatus(line: Line): string {
    if (!line.included) return "wird nicht übernommen";
    const category = categoryFor(line.category);
    if (!category) return "keine Kategorie";
    const place = placeName(line.placeId);
    return place ? `${category.label} · ${place}` : category.label;
  }

  /**
   * Die Zeile im Auswahlmodus: Auswahlkreis, Name, Statuszeile -- und rechts
   * das MHD als eigene Spalte, denn wer hier Daten korrigieren will, muss
   * erst sehen, welche Zeilen das gerechnete Standarddatum tragen; dreissig
   * Daten untereinander sind nur als Spalte vergleichbar. Mehr nicht:
   * Stepper, Picker und Datum sind waehrend einer Sammelaktion nicht
   * bedienbar und machen nur Laerm; die ganze Zeile schaltet die Markierung.
   */
  function renderMarkLine(line: Line) {
    const value = expiryValue(line);
    return (
      <button
        key={line.id}
        type="button"
        role="checkbox"
        aria-checked={line.selected}
        aria-label={`${line.name} markieren`}
        onClick={() =>
          updateLine(line.id, (current) => ({
            ...current,
            selected: !current.selected,
          }))
        }
        className={cn(
          "flex w-full items-center gap-3 rounded-[20px] border p-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          line.selected
            ? "border-primary bg-primary-tint"
            : "border-border bg-card",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
            line.selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface-2",
          )}
        >
          {line.selected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] leading-snug font-bold">
            {line.name}
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
            {markStatus(line)}
          </span>
        </span>
        {/* Leer bei Zeilen ohne Kategorie -- die Statuszeile sagt dort
            ohnehin schon "keine Kategorie". */}
        {value && (
          <span className="shrink-0 text-right font-mono text-xs font-semibold text-muted-foreground">
            {formatShort(fromDateInputValue(value))}
          </span>
        )}
      </button>
    );
  }

  /**
   * Eine Zeile im Abschnitt "Vermutlich kein Lebensmittel": nur der Name und
   * die beiden einzigen Antworten auf den Verdacht -- raus damit, oder doch
   * ein Lebensmittel. Kategorie, Ort und MHD gibt es hier bewusst nicht:
   * "gehoert das ueberhaupt in den Vorrat?" kommt vor "wohin gehoert es?",
   * sonst legt die Kategorie-Sperre nahe, dem Klopapier eine zu geben.
   */
  function renderHintLine(line: Line) {
    return (
      <div
        key={line.id}
        className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-card p-3.5"
      >
        {/* Der Name steht ueber die volle Breite und wird nicht abgeschnitten:
            "ja! Komfort Toil..." ist genau die Information, aus der die Frage
            beantwortet wird. */}
        <span className="text-[14.5px] leading-snug font-bold">
          {line.name}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={`${line.name} abwählen`}
            onClick={() =>
              updateLine(line.id, (current) => ({
                ...current,
                included: false,
              }))
            }
            className="h-10 flex-1 rounded-[12px] bg-warning text-[13px] font-bold text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Abwählen
          </button>
          <button
            type="button"
            aria-label={`${line.name} ist ein Lebensmittel`}
            onClick={() =>
              updateLine(line.id, (current) => ({
                ...current,
                hintDismissed: true,
              }))
            }
            className="h-10 flex-1 rounded-[12px] border border-border bg-surface-2 text-[13px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Doch, ist eins
          </button>
        </div>
      </div>
    );
  }

  /** Eine abgewaehlte Zeile: beantwortet, also nur Name und der Rueckweg. */
  function renderSkippedLine(line: Line) {
    return (
      <div
        key={line.id}
        className="flex items-center gap-2.5 rounded-[20px] border border-border/60 bg-card p-3.5"
      >
        <span className="min-w-0 flex-1 truncate text-[14.5px] leading-snug font-bold text-faint">
          {line.name}
        </span>
        <button
          type="button"
          aria-label={`${line.name} doch übernehmen`}
          onClick={() =>
            updateLine(line.id, (current) => ({ ...current, included: true }))
          }
          className="shrink-0 rounded-[10px] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Doch übernehmen
        </button>
      </div>
    );
  }

  /**
   * Die volle Pruefzeile fuer alles, was uebernommen wird: Haken, Name,
   * Stepper, Kategorie -- und erst mit der Kategorie Ort und MHD, denn ohne
   * sie gibt es beides nicht zu entscheiden.
   */
  function renderReviewLine(line: Line) {
    const category = categoryFor(line.category);
    const value = expiryValue(line);
    const expiry = value ? fromDateInputValue(value) : null;

    return (
      <div
        key={line.id}
        className="rounded-[20px] border border-border bg-card p-3.5"
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={line.included}
            aria-label={`${line.name} übernehmen`}
            onClick={() =>
              updateLine(line.id, (current) => ({
                ...current,
                included: !current.included,
              }))
            }
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[8px] border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              line.included
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface-2",
            )}
          >
            {line.included && <Check className="size-4" strokeWidth={3} />}
          </button>

          {editingNameFor === line.id ? (
            <>
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                autoFocus
                aria-label="Name des Artikels"
                className="h-10 min-w-0 flex-1 rounded-[12px] border border-primary bg-surface-2 px-2.5 text-sm font-bold outline-none"
              />
              <Button
                size="icon"
                className="size-10 shrink-0 rounded-[12px]"
                aria-label="Namen übernehmen"
                onClick={() => {
                  const trimmed = editName.trim();
                  if (trimmed) {
                    updateLine(line.id, (current) => ({
                      ...current,
                      name: trimmed,
                    }));
                  }
                  setEditingNameFor(null);
                }}
              >
                <Check className="size-4" strokeWidth={2.4} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-10 shrink-0 rounded-[12px]"
                aria-label="Abbrechen"
                onClick={() => setEditingNameFor(null)}
              >
                <X className="size-4" strokeWidth={2.3} />
              </Button>
            </>
          ) : (
            <>
              {/* Der Name ist selbst der Knopf -- ein Stift daneben war
                  ein zweites Ziel fuer dieselbe Absicht. Er ist der
                  Schluessel, unter dem die Liste das Produkt
                  wiedererkennt: "KAROTTE SNACK RL" jetzt zu begradigen
                  ist billiger, als es bei jedem kuenftigen Einkauf
                  erneut vorgeschlagen zu bekommen. */}
              <button
                type="button"
                onClick={() => {
                  setEditName(line.name);
                  setEditingNameFor(line.id);
                }}
                aria-label={`${line.name} umbenennen`}
                className="min-w-0 flex-1 rounded-[10px] text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="block text-[14.5px] leading-snug font-bold">
                  {line.name}
                </span>
                {(line.note || line.quantity !== line.receiptQuantity) && (
                  <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                    {line.note}
                    {line.note && line.quantity !== line.receiptQuantity
                      ? " · "
                      : ""}
                    {line.quantity !== line.receiptQuantity &&
                      `laut Beleg ${line.receiptQuantity}×`}
                  </span>
                )}
              </button>

              <div className="flex h-9 shrink-0 items-center gap-0.5 rounded-[12px] border border-border bg-surface-2 px-1">
                <button
                  type="button"
                  aria-label={`Menge von ${line.name} verringern`}
                  disabled={line.quantity <= 1}
                  onClick={() =>
                    updateLine(line.id, (current) => ({
                      ...current,
                      quantity: Math.max(1, current.quantity - 1),
                    }))
                  }
                  className="flex size-7 items-center justify-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
                >
                  <Minus className="size-3.5" strokeWidth={2.6} />
                </button>
                <span className="w-5 text-center font-mono text-[13px] font-bold">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Menge von ${line.name} erhöhen`}
                  onClick={() =>
                    updateLine(line.id, (current) => ({
                      ...current,
                      quantity: current.quantity + 1,
                    }))
                  }
                  className="flex size-7 items-center justify-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Plus className="size-3.5" strokeWidth={2.6} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Erst die Kategorie, dann alles, was aus ihr folgt: Ort
            und MHD gibt es ohne sie nicht zu entscheiden. */}
        <div className="mt-2.5">
          <PickerButton
            icon={Tags}
            label={category?.label ?? "Kategorie wählen"}
            muted={!category}
            onClick={() => setCategoryPickerFor(line.id)}
            aria-label={`Kategorie für ${line.name} wählen`}
          />
        </div>

        {category && (
          <div className="mt-2 flex gap-2">
            {places.length > 0 && (
              <PickerButton
                icon={Refrigerator}
                label={placeName(line.placeId) ?? "Kein Ort"}
                muted={placeName(line.placeId) === undefined}
                onClick={() => setPlacePickerFor(line.id)}
                aria-label={`Ort für ${line.name} wählen`}
              />
            )}
            <PickerButton
              icon={CalendarDays}
              label={expiry ? formatShort(expiry) : "MHD"}
              muted={!expiry}
              onClick={() => startDateQueue([line.id])}
              aria-label={`MHD von ${line.name} ändern`}
            />
          </div>
        )}
      </div>
    );
  }

  /**
   * Der kleine Abschnittsknopf im Auswahlmodus: markiert die Zeilen des
   * Abschnitts. Er nennt seine Reichweite beim Namen ("Diese N markieren")
   * -- als er wie der Umschalter im Fuss "Alle markieren" hiess, standen
   * zwei gleich beschriftete Knoepfe mit verschiedener Reichweite auf dem
   * Schirm. Unter "Braucht noch eine Kategorie" ist er ausserdem der
   * Kaltstart-Weg: die Vormarkierung, die frueher der "Markieren"-Knopf in
   * der Warnung uebernahm, liegt jetzt hier -- an der Ueberschrift der
   * Zeilen, auf die sie wirkt, einen Tipp hinter "Mehrere bearbeiten".
   *
   * Er schaltet um: sind die Zeilen des Abschnitts bereits alle markiert,
   * nimmt er die Markierung zurueck. Ein Knopf, der zum Markieren auffordert,
   * waehrend darunter schon alles markiert ist, liest sich als Fehler.
   * "Markierung aufheben" und nicht "abwaehlen": abgewaehlt heisst in diesem
   * Schirm, dass eine Zeile nicht in den Vorrat kommt -- ein anderer Vorgang.
   */
  function renderMarkSectionButton(sectionLines: Line[], title: string) {
    const marked = sectionLines.every((line) => line.selected);
    return (
      <button
        type="button"
        aria-label={
          marked
            ? `Die Markierung unter „${title}“ aufheben`
            : sectionLines.length === 1
              ? `Die Zeile unter „${title}“ markieren`
              : `Die ${sectionLines.length} Zeilen unter „${title}“ markieren`
        }
        onClick={() => markLines(sectionLines, !marked)}
        className="shrink-0 rounded-[10px] px-2 py-1 text-[12.5px] font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {marked
          ? "Markierung aufheben"
          : `Diese ${sectionLines.length} markieren`}
      </button>
    );
  }

  async function readFile(file: File) {
    setError(null);
    setReading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/receipt/parse", { method: "POST", body });
      const payload = (await res.json()) as ReceiptDraft & { error?: string };

      if (!res.ok) {
        setError(payload.error ?? "Die Rechnung konnte nicht gelesen werden.");
        return;
      }

      setDraft(payload);
      setLines(
        payload.lines.map((line) => ({
          ...line,
          placeTouched: false,
          expiryOverride: null,
          receiptQuantity: line.quantity,
          hintDismissed: false,
          selected: false,
        })),
      );
    } catch {
      setError("Die Rechnung konnte nicht gelesen werden.");
    } finally {
      setReading(false);
      // Damit dieselbe Datei nach einem Fehler erneut gewaehlt werden kann --
      // ein unveraenderter Wert loest kein change-Ereignis aus.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function importItems() {
    setConfirmPartial(false);
    setSaving(true);
    try {
      const res = await fetch("/api/items/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: included.map((line) => ({
            name: line.name.trim(),
            // Damit der naechste Beleg denselben Eintrag trifft, auch wenn
            // der Name hier begradigt wurde -- siehe /api/items/import.
            rawName: line.rawName,
            note: line.note,
            category: line.category,
            placeId: line.placeId,
            quantity: line.quantity,
            expiryDate: fromDateInputValue(expiryValue(line)).toISOString(),
          })),
        }),
      });
      const payload = (await res.json()) as {
        created?: number;
        merged?: number;
        error?: string;
      };
      if (!res.ok)
        throw new Error(payload.error ?? "Der Import ist fehlgeschlagen.");

      setSummary({
        created: payload.created ?? 0,
        merged: payload.merged ?? 0,
      });
      // Die Vorratsseiten sind serverseitig gerendert und muessen den Zuwachs
      // sehen, sobald der Nutzer hinueberwechselt.
      router.refresh();
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Der Import ist fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (summary) {
    return (
      <>
        <SubPageHeader title="Rechnung eingelesen" />
        <EmptyState
          icon={Check}
          tone="primary"
          title={`${summary.created + summary.merged} Artikel übernommen`}
          body={
            summary.merged > 0
              ? `${summary.created} neu angelegt, ${summary.merged} mit vorhandenen Artikeln zusammengefasst.`
              : "Alle stehen jetzt im Vorrat."
          }
          action={
            <div className="mt-1 flex flex-col items-center gap-2">
              <Button
                className="h-12 rounded-lg px-6"
                onClick={() => router.push("/inventory")}
              >
                Zum Vorrat
              </Button>
              <Button variant="ghost" className="rounded-lg" onClick={reset}>
                Noch eine Rechnung einlesen
              </Button>
            </div>
          }
        />
      </>
    );
  }

  if (!draft) {
    return (
      <>
        <SubPageHeader title="Rechnung einlesen" />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void readFile(file);
          }}
          className={cn(
            "rounded-3xl border border-dashed transition-colors",
            dragging
              ? "border-primary bg-primary-tint"
              : "border-border bg-card",
          )}
        >
          <EmptyState
            icon={reading ? Loader2 : Receipt}
            tone="primary"
            className={reading ? "[&_svg]:animate-spin" : undefined}
            title={reading ? "Rechnung wird gelesen …" : "Rechnung einlesen"}
            body="Nur PDF-Rechnungen von Lieferdiensten wie REWE, Flink, Picnic oder anderen werden unterstützt.
            Ein Foto oder eingescannter Kassenbon funktioniert noch nicht!"
            action={
              <Button
                className="mt-1 h-12 rounded-lg px-6"
                disabled={reading}
                onClick={() => fileInputRef.current?.click()}
              >
                PDF auswählen
              </Button>
            }
          />
        </div>

        {error && (
          <p className="rounded-[18px] border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] leading-relaxed font-semibold text-danger">
            {error}
          </p>
        )}
      </>
    );
  }

  const pickerLine = lines.find((line) => line.id === categoryPickerFor);
  const placeLine = lines.find((line) => line.id === placePickerFor);
  const dateLine = lines.find((line) => line.id === dateQueue[0]);

  return (
    <>
      <SubPageHeader title="Kategorisiere deine Artikel" />

      <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-muted-foreground">
        {draft.retailer && (
          <span className="font-bold text-foreground">{draft.retailer}</span>
        )}
        {referenceDate && (
          <span>Einkauf vom {formatMedium(referenceDate)}</span>
        )}
        <span>· {lines.length} Positionen</span>
      </div>

      {draft.ignored.length > 0 && (
        // Nicht stillschweigend schlucken: wer 38 Zeilen auf dem Papier zaehlt
        // und 34 auf dem Schirm, sucht sonst nach dem Fehler.
        <p className="text-[12.5px] leading-relaxed font-medium text-faint">
          {draft.ignored.length} Zeile{draft.ignored.length === 1 ? "" : "n"}{" "}
          übersprungen:{" "}
          {draft.ignored
            .map((entry) => `${entry.rawName} (${IGNORE_LABELS[entry.reason]})`)
            .join(", ")}
        </p>
      )}

      {/* Der eine Einstieg in jede Sammelaktion. Er ersetzt drei Knoepfe mit
          fast derselben Aufgabe ("Alle abwaehlen", "Mehrere bearbeiten" und
          das "Markieren" der Warnung unten): alles, was sie konnten, kann der
          Auswahlmodus auch -- alles raus ist "Alle markieren" plus "Nicht
          uebernehmen", und die Zeilen ohne Kategorie fasst dort der
          Abschnittsknopf "Diese N markieren" direkt an ihrer Ueberschrift.
          Deshalb markiert der Einstieg nichts vor und steht unveraendert da,
          auch wenn keine Zeile mehr etwas braucht: Sammel-MHD oder
          "Nicht uebernehmen" sind auch dann noch sinnvoll. Neben einem
          einzelnen Knopf passt der Zaehler in dieselbe Zeile. */}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-muted-foreground">
          {included.length} von {lines.length} werden übernommen
        </p>
        {!selecting && (
          <button
            type="button"
            onClick={() => setSelecting(true)}
            className="shrink-0 rounded-[11px] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Mehrere bearbeiten
          </button>
        )}
      </div>

      {/* Vier Abschnitte, in der Reihenfolge, in der man sie abarbeitet;
          leere entfallen, innerhalb bleibt die Belegreihenfolge stehen.
          Eine beantwortete Zeile wandert sofort in ihren neuen Abschnitt --
          gewollt: die Warnzaehler schrumpfen sichtbar beim Abarbeiten. */}
      <div className="flex flex-col gap-4">
        {hintLines.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-bold text-warning">
                <TriangleAlert className="size-4 shrink-0" strokeWidth={2.2} />
                Vermutlich kein Lebensmittel · {hintLines.length}
              </p>
              {selecting &&
                renderMarkSectionButton(
                  hintLines,
                  "Vermutlich kein Lebensmittel",
                )}
            </div>
            {hintLines.map((line) =>
              selecting ? renderMarkLine(line) : renderHintLine(line),
            )}
          </section>
        )}

        {missingLines.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-bold text-warning">
                <TriangleAlert className="size-4 shrink-0" strokeWidth={2.2} />
                Braucht noch eine Kategorie · {missingLines.length}
              </p>
              {selecting &&
                renderMarkSectionButton(
                  missingLines,
                  "Braucht noch eine Kategorie",
                )}
            </div>
            {missingLines.map((line) =>
              selecting ? renderMarkLine(line) : renderReviewLine(line),
            )}
          </section>
        )}

        {readyLines.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-bold">
                <Check className="size-4 shrink-0" strokeWidth={2.4} />
                Kommt in den Vorrat · {readyLines.length}
              </p>
              {selecting &&
                renderMarkSectionButton(readyLines, "Kommt in den Vorrat")}
            </div>
            {readyLines.map((line) =>
              selecting ? renderMarkLine(line) : renderReviewLine(line),
            )}
          </section>
        )}

        {/* Im Auswahlmodus gibt es Abgewaehltes nicht zu markieren: wer eine
            Zeile aussortiert hat, hat sie beantwortet, und eine Sammelaktion
            soll sie nicht wieder hereinziehen koennen. Der Abschnitt weicht
            einer stillen Zeile, damit "alle" eindeutig heisst: alle Zeilen im
            Spiel. Der Rueckweg bleibt "Doch uebernehmen" ausserhalb des
            Auswahlmodus. */}
        {skipped.length > 0 &&
          (selecting ? (
            <p className="text-[13px] font-bold text-faint">
              {skipped.length === 1
                ? "1 Zeile ist nicht dabei"
                : `${skipped.length} Zeilen sind nicht dabei`}
            </p>
          ) : (
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {/* Die Ueberschrift ist der Umschalter, und der Abschnitt
                    faengt zugeklappt an: abgewaehlt ist beantwortet und soll
                    die offenen Fragen darueber nicht verduennen. */}
                <button
                  type="button"
                  aria-expanded={skippedOpen}
                  onClick={() => setSkippedOpen((open) => !open)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[10px] text-left text-[13px] font-bold text-faint outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Nicht dabei · {skipped.length}
                  {skippedOpen ? (
                    <ChevronUp className="size-4 shrink-0" strokeWidth={2.2} />
                  ) : (
                    <ChevronDown
                      className="size-4 shrink-0"
                      strokeWidth={2.2}
                    />
                  )}
                </button>
                {/* Der pauschale Rueckweg. Seit "Alle anwaehlen" oben weg
                    ist, waere ein Fehlgriff ("Alle markieren" + "Nicht
                    uebernehmen") sonst teuer: Abgewaehltes ist im
                    Auswahlmodus nicht markierbar, dreissig Zeilen kaemen nur
                    einzeln zurueck. Erst ab zwei Zeilen -- fuer eine reicht
                    "Doch uebernehmen". */}
                {skipped.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Alle ${skipped.length} Zeilen wieder übernehmen`}
                    onClick={() =>
                      setLines((previous) =>
                        previous.map((line) =>
                          line.included ? line : { ...line, included: true },
                        ),
                      )
                    }
                    className="shrink-0 rounded-[10px] px-2 py-1 text-[12.5px] font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Alle zurückholen
                  </button>
                )}
              </div>
              {skippedOpen && skipped.map((line) => renderSkippedLine(line))}
            </section>
          ))}
      </div>

      {/* Unten festgeklebt, weil dreissig Zeilen sonst zwischen der Auswahl und
          dem Knopf liegen, der sie abschliesst. */}
      <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 border-t border-border bg-background/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
        {selecting ? (
          <>
            <div className="flex items-center gap-2">
              {/* "von {included.length}": die Bezugsmenge sind die Zeilen im
                  Spiel, nicht der ganze Beleg -- Abgewaehltes steht oben nur
                  noch als stille Zeile. */}
              <p className="min-w-0 flex-1 text-[13px] font-bold">
                {selected.length} von {included.length} markiert
              </p>
              <button
                type="button"
                onClick={() =>
                  setLines((previous) =>
                    previous.map((line) => ({
                      ...line,
                      // Abgewaehlte Zeilen koennen keine Markierung tragen --
                      // sie verlassen mit "Nicht uebernehmen" den
                      // Arbeitsbereich, und eine unsichtbar markierte Zeile
                      // wuerde von der naechsten Sammelaktion getroffen.
                      selected: line.included ? !allMarked : false,
                    })),
                  )
                }
                className="shrink-0 rounded-[10px] px-2 py-1 text-[12.5px] font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {allMarked ? "Keine markieren" : "Alle markieren"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelecting(false);
                  setLines((previous) =>
                    previous.map((line) => ({ ...line, selected: false })),
                  );
                }}
                className="shrink-0 rounded-[10px] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Fertig
              </button>
            </div>
            {/* Ein Knopf, eine Frage: wohin gehoeren die markierten Zeilen?
                Alles Weitere haengt daran und wird nicht einzeln erfragt --
                das Fach kommt als Standardfach der Kategorie mit, das MHD
                fragt der Lauf gleich danach je Zeile ab. Drei gleich grosse
                Knoepfe standen hier vorher nebeneinander, obwohl zwei davon
                nur die Nacharbeit an der Antwort des ersten waren: ein
                falsches Fach ist in der Einzelzeile geaendert, und ein
                Datum will man ohnehin je Artikel sehen. */}
            <Button
              variant="outline"
              className="h-12 w-full rounded-lg text-[14px]"
              disabled={selected.length === 0}
              onClick={() => setBulkCategoryOpen(true)}
            >
              <Tags className="size-4" />
              Einsortieren
            </Button>
            {/* "Nicht uebernehmen" tut etwas ganz anderes als die drei
                Angabe-Knoepfe und steht deshalb hinter einer Haarlinie fuer
                sich. Es kippt nicht mehr: die Rueckseite ("Uebernehmen") ist
                unerreichbar geworden, weil Abgewaehltes im Auswahlmodus gar
                nicht markierbar ist -- und ein Etikett, das unter dem Finger
                wechselte, war ohnehin schwer zu treffen. Anders als die
                Angabe-Knoepfe loescht es die Markierung: die Absicht ist
                erledigt, und genau eine stehenbleibende Markierung an einer
                gerade abgewaehlten Zeile sah frueher wie ein halber Haken
                aus. Zurueck geht es je Zeile ueber "Doch uebernehmen" und
                pauschal ueber "Alle zurueckholen" in der Ueberschrift
                "Nicht dabei". */}
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() =>
                updateSelected((line) => ({
                  ...line,
                  included: false,
                  selected: false,
                }))
              }
              className="w-full border-t border-border pt-3 pb-0.5 text-[13.5px] font-bold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
            >
              Nicht übernehmen
            </button>
          </>
        ) : (
          <>
            {missing.length > 0 && (
              <div className="flex items-center gap-2.5 rounded-[16px] bg-warning-tint px-3.5 py-2.5">
                <TriangleAlert
                  className="size-4.5 shrink-0 text-warning"
                  strokeWidth={2.2}
                />
                {/* Zaehlt nach Abschnitten getrennt: die Verdachtszeilen
                    stehen oben und tauchen unter "braucht eine Kategorie"
                    nicht auf -- eine Gesamtzahl waere hier groesser als
                    jede Ueberschrift und liesse den Rest suchen. */}
                <p className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-warning">
                  {missingLines.length > 0 && (
                    <>
                      {missingLines.length} Zeile
                      {missingLines.length === 1 ? "" : "n"} brauch
                      {missingLines.length === 1 ? "t" : "en"} noch eine
                      Kategorie
                    </>
                  )}
                  {missingLines.length > 0 && hintLines.length > 0 && ", "}
                  {hintLines.length > 0 && (
                    <>
                      {hintLines.length} wart
                      {hintLines.length === 1 ? "et" : "en"} oben auf deine
                      Antwort
                    </>
                  )}
                </p>
                {/* Reine Information, kein Knopf mehr: der eine Einstieg in
                    die Mehrfachauswahl steht oben ueber der Liste, und dort
                    markiert der Abschnittsknopf "Diese N markieren" genau
                    diese Zeilen -- an der Stelle, an der sie stehen. */}
              </div>
            )}
            <Button
              className="h-13 w-full rounded-lg text-[15px]"
              disabled={saving || included.length === 0 || missing.length > 0}
              onClick={() =>
                skipped.length > 0 ? setConfirmPartial(true) : importItems()
              }
            >
              {saving
                ? "Wird übernommen …"
                : `${included.length} Artikel übernehmen`}
            </Button>
          </>
        )}
      </div>

      <Sheet
        open={categoryPickerFor !== null}
        onOpenChange={(open) => !open && setCategoryPickerFor(null)}
        title={
          pickerLine ? `„${pickerLine.name}“ gehört zu` : "Kategorie wählen"
        }
      >
        <div className="flex flex-col gap-1.5">
          {categories.map((category) => (
            <PickerOption
              key={category.key}
              label={category.label}
              hint={`${category.shelfLifeDays} Tage haltbar`}
              selected={pickerLine?.category === category.key}
              onClick={() => {
                if (pickerLine) {
                  updateLine(pickerLine.id, (line) =>
                    withCategory(line, category.key),
                  );
                  // Das MHD folgt der Kategorie: direkt danach oeffnet das
                  // Datumsblatt mit dem aus der neuen Haltbarkeit
                  // gerechneten Datum vorausgewaehlt -- bestaetigen,
                  // korrigieren oder wegwischen, und die Zeile muss nicht
                  // spaeter in ihrem neuen Abschnitt wiedergefunden werden.
                  // Ein von Hand gesetztes Datum wird nicht erneut erfragt:
                  // dieselbe Regel, nach der expiryOverride einen
                  // Kategoriewechsel ueberlebt. Die Sammelzuweisung kettet
                  // genauso, nur durch alle markierten Zeilen nacheinander:
                  // ohne die Frage truegen sie stillschweigend das
                  // gerechnete Standarddatum.
                  if (!pickerLine.expiryOverride) {
                    startDateQueue([pickerLine.id]);
                  }
                }
                setCategoryPickerFor(null);
              }}
            />
          ))}
        </div>
      </Sheet>

      <Sheet
        open={placePickerFor !== null}
        onOpenChange={(open) => !open && setPlacePickerFor(null)}
        title={placeLine ? `„${placeLine.name}“ liegt in` : "Ort wählen"}
      >
        <div className="flex flex-col gap-1.5">
          {places.map((place) => (
            <PickerOption
              key={place.id}
              label={place.name}
              selected={placeLine?.placeId === place.id}
              onClick={() => {
                if (placeLine)
                  updateLine(placeLine.id, (line) => withPlace(line, place.id));
                setPlacePickerFor(null);
              }}
            />
          ))}
          <PickerOption
            label="Kein Ort"
            selected={placeLine?.placeId === null}
            onClick={() => {
              if (placeLine)
                updateLine(placeLine.id, (line) => withPlace(line, null));
              setPlacePickerFor(null);
            }}
          />
        </div>
      </Sheet>

      <Sheet
        open={bulkCategoryOpen}
        onOpenChange={setBulkCategoryOpen}
        title={`${selected.length} Zeilen einsortieren`}
      >
        <div className="flex flex-col gap-1.5">
          {categories.map((category) => (
            <PickerOption
              key={category.key}
              label={category.label}
              hint={`${category.shelfLifeDays} Tage haltbar`}
              selected={false}
              onClick={() => {
                // Das MHD folgt der Kategorie auch hier -- aber je Zeile:
                // der Lauf fragt sie nacheinander ab, mit dem aus der neuen
                // Haltbarkeit gerechneten Datum vorausgewaehlt. Wer sein
                // Datum schon selbst gesetzt hat, wird nicht erneut gefragt;
                // dieselbe Regel, nach der expiryOverride einen
                // Kategoriewechsel ueberlebt. Die Zeilen fuer den Lauf
                // stehen vor der Aenderung fest, denn die Markierung faellt
                // gleich weg.
                const queue = selected
                  .filter((line) => line.expiryOverride === null)
                  .map((line) => line.id);
                // Danach ist die Sammelaktion zu Ende: die Markierung faellt
                // weg, denn mit der Kategorie kommt das Fach und gleich
                // darauf das Datum -- die Zeilen sind beantwortet und sollen
                // den Arbeitsbereich sichtbar verlassen, statt in die
                // naechste Sammelaktion hineinzulaufen.
                updateSelected((line) => ({
                  ...withCategory(line, category.key),
                  selected: false,
                }));
                setBulkCategoryOpen(false);
                startDateQueue(queue);
              }}
            />
          ))}
        </div>
      </Sheet>

      {/* Ein Blatt fuer alle Datumsfragen -- es wandert durch die
          Warteschlange. Der Produktname steht im Titel, weil es auch
          ungefragt erscheint (direkt nach der Kategorie, einzeln wie im
          Sammelzug): ein drittes "Haltbar bis" in Folge sagt nicht, worueber
          gerade entschieden wird. Bestaetigen und Korrigieren gehen beide
          eine Zeile weiter, Wegwischen bricht den ganzen Lauf ab -- die
          restlichen Zeilen behalten dann ihr gerechnetes Datum, es geht also
          nichts verloren. */}
      {isClient && (
        <DateSheet
          open={dateLine !== undefined}
          onOpenChange={(open) => {
            if (open) return;
            if (advancingRef.current) {
              advancingRef.current = false;
              return;
            }
            setDateQueue([]);
          }}
          title={
            dateLine
              ? dateQueue.length > 1
                ? `„${dateLine.name}“ hält bis · noch ${dateQueue.length - 1}`
                : `„${dateLine.name}“ hält bis`
              : "Haltbar bis"
          }
          // Ein selbst gesetztes Datum der Zeile steht ueber dem, was der
          // Lauf mitbringt; erst danach kommt das aus der Kategorie
          // gerechnete.
          value={
            dateLine
              ? (dateLine.expiryOverride ??
                carriedDate ??
                expiryValue(dateLine))
              : ""
          }
          onChange={(value) => commitDate(value, true)}
          onConfirm={(value) => {
            advancingRef.current = true;
            commitDate(value, false);
          }}
          today={startOfDay(new Date())}
        />
      )}

      {/* Wer 28 von 34 uebernimmt, hat entweder sechs Zeilen bewusst
          abgewaehlt -- oder eine uebersehen. Der Unterschied ist hinterher
          teuer: nachtragen geht nur einzeln, und den Beleg noch einmal
          einzulesen wuerde die schon uebernommenen Mengen aufaddieren. */}
      <ConfirmDialog
        open={confirmPartial}
        onOpenChange={setConfirmPartial}
        tone="primary"
        icon={Receipt}
        title={
          <>
            Nur {included.length} von {lines.length} Artikeln übernehmen?
          </>
        }
        description={
          <>
            Nicht dabei: {listNames(skipped.map((line) => line.name))}. Was
            jetzt fehlt, musst du später einzeln nachtragen.
          </>
        }
        confirmLabel={`${included.length} übernehmen`}
        onConfirm={importItems}
      />
    </>
  );
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Drei Namen reichen, um wiederzuerkennen, was fehlt -- der Rest waere eine zweite Liste. */
function listNames(names: string[]): string {
  const head = names.slice(0, 3).join(", ");
  const rest = names.length - 3;
  return rest > 0 ? `${head} und ${rest} weitere` : head;
}
