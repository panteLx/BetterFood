/**
 * Die reine Datenhälfte des Rezept-Features: Formen und Grenzen, kein Zugriff
 * auf Datenbank oder Netz.
 *
 * Getrennt von index.ts, weil das dort stehende `import "server-only"` sonst
 * jeden Leser mit in den Serverraum zöge -- und drei davon stehen im Browser:
 * die Karte (components/recipe-suggestions.tsx), die Demo (lib/demo-data.ts)
 * und alles, was von dort weiterreicht. Ein Typ-Import wäre unbedenklich, ein
 * Wert-Import nicht, und die Demo braucht die Grenzen als echte Zahlen.
 * Dieselbe Aufteilung wie bei lib/receipt/types.ts neben lib/receipt/parse.ts.
 */

/**
 * Ein Rezept, wie es das Modell liefert und wie es in der Karte steht.
 *
 * `emoji` ist die Titelfläche der Karte -- ein Bild wäre entweder ein
 * bezahlter zweiter Modellaufruf pro Rezept samt Ablage und Aufräumen, oder
 * ein fremder Bilderdienst, dem wir jeden Rezepttitel schicken und für den
 * die CSP (`img-src 'self' data: blob:`) erst geöffnet werden müsste. Ein
 * Emoji kostet nichts, kommt im selben Aufruf mit und ist auf jedem Gerät da.
 *
 * `uses` sind die Vorratsartikel, die das Rezept aufbraucht -- die Antwort
 * auf die Frage, warum ausgerechnet dieses Rezept hier steht.
 *
 * `buy` ist das Gegenstück: Zutaten, die der Haushalt nicht hat und für
 * dieses Gericht kaufen müsste. Ein Vorschlag, der ausschließlich aus dem
 * Kühlschrank bestehen darf, wird schnell einfallslos -- drei Gerichte aus
 * denselben acht Artikeln unterscheiden sich dann nur noch in der Reihenfolge
 * der Schritte. Zwei getrennte Felder statt eines gemeinsamen, weil die Karte
 * beides verschieden auszeichnet: was da ist, ist eine Begründung, was fehlt,
 * ist eine Aufgabe.
 */
export type Recipe = {
  emoji: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  uses: string[];
  buy: string[];
};

/** Ein Artikel, so wie er in den Prompt ging -- und so, wie er in basedOn steht. */
export type RecipeBasis = {
  name: string;
  category: string;
  quantity: number;
  /** ISO-8601. Als Zeichenkette, weil die Zeile als JSON in der DB liegt. */
  expiryDate: string;
  /**
   * Liegt der Artikel im Ablauffenster -- ist er also der Grund für den
   * Vorschlag und nicht bloß Beiwerk?
   *
   * Gespeichert und nicht aus `expiryDate` gerechnet: die Ansicht zeigt alte
   * Stapel, und ein Artikel, der im Mai dringend war, ist es im September
   * nicht mehr. Gefragt ist aber, was damals dringend war.
   */
  urgent: boolean;
};

/** Eine Historienzeile mit bereits geparstem JSON. */
export type ParsedSuggestion = {
  id: number;
  createdAt: Date;
  recipes: Recipe[];
  basedOn: RecipeBasis[];
};

/**
 * Derselbe Stapel, wie ihn der Browser bekommt.
 *
 * Abgeleitet und nicht Feld für Feld nachgeschrieben: die beiden unterscheiden
 * sich in genau einem Feld, und eine zweite Aufzählung hieße, jedes künftige
 * Feld an zwei Stellen nachzutragen. `createdAt` ist hier eine
 * ISO-Zeichenkette, weil dieselbe Form aus der Antwort der Route
 * zurückkommt (JSON kennt kein Date) und ein frisch vorangestellter Stapel
 * nicht anders aussehen soll als die geladenen.
 */
export type SuggestionView = Omit<ParsedSuggestion, "createdAt"> & { createdAt: string };

