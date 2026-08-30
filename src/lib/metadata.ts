/**
 * Der Name der App an einer Stelle.
 *
 * Vorher standen drei verschiedene im Umlauf: die Oberflaeche sagte
 * "BetterFood", das Manifest "Lebensmittel-Tracker", der Browser-Tab
 * "Vorrat". Wer die App installiert, soll auf dem Home-Bildschirm dasselbe
 * Wort lesen wie auf dem Splash.
 *
 * Das Manifest (`public/manifest.json`) traegt dieselben Werte noch einmal --
 * es ist statisches JSON und kann hier nichts importieren; wer hier etwas
 * aendert, aendert es dort mit.
 */
export const APP_NAME = "BetterFood";
export const APP_TITLE = "BetterFood – Vorrat im Blick";
export const APP_DESCRIPTION =
  "Behalte im Blick, was in Kühlschrank, Gefrierfach und Schrank liegt – und werde rechtzeitig erinnert, bevor etwas abläuft.";

/**
 * "Vorrat · BetterFood" -- die Vorlage fuer jede Unterseite, die ihren
 * eigenen Titel setzt.
 *
 * Sie muss ueberall dort wiederholt werden, wo ein Layout selbst einen Titel
 * setzt und darunter noch Seiten liegen: sobald ein Segment `title` als
 * blossen String setzt, gilt die Vorlage des Elternteils fuer dessen Kinder
 * nicht mehr weiter. Genau daran hing /settings/darunter kurzzeitig ohne
 * Namenszusatz ("Erinnerungen" statt "Erinnerungen · BetterFood").
 */
export const TITLE_TEMPLATE = `%s · ${APP_NAME}`;
