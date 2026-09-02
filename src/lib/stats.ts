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
 *
 * Die Auswertung läuft in zwei Stufen. `summarizeArchive` geht das Archiv
 * genau einmal durch und legt die Zwischensummen ab; `computeArchiveStats`
 * und `computeBadges` rechnen nur noch daraus. Vorher hatte jede der beiden
 * ihren eigenen Durchlauf mit denselben Regeln -- die Startseite las das
 * Archiv damit zweimal, und schlimmer: Monatsquote und Abzeichen
 * "Monatsziel erreicht" leiteten dieselbe Zahl an zwei Stellen her und
 * konnten auseinanderlaufen.
 */

import { addDays, daysUntil, startOfDay } from "@/lib/expiry";

export type ResolvedEntry = {
  status: "active" | "used" | "thrown_away";
  quantity: number;
  resolvedAt: Date | null;
  /** categories.key des Artikels — die Brücke zu den Schätzwerten. */
  category: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Montag 00:00 der Woche, in der `date` liegt. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sonntag. In Deutschland beginnt die Woche am Montag.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** ISO-8601-Kalenderwoche -- die Beschriftung der Balken im Archiv. */
function isoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Auf den Donnerstag derselben Woche schieben: die ISO-Woche gehoert zu dem
  // Jahr, in dem ihr Donnerstag liegt.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / WEEK_MS);
}

/**
 * Alles, was Quote, Serien und Abzeichen aus dem Archiv brauchen -- in einem
 * Durchlauf.
 *
 * Die Tages- und Wochen-Eimer entstehen gemeinsam, weil sie dieselbe Frage an
 * dieselben Zeilen stellen und nur die Körnung unterscheidet. Gezählt wird
 * für die Serien nur, was der Nutzer auch belegen kann: ohne einen einzigen
 * abgehakten Artikel gab es keine Woche ohne Verschwendung, sondern gar keine
 * Nutzung -- "52 Wochen ohne Verschwendung" auf einem leeren Archiv war
 * schlicht falsch.
 */
export type ArchiveSummary = {
  /** Der Stichtag, mit dem zusammengefasst wurde. */
  now: Date;
  /** Dessen Mitternacht -- die Serien und die Jahresmarke rechnen darauf. */
  today: Date;
  savedThisMonth: number;
  wastedThisMonth: number;
  /** null, solange in diesem Monat nichts abgehakt wurde. */
  quota: number | null;
  /** Mitternachten mit mindestens einem weggeworfenen Artikel. */
  wastedDays: Set<number>;
  /** Wochenanfänge mit mindestens einem weggeworfenen Artikel. */
  wastedWeeks: Set<number>;
  /** Der früheste Tag bzw. die früheste Woche mit irgendeiner Aktivität. */
  firstDay: number | null;
  firstWeek: number | null;
  /** Der erste überhaupt aufgebrauchte Artikel. */
  firstSave: Date | null;
  /**
   * Alle aufgebrauchten Artikel, aufsteigend nach Zeitpunkt. Die
   * Mengenschwellen (50, 100) brauchen den Moment, in dem die Summe die Marke
   * überschritten hat, nicht nur die Endsumme.
   */
  saves: { at: Date; quantity: number }[];
  weeks: { label: string; saved: number; wasted: number }[];
};

