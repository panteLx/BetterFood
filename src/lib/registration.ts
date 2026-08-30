import { connection } from "next/server";

/**
 * Darf sich hier gerade jemand mit E-Mail und Passwort registrieren?
 *
 * Eine Instanz dieser App gehoert einem Haushalt, nicht dem Internet. Ohne
 * diesen Schalter konnte jeder, der die Adresse kennt, ein Konto anlegen --
 * und ein solches Konto ist kein Zaungast: es kommt an die Nutzersuche, an
 * die Mitgliederlisten und an den Rechnungsimport.
 *
 * Bewusst offen als Voreinstellung: der allererste Start braucht sie, sonst
 * gaebe es kein einziges Konto. Wer alle Haushaltsmitglieder angelegt hat,
 * setzt ALLOW_REGISTRATION=false und startet den Container neu.
 *
 * Und bewusst eine Funktion, kein Modulwert -- gleiche Ueberlegung wie in
 * lib/oidc.ts: gelesen wird im laufenden Container, nicht in dem Prozess,
 * der irgendwann das Image gebaut hat.
 */
export function isRegistrationOpen(): boolean {
  return process.env.ALLOW_REGISTRATION !== "false";
}

/**
 * Dieselbe Frage fuer die Anmeldeseiten.
 *
 * `connection()` nimmt die Auswertung aus dem Prerender heraus -- ohne sie
 * stuende hier die Umgebung des Builds, und ein Image, das mit offener
 * Registrierung gebaut wurde, zeigte den Link auch dann noch, wenn der
 * Container sie zugesperrt bekommt.
 */
export async function getRegistrationOpen(): Promise<boolean> {
  await connection();
  return isRegistrationOpen();
}
