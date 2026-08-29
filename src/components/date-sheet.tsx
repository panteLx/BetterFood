"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Chip } from "@/components/ui/chip";
import { addDays, formatMedium, fromDateInputValue, toDateInputValue } from "@/lib/expiry";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Die fuenf Abstaende, die im Haushalt tatsaechlich vorkommen. Fuer alles
// andere steht der Kalender darunter.
const QUICK_DATES = [
  { label: "Heute", days: 0 },
  { label: "Morgen", days: 1 },
  { label: "In 3 Tagen", days: 3 },
  { label: "In 1 Woche", days: 7 },
  { label: "In 1 Monat", days: 30 },
] as const;

const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

/**
 * Die Datumsauswahl als Blatt statt als <input type="date">.
 *
 * Das native Feld sieht auf jedem Geraet anders aus, oeffnet auf iOS ein
 * Rad und beantwortet die haeufigste Frage ("in einer Woche") am
 * umstaendlichsten. Hier steht sie als erster Chip.
 */
export function DateSheet({
  open,
  onOpenChange,
  value,
  onChange,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** yyyy-mm-dd, wie im Formular gehalten. */
  value: string;
  onChange: (value: string) => void;
  /** Stichtag -- kommt vom Aufrufer, damit new Date() nicht im Render landet. */
  today: Date;
}) {
  const selected = useMemo(() => (value ? fromDateInputValue(value) : today), [value, today]);
  const [monthCursor, setMonthCursor] = useState<Date | null>(null);
  // Ohne eigenen Blaettern-Zustand folgt der Kalender dem gewaehlten Datum.
  const month = useMemo(
    () => monthCursor ?? new Date(selected.getFullYear(), selected.getMonth(), 1),
    [monthCursor, selected],
  );

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // Montag als erster Wochentag: getDay() liefert 0 fuer Sonntag.
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

  function pick(date: Date) {
    onChange(toDateInputValue(date));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Haltbar bis">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-4">
        {QUICK_DATES.map((quick) => {
          const date = addDays(quick.days, today);
          return (
            <Chip
              key={quick.days}
              active={toDateInputValue(date) === value}
              onClick={() => {
                setMonthCursor(null);
                pick(date);
              }}
              className="h-9"
            >
              {quick.label}
            </Chip>
          );
        })}
      </div>

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
          const isSelected = key === value;
          const isToday = key === todayKey;
          // Vergangene Tage sind kein sinnvolles MHD fuer einen Artikel, den
          // man gerade erst erfasst -- ausser er ist schon abgelaufen, und
          // dafuer gibt es die Bearbeiten-Ansicht mit demselben Kalender.
          const isPast = key < todayKey;
          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              aria-pressed={isSelected}
              onClick={() => pick(date)}
              className={cn(
                "h-10 rounded-[13px] text-sm font-semibold tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                !inMonth && "opacity-35",
                isPast && "cursor-default text-faint",
                isSelected && "bg-primary text-primary-foreground",
                isToday && !isSelected && "font-extrabold ring-[1.5px] ring-primary ring-inset",
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="mt-4 h-13.5 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground"
      >
        Auf {formatMedium(selected)} setzen
      </button>
    </Sheet>
  );
}
