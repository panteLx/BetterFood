"use client";

import { DateCalendar } from "@/components/date-calendar";
import {
  addDays,
  daysUntil,
  formatLong,
  fromDateInputValue,
  toDateInputValue,
} from "@/lib/expiry";
import { cn } from "@/lib/utils";

/**
 * Die Haltbarkeit einer Kategorie, die es nicht (mehr) gibt.
 *
 * Derselbe Wert wie `categories.shelfLifeDays` in der Schemadefinition. Er
 * greift, solange noch keine Kategorie gewählt ist -- der Kalender braucht
 * auch dann schon einen Monat, den er zeigen kann.
 */
export const DEFAULT_SHELF_LIFE_DAYS = 14;

/**
 * Die fünf Sprünge über dem Kalender.
 *
 * Sie bewegen ausschließlich den Cursor und setzen kein Datum -- die
 * Entscheidung aus Runde 6 des Entwurfs, wörtlich: "die Plus-Chips springen
 * nur im Kalender". Ein Sprung ist eine Blätterbewegung, keine Antwort; die
 * Antwort gibt der Nutzer mit einem Tipp ins Raster oder mit dem Knopf, der
 * den Richtwert übernimmt.
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
 * Der Tag, auf den ein Sprung von `days` Tagen zeigt -- als yyyy-mm-dd.
 *
 * Ein Sprung ab einem alten Bezugsdatum kann in der Vergangenheit landen, und
 * dort nimmt der Kalender keine Tipps entgegen. Dann steht der Cursor auf
 * heute: "schon abgelaufen" ist eine Aussage, die der Nutzer treffen soll,
 * nicht der Richtwert.
 *
 * Exportiert, weil die Aufrufer denselben Wert für ihren Vorschlag brauchen:
 * `jumpTarget(shelfLife, ...)` ist der Richtwert der Kategorie, und der muss
 * exakt auf dem Tag landen, den auch ein gleich langer Sprung träfe -- sonst
 * stünde der Vorschlag im Raster neben einem hervorgehobenen Sprung, der
 * woanders hinzeigt.
 */
export function jumpTarget(days: number, reference: Date, today: Date): string {
  const key = toDateInputValue(addDays(days, reference));
  const todayKey = toDateInputValue(today);
  return key < todayKey ? todayKey : key;
}

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
 * Der offen stehende MHD-Kalender: Sprungleiste, Monatsraster, Ergebniszeile.
 *
 * Herausgelöst aus dem Prüf-Flow (`review-step.tsx`), wo er seit Runde 8 fest
 * in der Karte steht. Beim Erfassen von Hand -- `/add`, und `/confirm` nach
 * einem getippten EAN -- lag derselbe Schätzwert bis dahin hinter einem Knopf,
 * der erst ein Blatt öffnen musste: `initialExpiryValue()` in `item-form.tsx`
 * hatte ihn längst berechnet, nur sah ihn niemand, und wer nicht tippte,
 * speicherte eine Schätzung, die er nie zu Gesicht bekommen hat. Ein Blatt ist
 * die richtige Form für eine Korrektur (`/edit`), nicht für die Frage, die
 * beim Erfassen ohnehin ansteht.
 *
 * Vollständig von außen gesteuert: Wert, "schon entschieden?" und der Stichtag
 * gehören dem Formular, nicht dem Kalender. Nur so bedient derselbe Baustein
 * einmal einen Batch-Schritt und einmal ein Formularfeld.
 */
