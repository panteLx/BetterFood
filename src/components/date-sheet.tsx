"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Chip } from "@/components/ui/chip";
import { DateCalendar } from "@/components/date-calendar";
import { addDays, formatMedium, fromDateInputValue, toDateInputValue } from "@/lib/expiry";

// Die fünf Abstände, die im Haushalt tatsächlich vorkommen. Für alles andere
// steht der Kalender darunter.
const QUICK_DATES = [
  { label: "Heute", days: 0 },
  { label: "Morgen", days: 1 },
  { label: "In 3 Tagen", days: 3 },
  { label: "In 1 Woche", days: 7 },
  { label: "In 1 Monat", days: 30 },
] as const;

/**
 * Die Datumsauswahl als Blatt statt als <input type="date">.
 *
 * Das native Feld sieht auf jedem Gerät anders aus, öffnet auf iOS ein Rad und
 * beantwortet die häufigste Frage ("in einer Woche") am umständlichsten. Hier
 * steht sie als erster Chip.
 *
 * Das Monatsraster selbst steht in <DateCalendar>, weil derselbe Kalender im
 * Prüfschritt fest in einer Karte sitzt statt in einem Blatt. Hier bleiben die
 * Schnellwahl und der Abschlussknopf -- also genau das, was ein Blatt ausmacht.
 */
export function DateSheet({
  open,
  onOpenChange,
  value,
  onChange,
  today,
  title = "Haltbar bis",
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** yyyy-mm-dd, wie im Formular gehalten. */
  value: string;
  onChange: (value: string) => void;
  /** Stichtag -- kommt vom Aufrufer, damit new Date() nicht im Render landet. */
  today: Date;
  /**
   * Überschrift des Blatts. Der Beleg-Import setzt hier den Produktnamen ein --
   * nach dem dritten Blatt in Folge weiß man sonst nicht mehr, worüber man
   * gerade entscheidet.
   */
  title?: string;
  /** Beschriftung des Abschlussknopfs; sonst "Auf <Datum> setzen". */
  confirmLabel?: string;
  /**
   * Wird nur vom Abschlussknopf ausgelöst, nicht vom Wegwischen. Für Aufrufer,
   * bei denen das Datum nicht in ein offenes Formular läuft, sondern selbst die
   * Handlung ist -- der Nachkauf legt damit eine Packung an, und das darf ein
   * Tipp neben das Blatt nicht tun.
   */
  onConfirm?: (value: string) => void;
}) {
  const selected = useMemo(() => (value ? fromDateInputValue(value) : today), [value, today]);

  // Eine Schnellwahl ist immer auch ein Sprung der Ansicht, und zwar auch dann,
  // wenn sie den Wert gar nicht ändert: wer sich in den Dezember geblättert hat
  // und "Heute" tippt, will den heutigen Monat sehen. Der Kalender kann das
  // nicht selbst erkennen, weil er dafür eine Änderung an `value` bräuchte --
  // deshalb der Neuaufbau über den key. Er kostet nichts: der ganze Zustand des
  // Kalenders ist der gewählte Monat, und genau der soll hier zurückfallen.
  const [quickNonce, setQuickNonce] = useState(0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-4">
        {QUICK_DATES.map((quick) => {
          const date = addDays(quick.days, today);
          return (
            <Chip
              key={quick.days}
              active={toDateInputValue(date) === value}
              onClick={() => {
                onChange(toDateInputValue(date));
                setQuickNonce((nonce) => nonce + 1);
              }}
              className="h-9"
            >
              {quick.label}
            </Chip>
          );
        })}
      </div>

      <DateCalendar key={quickNonce} value={value} onChange={onChange} today={today} />

      <button
        type="button"
        onClick={() => {
          onConfirm?.(toDateInputValue(selected));
          onOpenChange(false);
        }}
        className="mt-4 h-13.5 w-full rounded-lg bg-primary text-base font-bold text-primary-foreground"
      >
        {confirmLabel ?? `Auf ${formatMedium(selected)} setzen`}
      </button>
    </Sheet>
  );
}
