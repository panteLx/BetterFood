/**
 * Deutsche Texte fuer die better-auth-Fehler, die wir selbst ausloesen
 * koennen.
 *
 * Name und Passwort gehen ueber authClient direkt an /api/auth/*, nicht durch
 * eine eigene Route -- das ist Absicht, denn nur so schreibt better-auth das
 * Sitzungs-Cookie gleich mit neu. Der Preis dafuer ist, dass die Fehlertexte
 * aus der Bibliothek kommen und englisch sind ("Invalid password"). Hier
 * werden sie uebersetzt, statt an jeder Aufrufstelle neu geraten zu werden.
 *
 * Codes, die wir nicht kennen, bekommen den Fallback des Aufrufers: eine
 * halbe Uebersetzung waere schlimmer als ein ehrlicher Sammelsatz.
 */
const MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "Das aktuelle Passwort ist nicht korrekt.",
  PASSWORD_TOO_SHORT: "Das neue Passwort braucht mindestens 8 Zeichen.",
  PASSWORD_TOO_LONG: "Das neue Passwort ist zu lang.",
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    "Für dieses Konto gibt es kein Passwort, das sich ändern ließe.",
  EMAIL_CAN_NOT_BE_UPDATED: "Die E-Mail-Adresse lässt sich hier nicht ändern.",
  USER_ALREADY_EXISTS: "Diese E-Mail-Adresse ist bereits vergeben.",
  SESSION_EXPIRED: "Bitte melde dich neu an und versuche es noch einmal.",
  SESSION_NOT_FRESH: "Bitte melde dich neu an und versuche es noch einmal.",
};

export function authErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  const known = error?.code ? MESSAGES[error.code] : undefined;
  return known ?? fallback;
}
