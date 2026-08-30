import "server-only";

/**
 * Eine Bremse fuer Passwort-Raten.
 *
 * `/api/account/email` und `/api/account/password` pruefen das aktuelle
 * Passwort selbst, indem sie `auth.api.*` direkt aufrufen. Das umgeht
 * better-auths eigenen Zaehler -- der haengt am HTTP-Router, nicht an den
 * Endpunkten. Ohne diese Bremse koennte jemand, der ein kurz unbeaufsichtigtes
 * Telefon in der Hand hat, das Passwort in Ruhe durchprobieren; genau davor
 * sollte die Passwortabfrage schuetzen.
 *
 * Im Speicher und pro Prozess -- dieselbe Bauart wie better-auths
 * Voreinstellung, und die App laeuft als ein einzelner Container. Ein
 * Neustart setzt die Zaehler zurueck; das ist der Preis dafuer, keine Tabelle
 * dafuer anzulegen.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

/** True, wenn fuer diesen Schluessel gerade zu viele Fehlversuche zaehlen. */
export function isLockedOut(key: string): boolean {
  const recent = (attempts.get(key) ?? []).filter(
    (at) => Date.now() - at < WINDOW_MS,
  );

  if (recent.length === 0) {
    attempts.delete(key);
    return false;
  }

  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const recent = (attempts.get(key) ?? []).filter(
    (at) => Date.now() - at < WINDOW_MS,
  );
  recent.push(Date.now());
  attempts.set(key, recent);
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

export const LOCKED_OUT_MESSAGE =
  "Zu viele Versuche. Bitte in ein paar Minuten noch einmal versuchen";
