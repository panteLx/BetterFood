import { formatShort } from "@/lib/expiry";

/**
 * "vor 3 Stunden" -- fuer die letzte Aktivitaet einer Anmeldung.
 *
 * Dieselbe Idee wie expiryLabel(): nah dran zaehlt die Minute, weiter weg nur
 * noch die Groessenordnung, und ab einer Woche sagt ein Datum mehr als eine
 * Zahl ("vor 23 Tagen" muss man erst umrechnen, "07.08.2026" nicht).
 *
 * `now` ist ein Parameter und kein new Date() im Modul: ein unstabiler Wert
 * bricht in dieser Next-Version den Prerender ab. Der Aufrufer holt sich die
 * Zeit hinter useIsClient().
 */
export function formatRelativePast(date: Date, now: Date): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  // Uhren gehen auseinander -- Server und Telefon liegen gern ein paar
  // Sekunden vor. "in 4 Sekunden" waere fuer eine vergangene Aktivitaet die
  // schlechtere Antwort als "gerade eben".
  if (seconds < 60) return "gerade eben";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "vor einer Minute" : `vor ${minutes} Minuten`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "vor einer Stunde" : `vor ${hours} Stunden`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;

  return formatShort(date);
}
