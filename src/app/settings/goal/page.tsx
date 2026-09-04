"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SubPageHeader } from "@/components/sub-page-header";
import { Chip } from "@/components/ui/chip";
import {
  DEFAULT_MONTHLY_GOAL,
  MONTHLY_GOAL_OPTIONS,
  parseMonthlyGoal,
} from "@/lib/monthly-goal";

/**
 * Das Monatsziel als eigene Seite und nicht als Zeile irgendwo dazwischen.
 *
 * Es gehört weder zu den Erinnerungen (die sagen, wann sich die App meldet)
 * noch zur Darstellung -- es ist das Einzige in den Einstellungen, das der
 * Nutzer sich selbst vornimmt. Die Verteilerseite zeigt den Wert am rechten
 * Rand, wie bei Erinnerungen und Darstellung auch.
 */
export default function GoalPage() {
  const [goal, setGoal] = useState(DEFAULT_MONTHLY_GOAL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { monthlyGoal?: number } | null) => {
        if (!active || !data) return;
        setGoal(parseMonthlyGoal(data.monthlyGoal));
      })
      // Offline oder ein 5xx sind hier kein Fehlerfall, den der Nutzer sehen
      // muesste -- die Seite zeigt dann die Vorgabe. Ohne den Zweig bliebe
      // die Ablehnung unbehandelt; dieselbe Kette in settings/page.tsx faengt
      // sie ebenso ab.
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Wie bei den Erinnerungen: die Auswahl wirkt sofort und speichert sich
   * selbst. Ein Speichern-Knopf neben sechs Chips wäre ein zweiter Schritt
   * für eine Entscheidung, die schon getroffen ist.
   */
  async function pick(next: number) {
    const previous = goal;
    setGoal(next);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyGoal: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Konnte Monatsziel nicht speichern.");
      setGoal(previous);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-4">
      <SubPageHeader title="Monatsziel" />

      <div className="flex flex-col gap-3 rounded-[24px] bg-card p-4 shadow-row">
        <p className="text-[15px] leading-snug font-bold">
          Wie viel willst du diesen Monat aufbrauchen statt wegwerfen?
        </p>
        <div className="flex flex-wrap gap-2">
          {MONTHLY_GOAL_OPTIONS.map((option) => (
            <Chip
              key={option}
              // Vor dem Laden ist keiner aktiv: ein vorschnell markiertes
              // 90 % würde eine fremde Einstellung als die eigene ausgeben.
              active={loaded && goal === option}
              onClick={() => pick(option)}
              className="h-10 px-3.5 tabular-nums"
            >
              {option} %
            </Chip>
          ))}
        </div>
      </div>

      <p className="px-1 text-[13px] leading-relaxed font-medium text-balance text-muted-foreground">
        Die Startseite zeigt, wie weit du diesen Monat bist. 100 % erreicht nur,
        wer nichts verdirbt — als Ziel ist das eher eine Bedingung.
      </p>
    </div>
  );
}
