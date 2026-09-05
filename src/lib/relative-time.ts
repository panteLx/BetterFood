import { formatShort } from "@/lib/expiry";

/**
 * "vor 3 Stunden" -- für die letzte Aktivitaet einer Anmeldung.
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
  // Sekunden vor. "in 4 Sekunden" wäre für eine vergangene Aktivitaet die
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

/**
 * "in 12 Minuten" -- für eine Sperre, die von selbst wieder aufgeht.
 *
 * Das Gegenstück zu formatRelativePast, und bewusst gerundet statt auf die
 * Sekunde genau: Wer liest, dass er in 12 Minuten wieder darf, wartet nicht
 * mit der Stoppuhr daneben. Aufgerundet, damit die Zusage hält -- "in einer
 * Minute" und dann doch noch 50 Sekunden Sperre wäre ein zweiter Fehlversuch.
 *
 * `now` ist wie oben ein Parameter: ein new Date() im Modul bräche den
 * Prerender.
 */
export function formatRelativeFuture(date: Date, now: Date): string {
  const seconds = Math.ceil((date.getTime() - now.getTime()) / 1000);
  if (seconds <= 60) return "gleich";

  // Ohne Singular-Zweig, und das ist kein Versehen: Die Zeile darüber fängt
  // alles bis einschließlich 60 Sekunden mit "gleich" ab, aufgerundet ist der
  // kleinste Wert, der hier ankommt, damit 2.
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes} Minuten`;

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "in einer Stunde" : `in ${hours} Stunden`;
  }

  // Der Tagesfall ist erreichbar: Wer die 20 Vorschläge eines Tages in kurzer
  // Zeit über die Bestätigung verbraucht, bekommt einen freien Platz erst gut
  // 24 Stunden später zurück -- und "in 1 Tagen" stand dann eine Weile da.
  const days = Math.ceil(hours / 24);
  return days === 1 ? "in einem Tag" : `in ${days} Tagen`;
}
