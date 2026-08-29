/**
 * Die Rettungsquote und die Wochen-Historie aus den Daten, die ohnehin schon
 * im Archiv liegen: status trennt "aufgebraucht" von "weggeworfen",
 * resolvedAt haelt den Zeitpunkt fest.
 *
 * Als reine Funktionen ausserhalb der Komponenten, weil Startseite und Archiv
 * dieselbe Quote zeigen und sie sich unter keinen Umstaenden widersprechen
 * duerfen. Der Stichtag wird immer hereingereicht: new Date() im Render einer
 * Server-Komponente ist ein "unstable value" und bricht den Prerender der
 * Route ab.
 */

export type ResolvedEntry = {
  status: "active" | "used" | "thrown_away";
  quantity: number;
  resolvedAt: Date | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Montag 00:00 der Woche, in der `date` liegt. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sonntag. In Deutschland beginnt die Woche am Montag.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** ISO-8601-Kalenderwoche -- die Beschriftung der Balken im Archiv. */
export function isoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Auf den Donnerstag derselben Woche schieben: die ISO-Woche gehoert zu dem
  // Jahr, in dem ihr Donnerstag liegt.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / WEEK_MS);
}

export type ArchiveStats = {
  savedThisMonth: number;
  wastedThisMonth: number;
  /** null, solange in diesem Monat nichts abgehakt wurde. */
  quota: number | null;
  wasteFreeWeeks: number;
  weeks: { label: string; saved: number; wasted: number }[];
};

export function computeArchiveStats(
  entries: ResolvedEntry[],
  now: Date,
  weekCount = 8,
): ArchiveStats {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let savedThisMonth = 0;
  let wastedThisMonth = 0;
  for (const entry of entries) {
    if (!entry.resolvedAt || entry.resolvedAt < monthStart) continue;
    if (entry.status === "used") savedThisMonth += entry.quantity;
    else if (entry.status === "thrown_away") wastedThisMonth += entry.quantity;
  }

  const total = savedThisMonth + wastedThisMonth;
  const quota = total > 0 ? Math.round((savedThisMonth / total) * 100) : null;

  // Serie: vollstaendige Wochen rueckwaerts ab der laufenden Woche, in denen
  // nichts weggeworfen wurde. Die laufende Woche zaehlt mit -- sie ist der
  // Grund, heute nichts verderben zu lassen.
  const wastedWeeks = new Set<number>();
  let firstActivity: number | null = null;
  for (const entry of entries) {
    if (!entry.resolvedAt) continue;
    const week = startOfWeek(entry.resolvedAt).getTime();
    if (entry.status === "thrown_away") wastedWeeks.add(week);
    // Gezaehlt wird nur, was der Nutzer auch belegen kann: ohne einen einzigen
    // abgehakten Artikel gab es keine Woche ohne Verschwendung, sondern gar
    // keine Nutzung -- "52 Wochen ohne Verschwendung" auf einem leeren Archiv
    // war schlicht falsch.
    if (firstActivity === null || week < firstActivity) firstActivity = week;
  }

  let wasteFreeWeeks = 0;
  let cursor = startOfWeek(now).getTime();
  // Deckel bei einem Jahr: alles darueber sagt dem Nutzer nichts Neues mehr.
  while (
    firstActivity !== null &&
    cursor >= firstActivity &&
    wasteFreeWeeks < 52 &&
    !wastedWeeks.has(cursor)
  ) {
    wasteFreeWeeks += 1;
    cursor -= WEEK_MS;
  }

  const currentWeek = startOfWeek(now).getTime();
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const start = currentWeek - (weekCount - 1 - index) * WEEK_MS;
    return { start, label: `KW${isoWeek(new Date(start))}`, saved: 0, wasted: 0 };
  });
  const weekIndex = new Map(weeks.map((week, index) => [week.start, index]));

  for (const entry of entries) {
    if (!entry.resolvedAt) continue;
    const index = weekIndex.get(startOfWeek(entry.resolvedAt).getTime());
    if (index === undefined) continue;
    if (entry.status === "used") weeks[index].saved += entry.quantity;
    else if (entry.status === "thrown_away") weeks[index].wasted += entry.quantity;
  }

  return {
    savedThisMonth,
    wastedThisMonth,
    quota,
    wasteFreeWeeks,
    weeks: weeks.map(({ label, saved, wasted }) => ({ label, saved, wasted })),
  };
}
