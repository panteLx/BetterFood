/**
 * Woher die Zeile ganz unten auf der Einstellungsseite ihre Angabe nimmt.
 *
 * Zwei Werte, beide zur Bauzeit festgeschrieben: next.config.ts reicht sie
 * über `env` als Literale in Server- und Client-Bundle. Zur Laufzeit wäre
 * hier nichts zu holen -- im Browser gibt es kein process.env, und im
 * Container gebaut wird in einer anderen Stufe als gestartet.
 *
 * - APP_VERSION ist immer die Version aus package.json.
 * - COMMIT_SHA setzt nur der Container-Build, und nur für Pushes auf einen
 *   Branch (.github/workflows/container.yml). Ein Tag-Build lässt ihn leer.
 *
 * Genau daran hängt die Unterscheidung. Liegt ein Commit vor, ist das Image
 * ein Zwischenstand von main und heißt "dev (9312a14)"; fehlt er, wurde es
 * aus einem Tag gebaut und heißt "v1.0.0". Das ist der einzige Unterschied,
 * der beim Melden eines Fehlers zählt: "v1.0.0" gibt es genau einmal, "main"
 * gibt es in beliebig vielen Ständen -- ohne den Commit ist die Angabe
 * wertlos.
 *
 * Ein lokaler `npm run dev` fällt damit auf die package.json-Version zurück,
 * auch wenn der Arbeitsstand längst weiter ist. Das ist so gewollt: die
 * Anzeige beantwortet "welches Image läuft hier", und lokal weiß das ohnehin
 * nur `git status`.
 */
const REPOSITORY = "https://github.com/panteLx/BetterFood";

const commitSha = process.env.COMMIT_SHA;
const version = process.env.APP_VERSION;

/** "dev (9312a14)" für einen main-Build, sonst "v1.0.0". */
export const VERSION_LABEL = commitSha
  ? `dev (${commitSha.slice(0, 7)})`
  : `v${version}`;

/** Zeigt auf den gebauten Commit bzw. auf die Notizen des Releases. */
export const VERSION_HREF = commitSha
  ? `${REPOSITORY}/commit/${commitSha}`
  : `${REPOSITORY}/releases/tag/v${version}`;
