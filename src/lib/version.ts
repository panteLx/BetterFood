/**
 * Woher die Zeile ganz unten auf der Einstellungsseite ihre Angabe nimmt.
 *
 * Drei Werte, alle zur Bauzeit festgeschrieben: next.config.ts reicht sie
 * über `env` als Literale in Server- und Client-Bundle. Zur Laufzeit wäre
 * hier nichts zu holen -- im Browser gibt es kein process.env, und im
 * Container gebaut wird in einer anderen Stufe als gestartet.
 *
 * - APP_VERSION und REPOSITORY_URL stammen aus package.json.
 * - COMMIT_SHA setzt nur der Container-Build, und nur wenn kein Tag gebaut
 *   wird (.github/workflows/container.yml).
 *
 * Genau daran hängt die Unterscheidung. Liegt ein Commit vor, ist das Image
 * ein Zwischenstand und heißt "dev (9312a14)"; fehlt er, wurde es aus einem
 * Tag gebaut und heißt "v1.0.0". Das ist der einzige Unterschied, der beim
 * Melden eines Fehlers zählt: "v1.0.0" gibt es genau einmal, einen Branch
 * gibt es in beliebig vielen Ständen -- ohne den Commit ist die Angabe
 * wertlos.
 *
 * Ein lokaler `npm run dev` fällt damit auf die package.json-Version zurück,
 * auch wenn der Arbeitsstand längst weiter ist. Das ist so gewollt: die
 * Anzeige beantwortet "welches Image läuft hier", und lokal weiß das ohnehin
 * nur `git status`.
 */
const repository = process.env.REPOSITORY_URL;
const commitSha = process.env.COMMIT_SHA;
const version = process.env.APP_VERSION;

/**
 * Beschriftung und Ziel in einem Objekt, weil sie eine einzige Entscheidung
 * sind. Als zwei Konstanten mit je eigenem Ternär hätte nichts verhindert,
 * dass die Beschriftung "dev" sagt und der Link auf ein Release zeigt.
 */
export const VERSION = commitSha
  ? {
      label: `dev (${commitSha.slice(0, 7)})`,
      href: `${repository}/commit/${commitSha}`,
    }
  : {
      label: `v${version}`,
      href: `${repository}/releases/tag/v${version}`,
    };
