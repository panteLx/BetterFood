/**
 * Die drei Ablauf-Zustände und ihre Beschriftung -- an einer Stelle, weil
 * Startseite, Vorrat, Produktdetail und Formular exakt dieselbe Einteilung
 * zeigen müssen. Vorher rechnete jede Ansicht für sich, mit leicht
 * abweichenden Grenzen und Texten.
 */

// Ab hier gilt ein Artikel als dringend und wird kategorieübergreifend nach
// ganz oben gezogen -- die Frage beim Öffnen der App ist "was muss ich heute
// aufbrauchen?", nicht "was habe ich an Milchprodukten?".
export const URGENT_WITHIN_DAYS = 3;

export type ExpiryStatus = "fresh" | "soon" | "expired";

export function daysUntil(date: Date, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function expiryStatus(days: number): ExpiryStatus {
  if (days < 0) return "expired";
  if (days <= URGENT_WITHIN_DAYS) return "soon";
  return "fresh";
}

/**
 * Tailwind-Klassen je Zustand. Als Tabelle statt als String-Bau, damit der
 * Tailwind-Scanner alle Klassen tatsächlich findet.
 */
export const STATUS_CLASSES: Record<
  ExpiryStatus,
  { text: string; tint: string; border: string; chip: string; dot: string }
> = {
  fresh: {
    text: "text-primary",
    tint: "bg-primary-tint",
    border: "border-l-primary",
    chip: "bg-primary-tint text-primary",
    dot: "bg-primary",
  },
  soon: {
    text: "text-warning",
    tint: "bg-warning-tint",
    border: "border-l-warning",
    chip: "bg-warning-tint text-warning",
    dot: "bg-warning",
  },
  expired: {
    text: "text-danger",
    tint: "bg-danger-tint",
    border: "border-l-danger",
    chip: "bg-danger-tint text-danger",
    dot: "bg-danger",
  },
};

const mediumFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const longFormat = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const shortFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const formatMedium = (date: Date) => mediumFormat.format(date);
export const formatLong = (date: Date) => longFormat.format(date);
export const formatShort = (date: Date) => shortFormat.format(date);

/**
 * Kurzform für die Statuspille an jedem Artikel. Nah am Ablauf zählt der
 * einzelne Tag, weiter weg nur noch die Größenordnung -- "In 37 Tagen"
 * sagt niemandem etwas, "In 5 Wochen" schon.
 */
export function expiryLabel(days: number, expiryDate?: Date): string {
  if (days < 0) {
    return days === -1 ? "Gestern abgelaufen" : `Vor ${-days} Tagen abgelaufen`;
  }
  if (days === 0) return "Heute";
  if (days === 1) return "Morgen";
  if (days <= 13) return `In ${days} Tagen`;
  if (days <= 60) return `In ${Math.round(days / 7)} Wochen`;
  return expiryDate ? formatMedium(expiryDate) : `In ${Math.round(days / 30)} Monaten`;
}

/**
 * Der Tage-Block links an jeder Vorratszeile: eine große Zahl, darunter das
 * Wort.
 *
 * Eine eigene Regel neben expiryLabel, weil der Block etwas anderes leistet
 * als die Pille. expiryLabel schreibt einen Satz ("Vor 3 Tagen abgelaufen",
 * "In 5 Wochen") und rundet weiter entfernte Daten bewusst auf
 * Größenordnungen. Der Block zählt Tage, immer, und muss dabei in 44px
 * passen -- er kann keinen Satz tragen und will auch keinen: nebeneinander
 * gestapelt sind es die Zahlen, die die Reihenfolge lesbar machen.
 *
 * Abgelaufenes trägt ein echtes Minuszeichen (U+2212) und keinen
 * Bindestrich: der Bindestrich sitzt in dieser Schrift tiefer und schmaler
 * als die Ziffern daneben und liest sich als Trennstrich.
 */
export function expiryDayBlock(days: number): { value: string; label: string } {
  if (days < 0) {
    const overdue = -days;
    return { value: `\u2212${overdue}`, label: overdue === 1 ? "Tag" : "Tage" };
  }
  // "0 Tage" und nicht "0 Tag": im Deutschen steht die Null im Plural.
  return { value: String(days), label: days === 1 ? "Tag" : "Tage" };
}

/**
 * Die Ablauf-Eimer, nach denen Startseite und Vorrat gliedern.
 *
 * Feiner als die drei Zustände von expiryStatus, weil eine Liste eine
 * Reihenfolge braucht und keine Ampel: "heute" und "in drei Tagen" sind
 * beide "soon", aber nur eins davon ist heute Abend ein Problem. Die
 * Obergrenze der Woche liegt bei 7 Tagen, weil darüber hinaus kein Einkauf
 * mehr geplant wird.
 *
 * Hier und nicht in einer der beiden Ansichten: läge die Tabelle in einer
 * von ihnen, müsste die andere aus ihr importieren -- und beide zeigen
 * dieselbe Gliederung, die sich unter keinen Umständen auseinander
 * entwickeln darf.
 */
export const EXPIRY_BUCKETS = [
  { title: "Abgelaufen", danger: true, test: (days: number) => days < 0 },
  { title: "Heute", danger: false, test: (days: number) => days === 0 },
  { title: "Morgen", danger: false, test: (days: number) => days === 1 },
  {
    title: "Diese Woche",
    danger: false,
    test: (days: number) => days >= 2 && days <= 7,
  },
  { title: "Später", danger: false, test: (days: number) => days > 7 },
] as const;

export function addDays(days: number, from: Date = new Date()): Date {
  const result = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/** yyyy-mm-dd in lokaler Zeit -- toISOString() wäre je nach Zone einen Tag daneben. */
export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Gegenstück zu toDateInputValue: "2026-08-29" als lokale Mitternacht. */
export function fromDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}
