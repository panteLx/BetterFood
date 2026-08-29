/**
 * Merker dafuer, dass die Einfuehrung gezeigt wurde.
 *
 * Ein Cookie und keine localStorage-Zeile: die Entscheidung faellt im Proxy,
 * also auf dem Server, bevor ueberhaupt JavaScript laeuft. Ohne ihn wuerde
 * die Einfuehrung entweder gar nicht oder bei jedem Aufruf erscheinen.
 */
export const WELCOME_COOKIE = "bf_welcome_seen";
