"use client";

import { useMemo } from "react";
import { computeArchiveStats } from "@/lib/stats";
import { useIsClient } from "@/lib/use-is-client";
import type { Item } from "@/db/schema";

/**
 * Die Rettungsquote und der Wochenverlauf.
 *
 * Sie sind der Grund, das Archiv zu oeffnen, wenn gerade nichts ablaeuft --
 * bis auf status und resolvedAt lagen die Daten dafuer ohnehin schon in der
 * Datenbank, angezeigt wurde davon nur nichts.
 *
 * Gerechnet wird im Client aus den bereits geladenen Artikeln: kein
 * zusaetzlicher Datenbankzugriff, und new Date() bleibt aus dem Server-Render
 * heraus (das wuerde den Prerender der Route abbrechen).
 */
export function ArchiveStats({ items }: { items: Item[] }) {
  const isClient = useIsClient();
  const stats = useMemo(
    () => (isClient ? computeArchiveStats(items, new Date()) : null),
    [isClient, items],
  );

  if (!stats) return null;

  const { savedThisMonth, wastedThisMonth, quota, wasteFreeWeeks, weeks } = stats;
  const busiestWeek = Math.max(1, ...weeks.map((week) => week.saved + week.wasted));

  return (
    <div className="flex flex-col gap-3.5 rounded-3xl border border-border bg-card px-4 py-4.5 shadow-card">
      {quota === null ? (
        <p className="py-2 text-center text-sm leading-relaxed font-medium text-balance text-muted-foreground">
          Noch nichts abgehakt. Sobald du Artikel als aufgebraucht markierst, siehst du hier deine
          Quote.
        </p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[44px] leading-none font-extrabold tracking-tight tabular-nums text-primary">
              {quota} %
            </p>
            <p className="text-[12.5px] font-semibold text-muted-foreground">
              gerettet diesen Monat
            </p>
          </div>

          <div
            className="flex h-2.5 overflow-hidden rounded-md bg-danger-tint"
            role="img"
            aria-label={`${quota} Prozent gerettet`}
          >
            <span className="bg-primary" style={{ width: `${quota}%` }} />
          </div>

          <div className="flex justify-center gap-5 text-[12.5px] font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-primary" />
              {savedThisMonth} gerettet
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-danger" />
              {wastedThisMonth} weggeworfen
            </span>
          </div>
        </>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] font-semibold text-muted-foreground">Letzte 8 Wochen</span>
          {wasteFreeWeeks > 0 && (
            <span className="text-right text-[12.5px] font-bold text-primary">
              {wasteFreeWeeks} {wasteFreeWeeks === 1 ? "Woche" : "Wochen"} ohne Verschwendung
              {wasteFreeWeeks >= 52 && "+"}
            </span>
          )}
        </div>
        <div className="flex h-14 items-end gap-1.5">
          {weeks.map((week) => {
            const total = week.saved + week.wasted;
            const wastedShare = total === 0 ? 0 : Math.round((week.wasted / total) * 100);
            return (
              <div key={week.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded"
                  title={`${week.label}: ${week.saved} gerettet, ${week.wasted} weggeworfen`}
                  style={{
                    height: `${Math.max(6, (total / busiestWeek) * 38)}px`,
                    // Harte Kante statt Verlauf: der Balken zeigt ein
                    // Verhaeltnis, keinen Uebergang.
                    background:
                      total === 0
                        ? "var(--surface-2)"
                        : `linear-gradient(to top, var(--danger) ${wastedShare}%, var(--primary) ${wastedShare}%)`,
                  }}
                />
                <span className="font-mono text-[9.5px] leading-none text-faint">{week.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