export function ExpiryPicker({
  value,
  onChange,
  confirmed,
  today,
  reference,
  shelfLife,
  fromPurchase = false,
}: {
  /** yyyy-mm-dd, wie im Formular gehalten. */
  value: string;
  /**
   * Ein Tipp ins Raster oder auf einen Sprung. Beides ist eine Entscheidung --
   * der Aufrufer setzt daraufhin `confirmed`. Ein Sprung ist eine Wahl: wer
   * "+1 Wo" antippt, hat den Tag genauso benannt, als hätte er ihn im Raster
   * getroffen. Der Ring bleibt damit dem einen Zustand vorbehalten, in dem noch
   * gar nichts entschieden ist: dem unangetasteten Richtwert.
   */
  onChange: (value: string) => void;
  /**
   * Ob `value` eine Entscheidung des Nutzers ist oder erst der Richtwert.
   * Steuert den Ring im Raster (siehe `DateCalendar`).
   */
  confirmed: boolean;
  /** Stichtag -- kommt vom Aufrufer, damit new Date() nicht im Render landet. */
  today: Date;
  /**
   * Ab wann die Haltbarkeit zählt. Beim Erfassen und beim Scannen ist das
   * heute. Eine Rechnung von vorgestern rechnet ab dem Rechnungsdatum -- sonst
   * wären alle MHDs zwei Tage zu lang.
   */
  reference: Date;
  /**
   * Der Richtwert der gewählten Kategorie, in Tagen.
   *
   * Nur als Rückfall gebraucht: ein leerer `value` hätte sonst weder einen
   * Monat noch eine Ergebniszeile. Beide Aufrufer füllen ihn vorher -- der
   * Rückfall ist die Zusicherung, dass hier nie ein leeres Raster steht.
   */
  shelfLife: number;
  /**
   * Ob `reference` ein Kaufdatum ist. Steuert allein die Zeile über den
   * Sprüngen; ein Vergleich mit `today` täte es nicht, weil eine Rechnung von
   * heute dann "Sprünge ab heute" schriebe und die Beschriftung mit dem
   * Rechnungsdatum wechselte.
   */
  fromPurchase?: boolean;
}) {
  const effective = value || jumpTarget(shelfLife, reference, today);
  const selected = fromDateInputValue(effective);
  const days = daysUntil(selected, today);
  const todayKey = toDateInputValue(today);

  return (
    <>
      {/* Woran die Sprünge rechnen, muss dastehen. "+3 Tg" neben einem
          Richtwert von 7 Tagen liest sich sonst als "drei Tage auf den
          Richtwert drauf", gemeint sind aber drei Tage ab heute -- beim
          Rechnungsimport ab dem Kaufdatum, weil die Ware da schon im
          Regal lag. */}
      <p className="mt-2.5 text-[11px] font-semibold text-faint">
        {fromPurchase ? "Sprünge ab Kaufdatum" : "Sprünge ab heute"}
      </p>

      <div className="mt-1.5 overflow-hidden rounded-[16px] border border-border">
        <div className="flex border-b border-border">
          {JUMPS.map((jump, position) => {
            const target = jumpTarget(jump.days, reference, today);
            // Ob ein Sprung überhaupt noch etwas ausdrückt. Bei einer Rechnung
            // vom 24. August landen "+3 Tg" und "+1 Wo" beide vor heute, werden
            // beide auf heute geklemmt -- und standen dann beide hervorgehoben
            // da, als hätte der Nutzer zwei Werte gleichzeitig gewählt. Genau
            // die Doppeldeutigkeit, die der Test der Runde 8 schon am
            // Kalender-Ring gefunden hat. Ein Sprung, der nichts anderes sagen
            // kann als "heute", ist keine Wahl, und ein toter Knopf soll auch
            // tot aussehen.
            const past = toDateInputValue(addDays(jump.days, reference)) < todayKey;
            return (
              <button
                key={jump.days}
                type="button"
                disabled={past}
                aria-pressed={!past && target === effective}
                onClick={() => onChange(target)}
                className={cn(
                  "min-w-0 flex-1 py-[9px] font-mono text-[11.5px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  position > 0 && "border-l border-border",
                  past
                    ? "font-semibold text-faint opacity-50"
                    : target === effective
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
            value={effective}
            onChange={onChange}
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
    </>
  );
}
