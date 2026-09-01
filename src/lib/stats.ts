/**
 * Die Rettungsquote, die Wochen-Historie und die Serien aus den Daten, die
 * ohnehin schon im Archiv liegen: status trennt "aufgebraucht" von
 * "weggeworfen", resolvedAt hält den Zeitpunkt fest.
 *
 * Als reine Funktionen außerhalb der Komponenten, weil Startseite und Archiv
 * dieselbe Quote zeigen und sie sich unter keinen Umständen widersprechen
 * dürfen. Der Stichtag wird immer hereingereicht: new Date() im Render einer
 * Server-Komponente ist ein "unstable value" und bricht den Prerender der
 * Route ab.
 */

export type ResolvedEntry = {
  status: "active" | "used" | "thrown_away";
  quantity: number;
  resolvedAt: Date | null;
  /** categories.key des Artikels — die Brücke zu den Schätzwerten. */
  category: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Mitternacht des Tages, in dem `date` liegt. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Montag 00:00 der Woche, in der `date` liegt. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sonntag. In Deutschland beginnt die Woche am Montag.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * `delta` Tage weiter, über den Kalender statt über Millisekunden.
 *
 * Der Unterschied ist zweimal im Jahr entscheidend: eine Sommerzeit-Umstellung
 * macht einen Tag 23 oder 25 Stunden lang. Wer stattdessen 86_400_000 ms
 * abzieht, landet hinter der Umstellung auf 23:00 des Vortages — und diese
 * Zahl trifft keinen der über startOfDay()/startOfWeek() gebildeten Schlüssel
 * mehr. Die Serie unten würde eine Woche mit Verschwendung schlicht
 * überspringen und weiterzählen. setDate() behält die Uhrzeit bei und trifft
 * wieder exakt Mitternacht.
 */
function shiftDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
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
  /** Aufeinanderfolgende Tage bis heute, an denen nichts weggeworfen wurde. */
  streakDays: number;
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

  // Serien: vollständige Wochen bzw. Tage rückwärts ab heute, in denen nichts
  // weggeworfen wurde. Die laufende Woche und der heutige Tag zählen mit --
  // sie sind der Grund, heute nichts verderben zu lassen.
  //
  // Beide Eimer entstehen in demselben Durchlauf, weil sie dieselbe Frage an
  // dieselben Zeilen stellen und nur die Körnung unterscheidet.
  const wastedWeeks = new Set<number>();
  const wastedDays = new Set<number>();
  let firstWeek: number | null = null;
  let firstDay: number | null = null;
  for (const entry of entries) {
    if (!entry.resolvedAt) continue;
    const week = startOfWeek(entry.resolvedAt).getTime();
    const day = startOfDay(entry.resolvedAt).getTime();
    if (entry.status === "thrown_away") {
      wastedWeeks.add(week);
      wastedDays.add(day);
    }
    // Gezählt wird nur, was der Nutzer auch belegen kann: ohne einen einzigen
    // abgehakten Artikel gab es keine Woche ohne Verschwendung, sondern gar
    // keine Nutzung -- "52 Wochen ohne Verschwendung" auf einem leeren Archiv
    // war schlicht falsch. Für die Tagesserie gilt dasselbe.
    if (firstWeek === null || week < firstWeek) firstWeek = week;
    if (firstDay === null || day < firstDay) firstDay = day;
  }

  let wasteFreeWeeks = 0;
  let weekCursor = startOfWeek(now);
  // Deckel bei einem Jahr: alles darueber sagt dem Nutzer nichts Neues mehr.
  while (
    firstWeek !== null &&
    weekCursor.getTime() >= firstWeek &&
    wasteFreeWeeks < 52 &&
    !wastedWeeks.has(weekCursor.getTime())
  ) {
    wasteFreeWeeks += 1;
    weekCursor = shiftDays(weekCursor, -7);
  }

  let streakDays = 0;
  let dayCursor = startOfDay(now);
  // Derselbe Deckel in Tagen: ein Jahr ist die Aussage, alles darüber
  // wiederholt sie nur.
  while (
    firstDay !== null &&
    dayCursor.getTime() >= firstDay &&
    streakDays < 365 &&
    !wastedDays.has(dayCursor.getTime())
  ) {
    streakDays += 1;
    dayCursor = shiftDays(dayCursor, -1);
  }

  const currentWeek = startOfWeek(now);
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const start = shiftDays(currentWeek, -7 * (weekCount - 1 - index));
    return {
      start: start.getTime(),
      label: `KW${isoWeek(start)}`,
      saved: 0,
      wasted: 0,
    };
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
    streakDays,
    weeks: weeks.map(({ label, saved, wasted }) => ({ label, saved, wasted })),
  };
}

/** Was ein durchschnittlicher Artikel einer Kategorie wert ist. */
export type CategoryEstimate = {
  priceCents: number | null;
  co2Grams: number | null;
};

export type Savings = {
  moneySavedCents: number;
  co2SavedGrams: number;
};

/**
 * Was im laufenden Monat an Geld und Treibhausgas nicht im Müll gelandet ist.
 *
 * Bewusst eine eigene Funktion neben computeArchiveStats und kein weiteres
 * Feld darin: die Quote, die Wochenbalken und die Serien brauchen nur das
 * Archiv, diese beiden Zahlen zusätzlich die Schätzwerte der Kategorien. Als
 * optionaler Parameter an computeArchiveStats müsste jeder Aufrufer, der sie
 * nicht hat, eine leere Tabelle übergeben und bekäme lautlos 0,00 EUR
 * zurückgemeldet -- eine Null, die "keine Daten" heißt, aber wie "nichts
 * gespart" aussieht. Getrennt kann ein Aufrufer die Zahlen gar nicht erst
 * versehentlich anzeigen.
 *
 * Übersprungen wird, was keinen Wert hat: eine Kategorie ohne Schätzung
 * (Sonstiges, alles selbst Angelegte) trägt nichts bei, statt mit 0 zu
 * verwässern. Preis und CO2 werden dabei einzeln geprüft -- eine Kategorie
 * darf einen Preis haben und keinen CO2-Wert.
 */
export function computeSavings(
  entries: ResolvedEntry[],
  now: Date,
  estimates: Map<string, CategoryEstimate>,
): Savings {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let moneySavedCents = 0;
  let co2SavedGrams = 0;
  for (const entry of entries) {
    if (entry.status !== "used") continue;
    if (!entry.resolvedAt || entry.resolvedAt < monthStart) continue;
    const estimate = estimates.get(entry.category);
    if (!estimate) continue;
    if (estimate.priceCents !== null) moneySavedCents += estimate.priceCents * entry.quantity;
    if (estimate.co2Grams !== null) co2SavedGrams += estimate.co2Grams * entry.quantity;
  }

  return { moneySavedCents, co2SavedGrams };
}
