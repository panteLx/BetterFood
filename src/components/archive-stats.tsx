"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/card";
import type { Item } from "@/db/schema";

// Kein Abonnement noetig: der Stichtag aendert sich innerhalb einer Sitzung
// praktisch nicht, und ein Datumswechsel um Mitternacht rechtfertigt kein
// Polling.
const noopSubscribe = () => () => {};

// getSnapshot MUSS bei gleichem Zustand denselben Wert liefern, sonst rendert
// React endlos. Deshalb liefert der Store nur dieses stabile Flag, und
// gerechnet wird danach in einem useMemo.
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Montag 00:00 der Woche, in der `date` liegt. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sonntag. In Deutschland beginnt die Woche am Montag.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

type Stats = {
  savedThisMonth: number;
  wastedThisMonth: number;
  quota: number | null;
  wasteFreeWeeks: number;
};

function computeStats(items: Item[], now: Date): Stats {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let savedThisMonth = 0;
  let wastedThisMonth = 0;
  for (const item of items) {
    if (!item.resolvedAt || item.resolvedAt < monthStart) continue;
    if (item.status === "used") savedThisMonth += item.quantity;
    else if (item.status === "thrown_away") wastedThisMonth += item.quantity;
  }

  const total = savedThisMonth + wastedThisMonth;
  const quota = total > 0 ? Math.round((savedThisMonth / total) * 100) : null;

  // Serie: vollstaendige Wochen rueckwaerts ab der laufenden Woche, in denen
  // nichts weggeworfen wurde. Die laufende Woche zaehlt mit -- sie ist der
  // Grund, heute nichts verderben zu lassen.
  const wastedWeeks = new Set<number>();
  for (const item of items) {
    if (item.status !== "thrown_away" || !item.resolvedAt) continue;
    wastedWeeks.add(startOfWeek(item.resolvedAt).getTime());
  }

  let wasteFreeWeeks = 0;
  let cursor = startOfWeek(now).getTime();
  // Deckel bei einem Jahr: alles darueber sagt dem Nutzer nichts Neues mehr.
  while (wasteFreeWeeks < 52 && !wastedWeeks.has(cursor)) {
    wasteFreeWeeks += 1;
    cursor -= WEEK_MS;
  }

  return { savedThisMonth, wastedThisMonth, quota, wasteFreeWeeks };
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

/**
 * Die Rettungsquote aus den Daten, die ohnehin schon im Archiv liegen.
 *
 * items.status trennt bereits "aufgebraucht" von "weggeworfen" und resolvedAt
 * haelt den Zeitpunkt fest -- angezeigt wurde davon bisher nichts. Damit fehlte
 * der App der einzige Grund, sie zu oeffnen, ohne dass gerade etwas ablaeuft.
 *
 * Gerechnet wird im Client aus den bereits geladenen Artikeln: kein
 * zusaetzlicher Datenbankzugriff, und new Date() bleibt aus dem Server-Render
 * heraus (das wuerde den Prerender der Route abbrechen).
 */
export function ArchiveStats({ items }: { items: Item[] }) {
  // new Date() darf nicht in den Server-Render: ein solcher "unstable value"
  // bricht den Prerender der Route ab. Ueber das Flag laeuft die Rechnung
  // ausschliesslich im Client.
  const isClient = useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  const stats = useMemo<Stats | null>(
    () => (isClient ? computeStats(items, new Date()) : null),
    [isClient, items],
  );

  if (!stats) return null;

  const { savedThisMonth, wastedThisMonth, quota, wasteFreeWeeks } = stats;

  return (
    <Card className="mx-4 gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Diesen Monat</p>
        {quota !== null && (
          <p className="text-2xl font-semibold tabular-nums">{quota}%</p>
        )}
      </div>

      {quota === null ? (
        <p className="text-sm text-muted-foreground">
          Noch nichts abgehakt. Sobald du Artikel als aufgebraucht markierst, siehst du hier
          deine Quote.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-green-600 tabular-nums">{savedThisMonth}</span>{" "}
              gerettet
            </span>
            <span>
              <span className="font-medium text-destructive tabular-nums">
                {wastedThisMonth}
              </span>{" "}
              weggeworfen
            </span>
          </div>
          {/* Der Balken macht den Unterschied auf einen Blick lesbar -- die
              Zahl allein sagt wenig, wenn man sie nicht vergleicht. */}
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${quota} Prozent gerettet`}
          >
            <div className="bg-green-600" style={{ width: `${quota}%` }} />
            <div className="flex-1 bg-destructive" />
          </div>
        </>
      )}

      {wasteFreeWeeks > 0 && (
        <p className="text-sm">
          <span className="font-medium tabular-nums">{wasteFreeWeeks}</span>{" "}
          {plural(wasteFreeWeeks, "Woche", "Wochen")} ohne Verschwendung
          {wasteFreeWeeks >= 52 && "+"}
        </p>
      )}
    </Card>
  );
}
