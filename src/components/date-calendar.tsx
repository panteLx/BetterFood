"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fromDateInputValue, toDateInputValue } from "@/lib/expiry";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const monthFormat = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

/**
 * Das Monatsraster allein -- Monatskopf, Wochentage, Tage.
 *
 * Aus dem Datums-Blatt herausgelöst, weil derselbe Kalender an zwei Stellen
 * gebraucht wird, die sich baulich ausschließen: im Blatt liegt er über allem
 * und wird mit einem Knopf bestätigt, im Prüfschritt steht er fest in der
 * Karte und wird vom Weiter-Knopf der Karte übernommen. Ein Blatt, das man
 * für jeden von zwanzig Artikeln öffnet und schließt, wäre zwanzigmal eine
 * Bewegung zu viel.
 */
export function DateCalendar({
  value,
  onChange,
  today,
  confirmed = true,
}: {
  /** yyyy-mm-dd, wie im Formular gehalten. */
  value: string;
  onChange: (value: string) => void;
  /** Stichtag -- kommt vom Aufrufer, damit new Date() nicht im Render landet. */
  today: Date;
  /**
   * Ob `value` eine Entscheidung des Nutzers ist oder erst ein Vorschlag.
   *
   * Ein bestätigter Tag ist gefüllt, ein vorgeschlagener nur geringelt. Der
   * Unterschied trägt eine echte Aussage -- "das ist der Richtwert der
   * Kategorie" gegen "das hast du so gewählt" --, und deshalb hat der
   * Vorschlag denselben Ring, mit dem der Kalender auch den heutigen Tag
   * markiert: beides heißt "beachtenswert, aber nicht ausgewählt".
   */
  confirmed?: boolean;
}) {
  const selected = useMemo(
    () => (value ? fromDateInputValue(value) : today),
    [value, today],
  );

  const [monthCursor, setMonthCursor] = useState<Date | null>(null);
  const [prevValue, setPrevValue] = useState(value);

  // Eigenes useMemo, damit der angezeigte Monat über Renders hinweg dieselbe
  // Instanz bleibt -- sonst bekäme das Raster darunter bei jedem Render eine
  // neue Abhängigkeit und rechnete 42 Zellen neu, obwohl sich nichts geändert
  // hat.
  const month = useMemo(
    () => monthCursor ?? new Date(selected.getFullYear(), selected.getMonth(), 1),
    [monthCursor, selected],
  );

  // Springt der Wert von außen in einen anderen Monat -- ein Sprung der Leiste
  // im Prüfschritt --, folgt die Ansicht ihm. Bleibt er im angezeigten Monat,
  // bleibt auch die Ansicht stehen: wer sich in den Dezember geblättert hat,
  // will nach einem Tipp dort nicht wieder im September stehen. Ableitung
  // während des Renders statt in einem Effekt, wie in archive-view.tsx und
  // home-overview.tsx auch.
  if (value !== prevValue) {
    setPrevValue(value);
    const next = value ? fromDateInputValue(value) : today;
    if (
      next.getFullYear() !== month.getFullYear() ||
      next.getMonth() !== month.getMonth()
    ) {
      setMonthCursor(null);
    }
  }

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // Montag als erster Wochentag: getDay() liefert 0 für Sonntag.
    const lead = (first.getDay() + 6) % 7;
    const result: { date: Date; inMonth: boolean }[] = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), 1 - lead + index);
      // Die sechste Zeile nur zeichnen, wenn der Monat sie wirklich braucht.
      if (index >= 35 && date.getMonth() !== first.getMonth()) break;
      result.push({ date, inMonth: date.getMonth() === first.getMonth() });
    }
    return result;
  }, [month]);

  const todayKey = toDateInputValue(today);

  return (
    <>
      <div className="flex items-center justify-between pb-2.5">
        <button
          type="button"
          aria-label="Vorheriger Monat"
          onClick={() => setMonthCursor(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="flex size-9.5 items-center justify-center rounded-[13px] border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" strokeWidth={2.1} />
        </button>
        <span className="text-[15px] font-bold">{monthFormat.format(month)}</span>
        <button
          type="button"
          aria-label="Nächster Monat"
          onClick={() => setMonthCursor(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="flex size-9.5 items-center justify-center rounded-[13px] border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRight className="size-4" strokeWidth={2.1} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 pb-1.5">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="py-1 text-center text-[11px] font-semibold text-faint">
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map(({ date, inMonth }) => {
          const key = toDateInputValue(date);
          const isValue = key === value;
          const isToday = key === todayKey;
          // Vergangene Tage sind kein sinnvolles MHD für einen Artikel, den
          // man gerade erst erfasst -- außer er ist schon abgelaufen, und
          // dafür gibt es die Bearbeiten-Ansicht mit demselben Kalender.
          const isPast = key < todayKey;
          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              // Nur der bestätigte Tag ist ausgewählt. Ein Vorschlag ist
              // sichtbar, aber keine Antwort -- und aria-pressed wäre dort
              // die Behauptung, der Nutzer hätte ihn gegeben.
              aria-pressed={isValue && confirmed}
              onClick={() => {
                // Ein Tipp ins Raster darf das Raster nicht verschieben. Trifft
                // er einen der ausgegrauten Randtage des Nachbarmonats, wäre
                // genau das sonst die Folge: der Wert wechselt den Monat, die
                // Ansicht zieht nach, und der eben noch berührte Tag steht
                // plötzlich an einer anderen Stelle. Deshalb beides -- den
                // angezeigten Monat festhalten und den Wert als bereits
                // gesehen vermerken, damit die Ableitung oben ihn nicht für
                // einen Sprung von außen hält und den Monat wieder freigibt.
                setMonthCursor(month);
                setPrevValue(key);
                onChange(key);
              }}
              className={cn(
                "h-10 rounded-[13px] text-sm font-semibold tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                !inMonth && "opacity-35",
                isPast && "cursor-default text-faint",
                isValue && confirmed && "bg-primary text-primary-foreground",
                // Der Ring markiert zweierlei: den heutigen Tag und einen noch
                // unbestätigten Vorschlag. Beides heißt dasselbe -- schau hin,
                // aber es ist nicht deine Wahl -- und fällt in dem einen Fall,
                // in dem der Vorschlag auf heute liegt, zu Recht zusammen.
                // Welches Datum tatsächlich gespeichert wird, sagt ohnehin die
                // Ergebniszeile unter dem Kalender.
                ((isValue && !confirmed) || (isToday && !isValue)) &&
                  "font-extrabold ring-[1.5px] ring-primary ring-inset",
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </>
  );
}
