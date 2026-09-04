"use client";

import { useMemo } from "react";
import { Avo } from "@/components/avo";
import { computeArchiveStats, summarizeArchive } from "@/lib/stats";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
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
    () => (isClient ? computeArchiveStats(summarizeArchive(items, new Date())) : null),
    [isClient, items],
  );

  if (!stats) return null;

  const { savedThisMonth, wastedThisMonth, quota, wasteFreeWeeks, weeks } = stats;
  const busiestWeek = Math.max(1, ...weeks.map((week) => week.saved + week.wasted));

  // Das Delta rechts neben "Letzte 8 Wochen" vergleicht die Rettungsquote der
  // laufenden Woche mit der Vorwoche. stats.ts liefert dafuer bewusst nur die
  // Rohwerte je Woche (siehe dort: "eine eigene Funktion neben
  // computeArchiveStats" fuer alles, was ueber das Archiv selbst
  // hinausgeht) -- der Vergleich ist reine Anzeige und gehoert deshalb
  // hierher. Fehlt einer der beiden Wochen jede Aktivitaet, gibt es nichts zu
  // vergleichen.
  const currentShare = savedShare(weeks[weeks.length - 1]);
  const previousShare = weeks.length > 1 ? savedShare(weeks[weeks.length - 2]) : null;
  const delta =
    currentShare !== null && previousShare !== null ? currentShare - previousShare : null;

  return (
    <div className="relative overflow-hidden rounded-[30px] bg-card px-[18px] py-5 shadow-card">
      {/* Dekorativer Fleck, wie im Entwurf -- rein optisch, deshalb ausserhalb
          des Lesepfads. */}
      <span
        aria-hidden
        className="absolute -top-[46px] -left-[30px] size-[140px] rounded-full bg-primary-tint opacity-45"
      />

      {quota === null ? (
        <p className="relative py-2 text-center text-sm leading-relaxed font-medium text-balance text-muted-foreground">
          Noch nichts abgehakt. Sobald du Artikel als aufgebraucht markierst, siehst du hier deine
          Quote.
        </p>
      ) : (
        <>
          <div className="relative flex items-center gap-3.5">
            <Avo size="md" mood="cheer" />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[40px] leading-none font-bold text-primary-deep">
                {quota} %
              </p>
              <p className="mt-[5px] text-[13px] font-bold text-muted-foreground">
                gerettet diesen Monat
              </p>
            </div>
          </div>

          <div className="relative mt-4 h-3.5 overflow-hidden rounded-full bg-track">
            <span
              className="block h-full rounded-full bg-(image:--gradient-primary) animate-grow-h [animation-delay:.2s]"
              style={{ width: `${quota}%` }}
            />
            {/* Glanzband: eigenes Element statt Hintergrundverlauf auf der
                Fuellung selbst, damit es unabhaengig von deren Breite ueber
                die ganze Spur laeuft. */}
            <span
              aria-hidden
              className="sheen-band absolute inset-0 w-[40%] animate-sheen [animation-delay:1.4s]"
            />
            <span className="sr-only">{`${quota} Prozent gerettet`}</span>
          </div>

          <div className="relative mt-3.5 flex gap-[7px]">
            <StatTile value={savedThisMonth} label="gerettet" className="text-primary-deep" />
            <StatTile value={wastedThisMonth} label="weggeworfen" className="text-danger-ink" />
            <StatTile value={wasteFreeWeeks} label="Wo. sauber" className="text-badge-ink" />
          </div>
        </>
      )}

      <div className="relative mt-[18px] border-t border-hairline pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-extrabold tracking-[.06em] text-faint uppercase">
            Letzte 8 Wochen
          </span>
          {delta !== null && (
            <span
              className={cn(
                "font-heading text-[13px] font-bold",
                delta >= 0 ? "text-primary-deep" : "text-danger-ink",
              )}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} %
            </span>
          )}
        </div>
        <div
          className="mt-3.5 flex h-[74px] items-end gap-1.5"
          role="img"
          aria-label="Verlauf der letzten acht Wochen, gerettet und weggeworfen"
        >
          {weeks.map((week, index) => (
            <WeekBar
              key={week.label}
              week={week}
              busiestWeek={busiestWeek}
              current={index === weeks.length - 1}
              delayMs={index * 60}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Anteil gerettet in Prozent, oder null bei einer Woche ganz ohne Eintrag. */
function savedShare(week: { saved: number; wasted: number }): number | null {
  const total = week.saved + week.wasted;
  return total === 0 ? null : Math.round((week.saved / total) * 100);
}

function StatTile({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className: string;
}) {
  return (
    <div className="flex-1 rounded-[18px] bg-surface-2 px-3 py-2.5">
      <p className={cn("font-heading text-[19px] leading-none font-bold", className)}>{value}</p>
      <p className="mt-[3px] text-[11px] font-bold text-faint">{label}</p>
    </div>
  );
}

/**
 * Die 74px hohe Spalte selbst: kein Feld in computeArchiveStats trägt eine
 * Pixelhöhe, das bleibt Darstellung. Die 54px Deckelhöhe lassen unter der
 * 74px hohen Reihe Platz für Beschriftung und Abstand -- höher würde die
 * Wochenzahl unter der Reihe abschneiden.
 */
const MAX_BAR_HEIGHT = 54;

function WeekBar({
  week,
  busiestWeek,
  current,
  delayMs,
}: {
  week: { label: string; saved: number; wasted: number };
  busiestWeek: number;
  current: boolean;
  delayMs: number;
}) {
  const total = week.saved + week.wasted;
  const barHeight =
    total === 0 ? 0 : Math.max(8, Math.round((total / busiestWeek) * MAX_BAR_HEIGHT));

  let savedHeight = 0;
  let wastedHeight = 0;
  if (total > 0) {
    savedHeight = Math.round((week.saved / total) * barHeight);
    wastedHeight = barHeight - savedHeight;
    // Ein tatsaechlich vorhandener Anteil darf durch das Runden nicht auf 0px
    // fallen -- sonst verschluckt die Pixelgrafik, dass in dieser Woche
    // beides vorkam.
    if (week.saved > 0 && savedHeight === 0) {
      savedHeight = 1;
      wastedHeight -= 1;
    }
    if (week.wasted > 0 && wastedHeight === 0) {
      wastedHeight = 1;
      savedHeight -= 1;
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div
        className="flex w-full flex-col"
        title={`${week.label}: ${week.saved} gerettet, ${week.wasted} weggeworfen`}
      >
        {total === 0 ? (
          // Leere Woche: ein Stummel statt zweier Nullhoehen-Segmente.
          <span className="h-1.5 w-full rounded-[8px] bg-track" />
        ) : (
          <>
            {savedHeight > 0 && (
              <span
                className={cn(
                  "w-full animate-grow-up",
                  current ? "bg-primary" : "bg-primary-light",
                )}
                style={{
                  height: savedHeight,
                  borderRadius: wastedHeight > 0 ? "8px 8px 0 0" : "8px",
                  transformOrigin: "bottom",
                  animationDelay: `${delayMs}ms`,
                }}
              />
            )}
            {wastedHeight > 0 && (
              <span
                className="w-full animate-grow-up bg-danger"
                style={{
                  height: wastedHeight,
                  borderRadius: savedHeight > 0 ? "0 0 8px 8px" : "8px",
                  transformOrigin: "top",
                  animationDelay: `${delayMs}ms`,
                }}
              />
            )}
          </>
        )}
      </div>
      <span
        className={cn(
          "font-mono text-[9.5px] leading-none",
          current ? "font-bold text-foreground" : "font-medium text-faint",
        )}
      >
        {week.label}
      </span>
    </div>
  );
}