/**
 * Wie viele Stapel eine Liste erzeugen darf -- siehe getRecipeBudget.
 *
 * Zwei Fenster, weil sie zwei verschiedene Dinge verhindern. Die Stunde fängt
 * den Übermut ab (fünfmal hintereinander drücken, weil das dritte Gericht
 * nicht gefiel), der Tag das Dauerfeuer über einen Nachmittag hinweg. Nur eine
 * Stundengrenze ließe 120 Anfragen am Tag zu, nur eine Tagesgrenze ließe sie
 * alle in fünf Minuten zu.
 *
 * Die Zahlen sind bewusst unsere und nicht Googles: Deren Free-Tier-Grenzen
 * stehen inzwischen nicht mehr als Tabelle in der Dokumentation, sondern nur
 * noch im AI Studio des jeweiligen Kontos ("Rate limits depend on a variety of
 * factors ... and can be viewed in Google AI Studio"). Eine hier eingetragene
 * Zahl wäre also geraten und irgendwann still falsch. Stattdessen liegen diese
 * beiden so tief, dass sie unter jeder plausiblen Grenze bleiben: 20 Stapel
 * sind 60 Gerichte am Tag, und selbst wenn jeder Stapel die ganze Modellkette
 * durchprobiert (drei Anfragen, siehe generateRecipes), sind das 60 Anfragen.
 * Wer mehr braucht, ändert es hier -- und sieht an dieser Stelle, warum es
 * überhaupt eine Grenze gibt.
 */
export const MAX_BATCHES_PER_HOUR = 5;
export const MAX_BATCHES_PER_DAY = 20;

/**
 * Die Grenze, die auch "auf eigene Verantwortung" nicht fällt.
 *
 * Die beiden oben sind Vorsicht und lassen sich mit einer ausdrücklichen
 * Bestätigung überschreiten -- wer abends Gäste hat und den fünften Vorschlag
 * braucht, soll ihn bekommen und nicht auf eine Uhr warten müssen, die wir
 * uns selbst ausgedacht haben. Diese hier ist etwas anderes: eine Notbremse
 * gegen die Endlosschleife, gegen den steckengebliebenen Finger und gegen den
 * Nachmittag, an dem jemand "mal schauen, was noch geht" spielt.
 *
 * 50 Stapel sind 150 Anfragen, wenn jeder die ganze Modellkette durchprobiert
 * -- weit jenseits dessen, was ein Haushalt an einem Tag kocht, und die
 * Gegend, in der ein Free-Tier-Kontingent tatsächlich zu Ende geht. Wer sie
 * anders braucht, ändert sie hier; sie soll erreichbar sein, aber niemals aus
 * Versehen.
 */
export const MAX_BATCHES_PER_DAY_HARD = 50;

/**
 * Was das Budget erlaubt -- als eine Entscheidung statt als drei Zahlen, aus
 * denen jeder Leser sie sich selbst zusammenrechnet.
 *
 * Das war vorher dreimal dasselbe: die Route leitete "Notbremse / braucht
 * Bestätigung / geht" aus den Restzahlen ab, die Karte gleich noch einmal, und
 * eine vierte Ableitung stand in der Demo. Drei Fassungen einer Regel, die
 * übereinstimmen mussten, ohne dass irgendetwas das erzwang.
 *
 * - "ok": es sind noch Plätze frei.
 * - "needsOverride": eine der weichen Grenzen ist voll, der Ausnahmeweg über
 *   die ausdrückliche Bestätigung steht aber offen.
 * - "blocked": die Notbremse hat gegriffen, jetzt hilft nur Warten.
 */
export type RecipeBudgetState = "ok" | "needsOverride" | "blocked";

/**
 * Was diese Liste gerade noch erzeugen darf.
 *
 * Zurück kommt nicht nur "darfst du", sondern auch "wie viele noch" und "ab
 * wann wieder". Der Grund steht in der Beschwerde, aus der das entstanden ist:
 * Eine Grenze, die man erst durch eine Fehlermeldung kennenlernt, fühlt sich
 * wie eine Störung an -- eine, die vorher an der Schaltfläche steht, wie eine
 * Regel. Deshalb liest auch die Seite dieselbe Funktion und nicht nur die
 * Route.
 */
export type RecipeBudget = {
  /** Die Entscheidung. Route und Karte lesen sie, statt sie nachzurechnen. */
  state: RecipeBudgetState;
  /** Wie viele Stapel in dieser Stunde und an diesem Tag noch gehen. */
  hourLeft: number;
  dayLeft: number;
  /** Wie viele die Notbremse noch zulässt (MAX_BATCHES_PER_DAY_HARD). */
  hardLeft: number;
  /**
   * Wann der nächste Platz wieder frei wird, als ISO-Zeichenkette -- null,
   * solange gerade welche frei sind. `freeAt` meint die beiden weichen
   * Grenzen, `hardFreeAt` die Notbremse. Formatiert wird beides im Client
   * (formatRelativeFuture), damit die Angabe in der Zeitzone des Telefons
   * steht und nicht in der des Servers.
   */
  freeAt: string | null;
  hardFreeAt: string | null;
};
