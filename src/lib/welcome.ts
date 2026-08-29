/**
 * Merker dafuer, dass die Einfuehrung erledigt ist.
 *
 * Ein Cookie und keine localStorage-Zeile: die Entscheidung faellt im Proxy,
 * also auf dem Server, bevor ueberhaupt JavaScript laeuft. Ohne ihn wuerde
 * die Einfuehrung entweder gar nicht oder bei jedem Aufruf erscheinen.
 *
 * Gesetzt wird er nicht beim Verlassen der Einfuehrung, sondern erst mit der
 * ersten erfolgreichen Anmeldung (siehe proxy.ts). Wer die Einfuehrung
 * wegtippt und dann doch kein Konto anlegt, hat die App noch nie benutzt --
 * beim naechsten Oeffnen ist die Erklaerung genau das, was fehlt.
 */
export const WELCOME_COOKIE = "bf_welcome_seen";

/** Ein Jahr: laenger als jede Sitzung, kuerzer als "nie wieder". */
export const WELCOME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