export function summarizeArchive(
  entries: ResolvedEntry[],
  now: Date,
  weekCount = 8,
): ArchiveSummary {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentWeek = startOfWeek(now);

  const weekBars = Array.from({ length: weekCount }, (_, index) => {
    const start = addDays(-7 * (weekCount - 1 - index), currentWeek);
    return { start: start.getTime(), label: `KW${isoWeek(start)}`, saved: 0, wasted: 0 };
  });
  const weekIndex = new Map(weekBars.map((week, index) => [week.start, index]));

  const wastedWeeks = new Set<number>();
  const wastedDays = new Set<number>();
  const saves: { at: Date; quantity: number }[] = [];
  let firstWeek: number | null = null;
  let firstDay: number | null = null;
  let firstSave: Date | null = null;
  let savedThisMonth = 0;
  let wastedThisMonth = 0;

  for (const entry of entries) {
    if (!entry.resolvedAt) continue;
    const week = startOfWeek(entry.resolvedAt).getTime();
    const day = startOfDay(entry.resolvedAt).getTime();
    const inMonth = entry.resolvedAt >= monthStart;
    const bar = weekIndex.get(week);

    if (entry.status === "thrown_away") {
      wastedWeeks.add(week);
      wastedDays.add(day);
      if (inMonth) wastedThisMonth += entry.quantity;
      if (bar !== undefined) weekBars[bar].wasted += entry.quantity;
    } else if (entry.status === "used") {
      if (firstSave === null || entry.resolvedAt < firstSave) firstSave = entry.resolvedAt;
      if (inMonth) savedThisMonth += entry.quantity;
      if (bar !== undefined) weekBars[bar].saved += entry.quantity;
      saves.push({ at: entry.resolvedAt, quantity: entry.quantity });
    }

    if (firstWeek === null || week < firstWeek) firstWeek = week;
    if (firstDay === null || day < firstDay) firstDay = day;
  }

  saves.sort((a, b) => a.at.getTime() - b.at.getTime());

  const monthTotal = savedThisMonth + wastedThisMonth;
  return {
    now,
    today: startOfDay(now),
    savedThisMonth,
    wastedThisMonth,
    quota: monthTotal > 0 ? Math.round((savedThisMonth / monthTotal) * 100) : null,
    wastedDays,
    wastedWeeks,
    firstDay,
    firstWeek,
    firstSave,
    saves,
    weeks: weekBars.map(({ label, saved, wasted }) => ({ label, saved, wasted })),
  };
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

export function computeArchiveStats(summary: ArchiveSummary): ArchiveStats {
  const { wastedWeeks, wastedDays, firstWeek, firstDay } = summary;

  // Serien: vollständige Wochen bzw. Tage rückwärts ab heute, in denen nichts
  // weggeworfen wurde. Die laufende Woche und der heutige Tag zählen mit --
  // sie sind der Grund, heute nichts verderben zu lassen.
  let wasteFreeWeeks = 0;
  let weekCursor = startOfWeek(summary.now);
  // Deckel bei einem Jahr: alles darueber sagt dem Nutzer nichts Neues mehr.
  while (
    firstWeek !== null &&
    weekCursor.getTime() >= firstWeek &&
    wasteFreeWeeks < 52 &&
    !wastedWeeks.has(weekCursor.getTime())
  ) {
    wasteFreeWeeks += 1;
    weekCursor = addDays(-7, weekCursor);
  }

  let streakDays = 0;
  let dayCursor = summary.today;
  // Derselbe Deckel in Tagen: ein Jahr ist die Aussage, alles darüber
  // wiederholt sie nur.
  while (
    firstDay !== null &&
    dayCursor.getTime() >= firstDay &&
    streakDays < 365 &&
    !wastedDays.has(dayCursor.getTime())
  ) {
    streakDays += 1;
    dayCursor = addDays(-1, dayCursor);
  }

  return {
    savedThisMonth: summary.savedThisMonth,
    wastedThisMonth: summary.wastedThisMonth,
    quota: summary.quota,
    wasteFreeWeeks,
    streakDays,
    weeks: summary.weeks,
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

/**
 * Die acht Abzeichen -- rein aus dem Archiv gerechnet, ohne eigene Tabelle.
 *
 * Eine Zwischenstufe mit Absicht: die Anforderung "Badges/Erfolge" steht seit
 * der ersten Design-Runde, ein echtes Abzeichen-System mit Zeitstempel je
 * Nutzer kommt in einem eigenen Branch. Bis dahin liegen die Belege ohnehin
 * schon im Archiv, es hat sie nur niemand gezählt.
 */
export type BadgeId =
  | "first_save"
  | "streak_7"
  | "streak_30"
  | "monthly_goal"
  | "saved_50"
  | "saved_100"
  | "one_year";

export type Badge = {
  id: BadgeId;
  label: string;
  /** Wofür es vergeben wird -- steht in der aufgeklappten Übersicht. */
  requirement: string;
  /**
   * Wann es erreicht wurde, oder null, solange es das nicht ist. Das Datum
   * wird aus dem Archiv rekonstruiert und nicht festgehalten; es kann sich
   * deshalb ändern, wenn der Nutzer einen alten Eintrag rückgängig macht.
   */
  earnedAt: Date | null;
};

/**
 * Der Tag, an dem der erste ausreichend lange Lauf ohne Verschwendung seine
 * Länge erreicht hat -- je gesuchter Länge einer, oder null, wenn es ihn nie
 * gab.
 *
 * Bewusst der längste Lauf der Vergangenheit und nicht die laufende Serie aus
 * `streakDays`: ein Abzeichen ist eine Medaille, und eine Medaille nimmt man
 * niemandem wieder weg. Mit der laufenden Serie wäre "30 Tage Serie" am Tag
 * nach dem einen weggeworfenen Joghurt spurlos verschwunden -- der Nutzer
 * hätte den Erfolg gehabt und stünde vor einer leeren Fußzeile.
 *
 * Alle gesuchten Längen in einem Durchlauf, weil der lange Lauf denselben Weg
 * geht wie der kurze: 7 und 30 Tage getrennt zu suchen lief die Tagesfolge
 * seit der ersten Nutzung zweimal ab.
 *
 * Gerechnet wird über die Eimer zwischen der ersten Aktivität und heute; ein
 * Tag ohne jeden Eintrag zählt als sauber, genau wie in `streakDays`. Der
 * Deckel von 4000 Schritten (gut elf Jahre in Tagen) hält die Schleife auch
 * dann endlich, wenn ein von Hand gesetztes `resolved_at` weit in der
 * Vergangenheit liegt.
 */
function firstCleanRuns(
  wastedDays: Set<number>,
  firstDay: number | null,
  today: Date,
  lengths: readonly number[],
): (Date | null)[] {
  const found: (Date | null)[] = lengths.map(() => null);
  if (firstDay === null) return found;

  let cursor = new Date(firstDay);
  let run = 0;
  let open = lengths.length;
  for (let step = 0; step < 4000 && cursor.getTime() <= today.getTime(); step += 1) {
    run = wastedDays.has(cursor.getTime()) ? 0 : run + 1;
    for (let index = 0; index < lengths.length; index += 1) {
      if (found[index] === null && run >= lengths[index]) {
        found[index] = cursor;
        open -= 1;
      }
    }
    if (open === 0) return found;
    cursor = addDays(1, cursor);
  }
  return found;
}

/**
 * Welche Abzeichen erreicht sind und seit wann.
 *
 * Die Reihenfolge im Ergebnis ist die des Entwurfs (grob nach Schwierigkeit),
 * nicht die des Erreichens -- die Fußzeile der Startseite sortiert selbst
 * nach `earnedAt`, die aufgeklappte Übersicht will die feste Reihe.
 *
 * `monthlyGoal` kommt von außen, weil das Ziel eine Einstellung des Nutzers
 * ist und keine Eigenschaft des Archivs. Alles andere steht schon in der
 * Zusammenfassung -- insbesondere `quota`, damit "Monatsziel erreicht" und
 * der Ring auf der Startseite dieselbe Zahl meinen.
 */
export function computeBadges(summary: ArchiveSummary, monthlyGoal: number): Badge[] {
  const { today, firstDay, firstSave, quota, saves } = summary;

  // Beide Mengenschwellen in einem Durchlauf: es ist dieselbe Präfixsumme,
  // und 100 kommt nie vor 50.
  let sum = 0;
  let savedAt50: Date | null = null;
  let savedAt100: Date | null = null;
  for (const save of saves) {
    sum += save.quantity;
    if (savedAt50 === null && sum >= 50) savedAt50 = save.at;
    if (sum >= 100) {
      savedAt100 = save.at;
      break;
    }
  }

  const [streak7, streak30] = firstCleanRuns(summary.wastedDays, firstDay, today, [7, 30]);

  // Ein Jahr ab der ersten Aktivität, nicht ab der Registrierung: das Archiv
  // weiß nichts über das Konto, und wer die App ein Jahr lang benutzt hat,
  // hat sie an ihrem ersten Tag auch benutzt.
  const anniversary =
    firstDay !== null && daysUntil(today, new Date(firstDay)) >= 365
      ? addDays(365, new Date(firstDay))
      : null;

  return [
    {
      id: "first_save",
      label: "Erste Rettung",
      requirement: "Den ersten Artikel aufgebraucht statt weggeworfen",
      earnedAt: firstSave,
    },
    {
      id: "streak_7",
      label: "7 Tage Serie",
      requirement: "Eine Woche am Stück ohne etwas wegzuwerfen",
      earnedAt: streak7,
    },
    {
      id: "streak_30",
      label: "30 Tage Serie",
      requirement: "Einen ganzen Monat am Stück ohne Verschwendung",
      earnedAt: streak30,
    },
    {
      id: "monthly_goal",
      // Das einzige Abzeichen, das den laufenden Monat betrifft -- und damit
      // das einzige, das wieder verschwinden kann. Das ist hier richtig: das
      // Monatsziel ist eine Zwischenbilanz, kein erreichter Meilenstein.
      label: "Monatsziel erreicht",
      requirement: `In diesem Monat mindestens ${monthlyGoal} % gerettet`,
      earnedAt: quota !== null && quota >= monthlyGoal ? summary.now : null,
    },
    {
      id: "saved_50",
      label: "50 gerettet",
      requirement: "Insgesamt 50 Artikel aufgebraucht",
      earnedAt: savedAt50,
    },
    // Hier stand bis zum Test der Runde 8 ein Abzeichen "4 saubere Wochen"
    // (vier Kalenderwochen in Folge ohne Verschwendung). Formal ist das etwas
    // anderes als "30 Tage Serie" -- Wochenraster statt 30 zusammenhängender
    // Tage --, als Aussage an den Nutzer aber dasselbe, und zwei Medaillen für
    // eine Leistung entwerten beide. Die Wochen-Serie bleibt als Zahl im
    // Archiv (`wasteFreeWeeks`) erhalten, nur das Abzeichen ist weg.
    {
      id: "saved_100",
      label: "100 gerettet",
      requirement: "Insgesamt 100 Artikel aufgebraucht",
      earnedAt: savedAt100,
    },
    {
      id: "one_year",
      label: "Ein Jahr dabei",
      requirement: "Seit einem Jahr im Einsatz",
      earnedAt: anniversary,
    },
  ];
}
