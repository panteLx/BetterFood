/**
 * Das persönliche Monatsziel: der Anteil der Artikel, den der Nutzer in
 * diesem Monat aufbrauchen statt wegwerfen will.
 *
 * Als Zeile in `settings` und nicht als Spalte an `user`: die Tabelle
 * existiert genau für diese Sorte Einstellung, trägt schon die
 * Erinnerungs-Werte, und eine weitere Spalte an der von better-auth
 * verwalteten Nutzertabelle wäre eine Migration an fremdem Besitz.
 *
 * Pro Nutzer und nicht pro Liste, weil das Ziel eine Absicht ist und keine
 * Eigenschaft des Vorrats -- wer zwei Haushalte führt, nimmt sich für beide
 * dasselbe vor.
 *
 * Diese Datei bleibt frei von Datenbankzugriffen, damit die Einstellungsseite
 * sie als Client-Komponente importieren kann; das Lesen steht in
 * data.ts (getMonthlyGoal). Dasselbe Muster wie notification-settings.ts.
 */
export const MONTHLY_GOAL_KEY = "monthly_goal";

/**
 * 90 Prozent, nicht 100: ein Ziel, das nur bei makelloser Bilanz erreichbar
 * ist, ist kein Ziel, sondern eine Bedingung -- und ein einziger verdorbener
 * Joghurt macht den ganzen Monat wertlos. 90 lässt Raum für den Alltag und
 * liegt trotzdem deutlich über dem, was ohne die App passiert.
 */
export const DEFAULT_MONTHLY_GOAL = 90;

/**
 * Feste Stufen statt eines freien Zahlenfelds. Ein Ziel ist eine Absicht,
 * keine Messung -- zwischen 87 und 88 Prozent liegt keine Entscheidung, und
 * ein Eingabefeld würde nur so tun, als gäbe es eine. 100 steht trotzdem in
 * der Reihe: dass die Voreinstellung es für unklug hält, ist kein Grund, es
 * jemandem zu verbieten, der es sich vornehmen will.
 */
export const MONTHLY_GOAL_OPTIONS = [60, 70, 80, 90, 95, 100] as const;

/**
 * Prüft einen Zielwert aus Datenbank oder Request.
 *
 * Alles außerhalb von 1..100 gilt als "nicht gesetzt" und fällt auf den
 * Standard zurück: eine von Hand verbogene Zeile darf die Fortschrittsleiste
 * nicht sprengen, und ein Ziel von 0 Prozent ist kein Ziel.
 */
export function parseMonthlyGoal(raw: unknown): number {
  const parsed = Number(raw);
  return isValidMonthlyGoal(parsed) ? Math.round(parsed) : DEFAULT_MONTHLY_GOAL;
}

/**
 * Wie parseMonthlyGoal, aber ohne Rückfallebene -- für die Eingangsprüfung der
 * API. Die Grenze steht nur hier: zwei Fassungen derselben Spanne wären zwei,
 * die auseinanderlaufen können.
 */
export function isValidMonthlyGoal(value: unknown): value is number {
  return Number.isFinite(value) && (value as number) >= 1 && (value as number) <= 100;
}
