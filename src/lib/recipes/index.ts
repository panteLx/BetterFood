import "server-only";
import { and, asc, count, desc, eq, gt, gte, isNull, lte, ne } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { items, recipeSuggestions } from "@/db/schema";
import { WEEK_WITHIN_DAYS, addDays, daysUntil, startOfDay } from "@/lib/expiry";
import { getCategoriesForList } from "@/lib/data";
import {
  MAX_BATCHES_PER_DAY,
  MAX_BATCHES_PER_DAY_HARD,
  MAX_BATCHES_PER_HOUR,
} from "@/lib/recipes/types";
import type { RecipeSuggestion } from "@/db/schema";
import type {
  ParsedSuggestion,
  Recipe,
  RecipeBasis,
  RecipeBudget,
  RecipeBudgetState,
} from "@/lib/recipes/types";

// Die Formen und Grenzen stehen in ./types (ohne "server-only", damit Karte
// und Demo sie lesen können); wer das Feature benutzt, soll sie trotzdem von
// hier bekommen und nicht wissen müssen, dass es zwei Dateien sind.
export * from "@/lib/recipes/types";

/**
 * Rezeptvorschläge rund um das, was bald abläuft.
 *
 * Das ganze Fachliche des Features steht hier: Auswahl der Artikel, Prompt,
 * der Aufruf bei Google, das Prüfen der Antwort und die beiden Abfragen auf
 * die Historie. Die Route darunter (api/recipes/generate) macht nur noch
 * Sitzung, Statuscodes und Text -- dieselbe Arbeitsteilung wie zwischen
 * api/push/test und lib/expiry-check.
 *
 * Daneben liegt ./types mit den Formen und den Grenzen. Die Trennung ist
 * keine Ordnungsliebe, sondern die Bedingung des `import "server-only"` oben:
 * Karte und Demo brauchen dieselben Typen und dieselben Zahlen, laufen aber
 * im Browser. Dieselbe Aufteilung wie bei lib/receipt/types.ts.
 */

/**
 * Warum eine Generierung gescheitert ist.
 *
 * Ein Fehlertyp mit Unterscheidungsmerkmal statt vier Fehlerklassen: die
 * Route bildet `kind` auf Statuscode und Text ab, und alle vier Fälle stehen
 * dort in einer Tabelle beieinander statt in vier catch-Zweigen. Vorbild ist
 * ReceiptTooComplexError in lib/receipt/layout.ts -- dort gibt es nur einen
 * Sonderfall, hier sind es vier.
 */
export class RecipeGenerationError extends Error {
  constructor(
    readonly kind: "quota" | "overloaded" | "timeout" | "upstream" | "unusable",
    message: string,
  ) {
    super(message);
    this.name = "RecipeGenerationError";
  }
}

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

/**
 * Bewusst eine Funktion und keine Modulkonstante: gelesen wird beim Aufruf,
 * also im laufenden Container mit dessen Umgebung -- nicht in dem Prozess,
 * der irgendwann das Image gebaut hat. Gleiche Begründung wie
 * isOidcConfigured() in lib/oidc.ts.
 *
 * Ein `connection()` braucht es hier nicht: gelesen wird der Wert nur in
 * Route-Handlern, die über requireSession() ohnehin dynamisch sind. Wer ihn
 * einmal in einer prerenderbaren Server-Komponente liest, muss es davorsetzen.
 */
export function isRecipesConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Dasselbe für Server-Komponenten -- mit dem `connection()` davor.
 *
 * Ohne das rendert Next die Antwort mit dem Wert vom Bauzeitpunkt vor, und
 * genau das ist der Fehler, den isRecipesConfigured() allein nicht verhindern
 * kann: Er ist dem Aufrufer überlassen, und der vierte vergisst ihn. Vorbild
 * sind getOidcDisplayName() in lib/oidc.ts und getRegistrationOpen() in
 * lib/registration.ts, die für ihre Umgebungsvariablen genau so verfahren.
 *
 * Route-Handler brauchen ihn nicht -- die sind über requireSession() ohnehin
 * dynamisch -- und benutzen weiter die synchrone Fassung.
 */
export async function getRecipesEnabled(): Promise<boolean> {
  await connection();
  return isRecipesConfigured();
}

/**
 * Die Modelle, in der Reihenfolge, in der sie gefragt werden.
 *
 * Kommagetrennt in GEMINI_MODEL überschreibbar; ein einzelner Name dort
 * schaltet die Kette ab und legt genau dieses Modell fest.
 */
function models(): string[] {
  const configured = process.env.GEMINI_MODEL?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_MODELS;
}

/**
 * Flash und nicht Pro: drei Alltagsrezepte aus einem Dutzend Zutaten sind
 * keine Denkaufgabe, und das Free-Tier-Kontingent von Pro ist ein Bruchteil.
 *
 * 3.8 ist das neueste stabile Flash (Stand 09/2026; die Modellliste des
 * Kontos unter GET /v1beta/models sagt, was es tatsächlich gibt -- ein
 * "gemini-2.6-flash" etwa existiert nicht).
 *
 * Dahinter zwei Ausweichmodelle, und die sind nicht theoretisch: beim ersten
 * echten Versuch antwortete 3.8 zweimal hintereinander mit 503 "This model is
 * currently experiencing high demand", während 3.5 dieselbe Anfrage sofort
 * beantwortete. Ein Knopf, der bei fremder Auslastung nur eine Entschuldigung
 * zeigt, ist für den Nutzer kaputt -- also wird der Reihe nach gefragt.
 * Flash-Lite steht am Ende, weil Google es ausdrücklich für günstige
 * Massenaufgaben ohne tiefes Nachdenken empfiehlt: als letzte Stufe lieber
 * ein schlichteres Rezept als gar keins.
 */
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * 30 Sekunden je Versuch, nicht die 6 aus lib/off.ts: eine Produktabfrage
 * antwortet in Millisekunden, eine Generierung in einstelligen bis knapp
 * zweistelligen (gemessen: 6,5 s mit thinkingLevel "low", 13,5 s ohne). Der
 * Server läuft als `node server.js` (output: "standalone"), es gibt also kein
 * Zeitlimit der Plattform darüber, das früher zuschlüge.
 *
 * Je Versuch und nicht für die ganze Kette -- die bleibt trotzdem beschränkt,
 * weil auf eine Zeitüberschreitung hin nicht weitergewechselt wird: schlimmster
 * Fall sind zwei schnelle 503er plus ein Zeitablauf, zusammen gut 30 Sekunden.
 */
const GENERATION_TIMEOUT_MS = 30_000;

/**
 * Genug Spielraum für Denk- und Ausgabe-Token zusammen.
 *
 * Die Modelle denken vor der Antwort, und diese Denk-Token zählen gegen
 * dieses Limit. Ein knapp bemessener Wert liefert deshalb nicht etwa ein
 * kürzeres Rezept, sondern gar keins: das Budget ist aufgebraucht, bevor das
 * erste Zeichen der Antwort steht, und `finishReason` ist MAX_TOKENS bei
 * leerem Text. Reichlich bemessen, obwohl unten die Denkstufe gesenkt wird --
 * gemessen wurden 420 Denk- und 1150 Ausgabe-Token, das Limit ist also kein
 * Sparzwang, sondern eine Notbremse gegen eine entgleiste Antwort.
 */
const MAX_OUTPUT_TOKENS = 16384;

/**
 * Wie lange das Modell vor der Antwort nachdenkt.
 *
 * "low" statt der Voreinstellung "medium", und das ist gemessen: dieselbe
 * Anfrage an gemini-3.5-flash brauchte mit der Voreinstellung 13,5 Sekunden
 * und 2312 Denk-Token, mit "low" 6,5 Sekunden und 420 -- bei gleich langer,
 * gleich brauchbarer Antwort (drei verschiedene, sinnvolle Gerichte). Für
 * einen Knopf, vor dem jemand wartet, ist die halbe Wartezeit mehr wert als
 * ein Nachdenken, das dieses Problem nicht braucht.
 *
 * Gilt nur für die 3.x-Modelle; die 2.5er hießen das Feld thinkingBudget.
 * Das ist kein Rückwärtskompatibilitätsproblem mehr: gemini-2.5-flash
 * antwortet neuen Schlüsseln bereits mit 404 ("no longer available to new
 * users"). Wer in GEMINI_MODEL doch ein 2.5er einträgt, bekommt von dort
 * einen Fehler -- und die Meldung im Serverlog sagt, welches Modell es war.
 */
const THINKING_LEVEL = "low";

/** Wie viele Vorschläge die Seite zeigt. Keine Pagination, aber auch kein endloses Scrollen. */
const HISTORY_LIMIT = 30;

/**
 * Wie viele dringende und wie viele übrige Artikel mitgeschickt werden.
 *
 * Beide Gruppen sind eng begrenzt, und das aus zwei Gründen. Der eine ist
 * Datenschutz: was hier steht, verlässt das Haus, und "der ganze Vorrat" ist
 * etwas anderes als "was diese Woche weg muss plus eine Handvoll Beiwerk".
 * Der andere ist die Qualität der Antwort -- ein Modell, das aus vierzig
 * Artikeln wählen darf, packt sie auch alle in die drei Gerichte.
 */
const MAX_URGENT = 8;
const MAX_PANTRY = 10;

/**
 * Die eine Kategorie, aus der sich nichts kochen lässt.
 *
 * Aufgefallen an einer echten Liste: dort waren die drei einzigen Artikel
 * jenseits des Ablauffensters ein Mineralwasser, ein Energydrink und eine
 * Spezi. Alle drei gingen an Google, keiner tauchte in einem der drei Gerichte
 * auf -- konnte er auch nicht. Getränke sind damit der schlechteste denkbare
 * Tausch: Sie kosten einen der zehn Plätze, verraten etwas über den Haushalt
 * und tragen nichts bei. Milch und Sahne sind davon nicht betroffen, die
 * stehen unter "Milchprodukte".
 *
 * Auf den Schlüssel und nicht auf das Label geprüft: den Anzeigenamen darf
 * jede Liste ändern, der Schlüssel kommt aus DEFAULT_CATEGORIES. Eine selbst
 * angelegte Kategorie mit eigenem Schlüssel fällt damit nicht darunter -- das
 * ist der Preis dafür, hier nicht auf Namen zu raten.
 */
const SKIP_CATEGORY = "getraenke";

// Grenzen für die Modellantwort. Was hier ankommt, landet dauerhaft in der
// Datenbank und in der Oberfläche -- also wird es behandelt wie jede andere
// Fremdeingabe auch.
const MAX_RECIPES = 5;
const MAX_LIST_ENTRIES = 20;
const MAX_BUY = 8;
const MAX_TEXT_LENGTH = 500;

// ---------------------------------------------------------------------------
// Auswahl der Artikel
// ---------------------------------------------------------------------------

/**
 * Die Artikel, mit denen gekocht werden soll -- in zwei Gruppen.
 *
 * Dringend sind die im Ablauffenster: sie sind der Anlass, und jedes Gericht
 * muss mindestens einen davon aufbrauchen. Alles andere ist Vorrat, der
 * mitgeschickt wird, damit überhaupt etwas Kochbares entsteht. Die erste
 * Fassung schickte nur die ablaufenden Artikel, und das Ergebnis war
 * absehbar: das Modell hatte nichts anderes zur Hand und stopfte deshalb
 * Joghurt, Spinat, Hackfleisch und Brot in jedes der drei Gerichte.
 *
 * Abgelaufenes bleibt draußen -- daraus soll niemand kochen --, Getränke
 * ebenfalls (SKIP_CATEGORY), und die
 * Reihenfolge ist beide Male "läuft am ehesten ab": bei den dringenden ist
 * das die Dringlichkeit selbst, beim übrigen Vorrat die beste Antwort auf die
 * Frage, was von vierzig Artikeln die zehn interessantesten sind.
 *
 * Ist das Fenster leer, bleibt die zweite Gruppe allein übrig: ein gut
 * gefüllter Vorrat, in dem gerade nichts drängt, soll einen Vorschlag
 * bekommen und keine Fehlermeldung. Dieselbe Überlegung wie bei der
 * Testbenachrichtigung, die auch nicht darauf wartet, dass wirklich etwas
 * fällig ist (buildPreviewNotification in lib/expiry-check.ts).
 */
/**
 * Woraus sich überhaupt kochen lässt: aktiv, in dieser Liste, nicht
 * ausgeblendet, kein Getränk und nicht abgelaufen.
 *
 * Als eine Funktion und nicht zweimal hingeschrieben. Die Bedingung galt
 * immer schon für beide Abfragen unten -- die Auswahl und die Zählung, die
 * den Knopf freischaltet --, stand aber in zwei getrennten `and(...)`, über
 * denen ein Kommentar mahnte, sie gleich zu halten. Ein Kommentar ist die
 * schwächste Form, einen Zusammenhang zu erzwingen: Wer eine zweite
 * übersprungene Kategorie einträgt, ändert sonst die eine Stelle und lässt
 * den Knopf für einen Vorrat leuchten, aus dem die Auswahl nichts hergibt.
 */
function cookableFilter(listId: number, today: Date) {
  return and(
    eq(items.status, "active"),
    eq(items.listId, listId),
    isNull(items.hiddenAt),
    ne(items.category, SKIP_CATEGORY),
    gte(items.expiryDate, today),
  );
}

/**
 * Wie lang ein Name oder eine Kategorie in den Prompt darf.
 *
 * Großzügig für echte Lebensmittel ("Bio-Vollmilch 3,5% haltbar 1l" sind 32
 * Zeichen) und eng genug, dass ein einzelner Artikel die Anfrage nicht
 * aufbläht. Die 500er-Kappung in text() greift erst beim Zurücklesen
 * gespeicherter Zeilen -- auf dem Weg zum Modell stand bisher nichts.
 */
const MAX_PROMPT_FIELD = 80;

/**
 * Macht eine Zeichenkette prompt-tauglich.
 *
 * buildPrompt schreibt jeden Artikel als `- "Name" — Kategorie, Menge N` in
 * eine Liste. Ein Name mit Zeilenumbruch und Anführungszeichen bricht aus
 * dieser Zeile aus und kann eigene Anweisungen an das Modell platzieren --
 * und Namen kommen nicht nur aus dem Haushalt: lib/off.ts übernimmt sie von
 * Open Food Facts (von jedem editierbar), der Belegimport aus einer OCR.
 * POST /api/items prüft nur auf nichtleer, hier ist also die letzte Stelle
 * vor dem Modell.
 *
 * Umbrüche werden zu Leerzeichen statt gelöscht, damit aus zwei Wörtern
 * nicht eines wird; die Anführungszeichen werden zu einfachen, weil das den
 * Namen lesbar lässt, statt ihn zu verstümmeln.
 */
function promptSafe(value: string): string {
  const flat = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/["`]/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
  return flat.length > MAX_PROMPT_FIELD ? `${flat.slice(0, MAX_PROMPT_FIELD - 1)}…` : flat;
}

export async function selectRecipeBasis(listId: number): Promise<RecipeBasis[]> {
  const today = startOfDay(new Date());
  const horizon = addDays(WEEK_WITHIN_DAYS, today);
  const cookable = cookableFilter(listId, today);

  const [urgent, pantry] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(cookable, lte(items.expiryDate, horizon)))
      .orderBy(asc(items.expiryDate))
      .limit(MAX_URGENT),
    db
      .select()
      .from(items)
      .where(and(cookable, gt(items.expiryDate, horizon)))
      .orderBy(asc(items.expiryDate))
      .limit(MAX_PANTRY),
  ]);

  // Der Kategorie-Schlüssel ("dairy") sagt einem Sprachmodell weniger als das
  // Label ("Milchprodukte"), und die Liste hat ihre Kategorien womöglich längst
  // selbst benannt. Die Zuordnung ist gecacht (getCategoriesForList), kostet
  // hier also keine zweite echte Abfrage.
  const categories = await getCategoriesForList(listId);
  const labelOf = new Map(categories.map((category) => [category.key, category.label]));

  const toBasis = (item: typeof items.$inferSelect, isUrgent: boolean): RecipeBasis => ({
    name: promptSafe(item.name),
    category: promptSafe(labelOf.get(item.category) ?? item.category),
    quantity: item.quantity,
    expiryDate: item.expiryDate.toISOString(),
    urgent: isUrgent,
  });

  return [
    ...urgent.map((item) => toBasis(item, true)),
    ...pantry.map((item) => toBasis(item, false)),
  ];
}

/**
 * Gibt es überhaupt etwas, woraus sich kochen ließe?
 *
 * Für die Seite, die den Knopf sonst sperrt. Bewusst nur ein count() und
 * nicht selectRecipeBasis().length: die Antwort ist dieselbe -- die beiden
 * Gruppen oben teilen alle aktiven, nicht abgelaufenen Artikel zwischen sich
 * auf, die Auswahl ist also genau dann leer, wenn es keinen einzigen gibt --,
 * aber sie kostet keine zweite Abfrage samt Kategorie-Zuordnung, deren
 * Ergebnis die Seite wegwirft.
 *
 * Dass dabei dieselben Bedingungen gelten wie oben, Getränke eingeschlossen,
 * erzwingt jetzt der gemeinsame cookableFilter(): ein Kasten Sprudel im
 * Vorrat darf den Knopf nicht freischalten, wenn die Auswahl darunter leer
 * bliebe.
 */
export async function hasCookableItems(listId: number): Promise<boolean> {
  const row = await db
    .select({ n: count() })
    .from(items)
    .where(cookableFilter(listId, startOfDay(new Date())))
    .get();

  return (row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Der Aufruf
// ---------------------------------------------------------------------------

/**
 * Das Antwortformat, das Gemini einhalten muss.
 *
 * Mit responseSchema statt "gib bitte JSON zurück" im Prompt: das Modell wird
 * beim Dekodieren auf diese Form festgelegt, statt dass wir hinterher raten,
 * ob der Text JSON ist. propertyOrdering steht dabei bewusst da -- ohne feste
 * Reihenfolge schreibt das Modell die Felder mal so, mal so, und die
 * Beschreibung ("verbraucht Paprika") kommt dann vor dem Titel zustande, auf
 * den sie sich bezieht.
 */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    recipes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          emoji: { type: "STRING", description: "Ein einzelnes Emoji, das zum Gericht passt" },
          title: { type: "STRING", description: "Name des Gerichts, höchstens fünf Wörter" },
          description: {
            type: "STRING",
            description: "Ein Satz: was es ist und welche ablaufenden Zutaten es aufbraucht",
          },
          uses: {
            type: "ARRAY",
            description:
              "Namen der verwendeten Vorratsartikel, exakt so wie sie in Anführungszeichen vorgegeben sind, ohne Kategorie und ohne Menge. Nie leer: mindestens ein Artikel aus dem Vorrat gehört in jedes Gericht",
            items: { type: "STRING" },
          },
          buy: {
            type: "ARRAY",
            description:
              "Jede Zutat aus ingredients, die nicht in uses steht, ohne Mengenangabe -- außer Salz, Pfeffer, Öl, Essig und Wasser. Leer, wenn alles da ist",
            items: { type: "STRING" },
          },
          ingredients: {
            type: "ARRAY",
            description: "Zutaten mit Menge, eine pro Eintrag",
            items: { type: "STRING" },
          },
          steps: {
            type: "ARRAY",
            description: "Zubereitungsschritte in Reihenfolge, je ein Satz",
            items: { type: "STRING" },
          },
        },
        required: ["emoji", "title", "description", "uses", "buy", "ingredients", "steps"],
        propertyOrdering: ["emoji", "title", "description", "uses", "buy", "ingredients", "steps"],
      },
    },
  },
  required: ["recipes"],
} as const;

/**
 * Was das Modell über seine Aufgabe wissen muss.
 *
 * Die beiden mittleren Sätze sind aus einer Enttäuschung entstanden. Die
 * erste Fassung verlangte nur "mindestens einen der vorgegebenen Artikel" und
 * verbot ausdrücklich, etwas zu ergänzen -- heraus kamen drei Varianten
 * derselben Resteverwertung, in denen jedes Gericht so ziemlich alles
 * aufbrauchte, was in der Liste stand. Es reicht aber, wenn ein Gericht
 * einen einzigen dringenden Artikel rettet; die restlichen Zutaten dürfen aus
 * dem übrigen Vorrat kommen oder eingekauft werden. Beides muss dastehen,
 * sonst bleibt das Modell beim Naheliegenden.
 *
 * Die Obergrenze für Einzukaufendes steht daneben, weil sonst das Gegenteil
 * passiert: ein Gericht mit acht neuen Zutaten ist kein Vorschlag mehr,
 * sondern ein Einkaufszettel mit einem Alibi-Joghurt darin.
 *
 * "Mindestens zwei der drei" und nicht mehr "jedes" ist ebenfalls eine
 * Korrektur. Solange jedes Gericht einen dringenden Artikel aufbrauchen
 * musste, waren zwei Durchgänge hintereinander kaum zu unterscheiden -- bei
 * vier ablaufenden Artikeln gibt es schlicht nicht viele Arten, sie zu
 * verteilen, und das Modell fand jedes Mal dieselbe. Zwei Gerichte tragen
 * weiterhin den eigentlichen Zweck, das dritte darf aus dem übrigen Vorrat
 * und Eingekauftem entstehen und bringt die Abwechslung.
 *
 * Diese Freiheit hatte allerdings kein Ende, und das Modell fand es sofort:
 * Der erste Durchgang danach lieferte als drittes Gericht eine Spaghetti
 * Carbonara aus Spaghetti, Speck, Eigelb und Parmesan -- vier Zutaten, vier
 * Einkäufe, kein einziger eigener Artikel. Das ist kein Vorschlag für diesen
 * Vorrat, sondern ein Rezept, das genauso in jedem Kochbuch stünde. Seitdem
 * steht die Untergrenze ausdrücklich da: 'uses' darf in keinem Gericht leer
 * sein. Frei ist das dritte Gericht nur von der Dringlichkeit, nicht vom
 * Vorrat -- und parseRecipes hält das auch dann ein, wenn das Modell es
 * überliest.
 *
 * Was als Grundvorrat gilt, ist inzwischen eine kurze Liste, und auch das ist
 * korrigiert statt geraten. Sie enthielt einmal Mehl, Eier, Zwiebeln, Nudeln
 * und Reis -- das Modell hielt sich daran und ließ sie folglich aus 'buy'
 * weg, sodass unter einem Pfannkuchenrezept "Zucker, Apfelmark" stand,
 * während die Zutatenliste darunter 200 g Mehl und zwei Eier verlangte. Wer
 * darauf einkaufen geht, steht abends ohne Teig da. Übrig sind deshalb nur
 * Dinge, die man nicht abmisst und die nie ausgehen; alles, was man in
 * Gramm oder Stück braucht, muss in 'buy' auftauchen. Salz und Öl deswegen
 * gleich mit aufzuzählen wäre die andere Richtung desselben Fehlers: eine
 * Einkaufsliste, auf der "Salz" steht, nimmt niemand mehr ernst.
 */
const SYSTEM_INSTRUCTION = [
  "Du schlägst Rezepte für einen Haushalt vor, der Lebensmittel aufbrauchen will, bevor sie schlecht werden.",
  "Antworte ausschließlich auf Deutsch, in der Du-Form und ohne Füllsätze.",
  "Schlage genau drei Gerichte vor, die ein durchschnittlich begabter Mensch abends in unter einer Stunde kocht.",
  "Jedes Gericht muss mindestens einen Artikel aus einer der beiden vorgegebenen Listen aufbrauchen: 'uses' darf niemals leer sein.",
  "Mindestens zwei der drei Gerichte müssen einen Artikel aus 'Muss bald weg' aufbrauchen, aber keins muss alle aufbrauchen.",
  "Das dritte darf 'Muss bald weg' auslassen, muss dann aber etwas aus 'Außerdem im Vorrat' aufbrauchen -- am besten etwas, das die beiden anderen nicht schon verwenden.",
  "Ein Gericht um einen einzigen dringenden Artikel herum, ergänzt um drei bis sechs weitere Zutaten, ist besser als eine Pfanne, in der alles gleichzeitig landet.",
  "Die weiteren Zutaten dürfen aus 'Außerdem im Vorrat' kommen oder neu sein -- höchstens fünf neue je Gericht, sonst wird aus dem Vorschlag ein Einkauf.",
  "In 'uses' stehen nur Artikel aus den beiden vorgegebenen Listen, und zwar genau der Name in Anführungszeichen -- ohne Kategorie, ohne Menge, ohne Klammern.",
  "In 'buy' steht jede Zutat aus 'ingredients', die nicht in 'uses' steht. Mehl, Eier, Zwiebeln, Nudeln, Reis, Butter und Zucker gehören also dorthin, sobald sie nicht im Vorrat liegen: Wer mit deiner Liste einkaufen geht, muss danach alles im Haus haben.",
  "Nur Salz, Pfeffer, Öl, Essig und Wasser darfst du als vorhanden annehmen; die gehören weder in 'uses' noch in 'buy'.",
  "Die drei Gerichte sollen sich deutlich unterscheiden, in Zutaten wie in Zubereitung.",
  "Steht ein Abschnitt 'Zuletzt schon vorgeschlagen' im Auftrag, gab es diese Gerichte bereits: Schlage andere vor, und nicht nur denselben Teller unter neuem Namen -- eine andere Garart, eine andere Küche oder eine andere Tageszeit.",
].join(" ");

/**
 * Der eigentliche Auftrag: der Vorrat, aus dem gekocht werden soll.
 *
 * Zwei Abschnitte mit sprechenden Überschriften statt einer Liste mit einem
 * Dringlichkeitsvermerk je Zeile -- die System-Instruktion verweist auf genau
 * diese beiden Namen, und ein Modell trifft eine Gruppe zuverlässiger als
 * eine Eigenschaft. Beim übrigen Vorrat fehlt das Datum bewusst: es spielt
 * für die Auswahl keine Rolle und muss deshalb auch nicht das Haus verlassen.
 *
 * Der Name steht in Anführungszeichen, und das ist keine Kosmetik. Die erste
 * Fassung schrieb `- Hackfleisch gemischt (Fleisch & Fisch), Menge 1` und
 * verlangte dazu "exakt so geschrieben wie dort" -- prompt kam in 'uses' der
 * Eintrag "Hackfleisch gemischt (Fleisch & Fisch)" zurück. Das stand dann so
 * auf der Karte, und schlimmer: der Abgleich mit den dringenden Artikeln lief
 * ins Leere, weil er auf den bloßen Namen prüft. Die Anführungszeichen
 * markieren, was der Name ist und was Beiwerk.
 */
function buildPrompt(basis: RecipeBasis[], today: Date, avoid: string[] = []): string {
  const urgent = basis.filter((entry) => entry.urgent);
  const pantry = basis.filter((entry) => !entry.urgent);

  const lines: string[] = [];

  if (urgent.length > 0) {
    lines.push("Muss bald weg:");
    for (const entry of urgent) {
      const days = daysUntil(new Date(entry.expiryDate), today);
      const when =
        days === 0 ? "läuft heute ab" : days === 1 ? "läuft morgen ab" : `noch ${days} Tage`;
      lines.push(`- "${entry.name}" — ${entry.category}, Menge ${entry.quantity}, ${when}`);
    }
  }

  if (pantry.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Außerdem im Vorrat:");
    for (const entry of pantry) {
      lines.push(`- "${entry.name}" — ${entry.category}, Menge ${entry.quantity}`);
    }
  }

  if (avoid.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Zuletzt schon vorgeschlagen:");
    for (const title of avoid) lines.push(`- ${promptSafe(title)}`);
  }

  lines.push("");
  lines.push(
    urgent.length > 0
      ? "Was kochen wir? Bei zweien der Gerichte steht ein Artikel aus 'Muss bald weg' im Mittelpunkt, und in jedem der drei steckt mindestens ein Artikel von oben."
      : "Was kochen wir? Es drängt gerade nichts, also darf der Vorschlag Lust machen statt zu retten -- in jedem Gericht steckt aber mindestens ein Artikel von oben.",
  );

  return lines.join("\n");
}

/**
 * Ruft Gemini an und gibt die geprüften Rezepte zurück.
 *
 * Ohne Wiederholungsversuch, und zwar bei jedem Fehler: ein zweiter Anlauf
 * kostet echtes Kontingent, und der Nutzer steht ohnehin vor dem Knopf und
 * kann selbst entscheiden, ob er es noch einmal versuchen will.
 *
 * `avoid` sind die Titel der letzten Durchgänge -- siehe recentRecipeTitles.
 */
export async function generateRecipes(basis: RecipeBasis[], avoid: string[]): Promise<Recipe[]> {
  const chain = models();

  for (const [index, name] of chain.entries()) {
    try {
      return await askModel(name, basis, avoid);
    } catch (error) {
      const last = index === chain.length - 1;
      // Gewechselt wird bei fremder Auslastung (503) und bei aufgebrauchtem
      // Kontingent (429).
      //
      // Das 429 stand hier lange ausdrücklich NICHT, mit der Begründung, ein
      // leeres Kontingent sei eine Entscheidung des Betreibers und dürfe nicht
      // still auf dem nächsten Modell weiterlaufen. Diese Begründung war
      // schlicht falsch: Die Grenzen des Free Tier hängen am Modell, nicht am
      // Schlüssel -- ein erschöpftes gemini-3.8-flash sagt nichts über
      // gemini-3.5-flash. Aufgefallen ist es im Betrieb, als der Knopf
      // "Trotzdem vorschlagen" verlässlich mit "Kontingent aufgebraucht"
      // antwortete, obwohl zwei unberührte Modelle in der Kette standen. Die
      // Kette gibt es genau für diesen Fall; sie hier anzuhalten hieß, das
      // erste Modell zum Flaschenhals aller drei zu machen.
      //
      // Auf einem bezahlten Tarif ist 429 dagegen kontoweit (Googles
      // ausgabenbasierte Grenze, rollende 10 Minuten). Dann scheitern alle
      // drei -- das kostet drei schnelle Fehlschläge und endet bei derselben
      // Meldung wie zuvor, nur ein paar hundert Millisekunden später.
      //
      // Nicht gewechselt wird bei "timeout": Der Nutzer hat dann bereits
      // 30 Sekunden gewartet, ein zweiter Anlauf verdoppelt die Wartezeit,
      // statt sie zu retten. Auslastung und leeres Kontingent melden sich
      // dagegen binnen Millisekunden.
      const kind = error instanceof RecipeGenerationError ? error.kind : null;
      if (last || (kind !== "overloaded" && kind !== "quota")) throw error;

      console.warn(
        `Rezeptvorschlag: ${name} ${
          kind === "quota" ? "hat kein Kontingent mehr" : "ist ausgelastet"
        }, weiter mit ${chain[index + 1]}`,
      );
    }
  }

  // Unerreichbar -- die Schleife kehrt zurück oder wirft. Der Compiler weiß
  // das nicht, und eine leere GEMINI_MODEL-Liste fängt models() bereits ab.
  throw new RecipeGenerationError("upstream", "Kein Modell konfiguriert");
}

/** Ein Versuch bei genau einem Modell. */
async function askModel(
  name: string,
  basis: RecipeBasis[],
  avoid: string[],
): Promise<Recipe[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new RecipeGenerationError("upstream", "GEMINI_API_KEY fehlt");

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(name)}:generateContent`, {
      method: "POST",
      headers: {
        // Im Header und nicht als ?key= in der URL: eine URL steht in jedem
        // Zugriffs- und Fehlerprotokoll, das irgendwo unterwegs mitschreibt.
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          { role: "user", parts: [{ text: buildPrompt(basis, startOfDay(new Date()), avoid) }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingLevel: THINKING_LEVEL },
          // Bewusst KEIN temperature/topP/topK: für die 3.x-Modelle rät
          // Google davon ab, weil deren Schlussfolgern auf die
          // Voreinstellungen abgestimmt ist -- gesteuert wird über die
          // System-Instruktion. Der Wunsch nach drei verschiedenen Gerichten
          // steht deshalb dort als Satz und nicht hier als Zahl.
        },
      }),
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });
  } catch (error) {
    // AbortSignal.timeout wirft TimeoutError, ein Netzfehler einen TypeError.
    // Beides ist für den Nutzer dasselbe: es kam nichts an.
    console.error(`Rezeptvorschlag: Aufruf an ${name} fehlgeschlagen`, error);
    throw new RecipeGenerationError("timeout", "Gemini war nicht erreichbar");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { status?: string; message?: string } }
      | null;
    const status = body?.error?.status;
    // Die Meldung mitloggen und nicht nur den Code: "This model is currently
    // experiencing high demand" sagt dem, der den Server betreibt, sofort,
    // dass der Fehler nicht bei ihm liegt.
    console.error(
      `Rezeptvorschlag: ${name} antwortet`,
      res.status,
      status,
      body?.error?.message?.slice(0, 200) ?? "",
    );

    // 429 ist das aufgebrauchte Kontingent -- der einzige Fehler, den der
    // Nutzer selbst auflösen kann (warten oder zahlen).
    if (res.status === 429 || status === "RESOURCE_EXHAUSTED") {
      throw new RecipeGenerationError("quota", "Kontingent aufgebraucht");
    }
    // 503 UNAVAILABLE heißt "dieses Modell ist gerade überlastet" und ist der
    // Fall, für den es die Modellkette gibt. 500 zählt mit: eine Störung bei
    // Google ist selten modellübergreifend.
    if (res.status === 503 || res.status === 500 || status === "UNAVAILABLE") {
      throw new RecipeGenerationError("overloaded", `${name} ist ausgelastet`);
    }
    throw new RecipeGenerationError("upstream", `Gemini antwortete mit ${res.status}`);
  }

  const payload = (await res.json().catch(() => null)) as GeminiResponse | null;
  const text = answerText(payload);

  if (!text) {
    // Der häufigste Grund dafür ist ein Kandidat, der ohne Text endet:
    // MAX_TOKENS (Denken hat das Budget aufgebraucht) oder SAFETY.
    console.error(
      `Rezeptvorschlag: leere Antwort von ${name}`,
      payload?.candidates?.[0]?.finishReason,
      payload?.promptFeedback?.blockReason,
    );
    throw new RecipeGenerationError("unusable", "Gemini lieferte keinen Text");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(`Rezeptvorschlag: Antwort von ${name} ist kein JSON`);
    throw new RecipeGenerationError("unusable", "Antwort war kein JSON");
  }

  const recipes = parseRecipes((parsed as { recipes?: unknown })?.recipes);
  if (recipes.length === 0) {
    console.error(`Rezeptvorschlag: kein vollständiges Rezept von ${name}`);
    throw new RecipeGenerationError("unusable", "Kein vollständiges Rezept");
  }

  return recipes;
}

/** Nur die Felder, die tatsächlich gelesen werden -- der Rest der Antwort ist groß. */
type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

/**
 * Die eigentliche Antwort aus den Teilen des ersten Kandidaten.
 *
 * Nicht `parts[0].text`: die Modelle denken vor der Antwort, und dieses
 * Denken kann als eigener Teil mit `thought: true` in derselben Liste stehen.
 * Der erste Teil wäre dann die Gedankenzusammenfassung -- also gerade nicht
 * das JSON, auf das das responseSchema die Antwort festgelegt hat.
 * Zusammengesetzt statt "der erste passende", weil eine lange Antwort auf
 * mehrere Teile verteilt sein darf.
 */
function answerText(payload: GeminiResponse | null): string {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => part.thought !== true && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

// ---------------------------------------------------------------------------
// Prüfen
// ---------------------------------------------------------------------------

/**
 * Macht aus irgendetwas eine Liste gültiger Rezepte -- oder eine leere Liste.
 *
 * Zweimal gebraucht und deshalb hier: einmal für die frische Modellantwort,
 * einmal beim Lesen einer alten Zeile aus der Datenbank. Beide Male gilt
 * dasselbe: geprüft wird Feld für Feld, nichts wird geglaubt. Das Repo hat
 * keine Schema-Bibliothek, und die eine andere Stelle mit geparstem JSON
 * (lib/review-batch.ts) prüft von Hand genauso.
 *
 * Unvollständige Einträge fallen weg statt die ganze Zeile zu verwerfen: zwei
 * brauchbare Rezepte sind mehr wert als eine Fehlermeldung.
 */
function parseRecipes(value: unknown): Recipe[] {
  if (!Array.isArray(value)) return [];

  const recipes: Recipe[] = [];
  for (const entry of value.slice(0, MAX_RECIPES)) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;

    const title = text(record.title);
    const description = text(record.description);
    const ingredients = list(record.ingredients);
    const steps = list(record.steps);
    const uses = list(record.uses);

    // Ein Rezept ohne Titel oder ohne Schritte ist keins. Zutaten ohne
    // Schritte wären eine Einkaufsliste, Schritte ohne Titel eine Notiz.
    if (!title || steps.length === 0) continue;

    // Und ein Rezept ohne einen einzigen eigenen Artikel ist für diese App
    // keins: Es beantwortet die Frage nicht, warum es hier steht. Das ist
    // beobachtet, nicht befürchtet -- kaum durfte das dritte Gericht 'Muss
    // bald weg' auslassen, kam eine Spaghetti Carbonara zurück, deren vier
    // Zutaten allesamt einzukaufen waren. Die Instruktion sagt es dem Modell,
    // diese Zeile hält es auch dann ein, wenn es nicht hört.
    //
    // Geprüft wird nur, DASS etwas drinsteht, nicht ob die Namen wirklich aus
    // der Auswahl stammen. Ein Abgleich bräuchte die Basis als zweiten
    // Parameter und würde ein gutes Rezept wegwerfen, sobald das Modell einen
    // Namen anders schreibt als vorgegeben -- ein Fehler, den es hier noch nie
    // gemacht hat, während der leere Fall belegt ist.
    if (uses.length === 0) continue;

    recipes.push({
      emoji: emoji(record.emoji),
      title,
      description,
      ingredients,
      steps,
      uses,
      // Enger begrenzt als die übrigen Listen: die Instruktion erlaubt fünf
      // Einkäufe je Gericht, und die Karte zeigt sie als Pillen nebeneinander
      // -- zwanzig davon wären eine Wand vor dem Rezept.
      buy: list(record.buy).slice(0, MAX_BUY),
    });
  }

  return recipes;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT_LENGTH) : "";
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_LIST_ENTRIES)
    .map((entry) => text(entry))
    .filter(Boolean);
}

/**
 * Das Emoji der Titelfläche, oder ein Ersatz.
 *
 * Geprüft wird auf Länge und darauf, dass keine ASCII-Zeichen darin stehen:
 * ein Modell, das das Feld nicht füllen kann, schreibt dort "N/A" oder ":)"
 * hinein, und beides sähe auf einer 88 Pixel hohen Fläche schlecht aus. Die
 * Länge in UTF-16-Einheiten ist großzügig, weil zusammengesetzte Emoji
 * (Familien, Hautton, Flaggen) mehrere davon brauchen.
 */
function emoji(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || candidate.length > 8 || /[\x00-\x7F]/.test(candidate)) return "🍽️";
  return candidate;
}

/**
 * Eine Historienzeile mit geparstem JSON, für Seite und Route.
 *
 * Zeilen, deren Rezepte sich nicht mehr lesen lassen, kommen mit leerer Liste
 * zurück statt zu werfen: eine kaputte Zeile aus einer früheren Fassung darf
 * nicht die ganze Seite mitnehmen.
 */
function parseSuggestion(row: RecipeSuggestion): ParsedSuggestion {
  return {
    id: row.id,
    createdAt: row.createdAt,
    recipes: parseRecipes(safeParse(row.recipes)),
    basedOn: parseBasis(safeParse(row.basedOn)),
  };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseBasis(value: unknown): RecipeBasis[] {
  if (!Array.isArray(value)) return [];

  const basis: RecipeBasis[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const name = text(record.name);
    if (!name) continue;
    basis.push({
      name,
      category: text(record.category),
      quantity: typeof record.quantity === "number" ? record.quantity : 1,
      expiryDate: text(record.expiryDate),
      urgent: record.urgent === true,
    });
  }
  return basis;
}

// ---------------------------------------------------------------------------
// Historie
// ---------------------------------------------------------------------------

/**
 * Die Vorschläge dieser Liste, neueste zuerst.
 *
 * Ohne "use cache": es gibt keinen Tag, den jemand invalidieren würde, und
 * die Seite wird ohnehin nur von Hand aufgerufen. Dieselbe Entscheidung wie
 * bei der Vorrats-Abfrage in app/inventory/page.tsx.
 */
export async function getRecipeSuggestions(listId: number): Promise<ParsedSuggestion[]> {
  const rows = await db
    .select()
    .from(recipeSuggestions)
    .where(eq(recipeSuggestions.listId, listId))
    .orderBy(desc(recipeSuggestions.createdAt))
    .limit(HISTORY_LIMIT);

  return rows.map(parseSuggestion);
}

/**
 * One dish out of one stored batch of this list -- or null if there is none.
 *
 * The list id is part of the query and not checked afterwards, so an id
 * guessed from a neighbouring household simply finds nothing. That matters
 * because of the one caller: api/recipes/export sends a recipe to a foreign
 * server, and it takes the recipe from here rather than from the request
 * body. The browser only names which batch and which of its three dishes;
 * what actually leaves the house is what this row says. A route that trusted
 * the body would let anyone with a session write arbitrary text into the
 * household's Mealie.
 *
 * Addressing a dish by (batch, position) is domain knowledge and stays here
 * rather than in the route: "there is no such batch", "it belongs to another
 * list" and "that batch has fewer dishes than that" all end up as the same
 * null on purpose. Telling them apart outside would say whether an id exists
 * elsewhere.
 */
export async function getSuggestedRecipe(
  listId: number,
  id: number,
  index: number,
): Promise<Recipe | null> {
  const [row] = await db
    .select()
    .from(recipeSuggestions)
    .where(and(eq(recipeSuggestions.id, id), eq(recipeSuggestions.listId, listId)))
    .limit(1);

  return row ? (parseSuggestion(row).recipes[index] ?? null) : null;
}

/**
 * Wie viele Stapel weit zurückgeschaut wird, um Wiederholungen zu vermeiden,
 * und wie viele Titel davon höchstens in den Prompt gehen.
 *
 * Drei Stapel sind rund neun Gerichte -- genug, dass der zweite Durchgang
 * nicht dieselbe Pfanne beschreibt, und wenig genug, dass nach ein paar
 * Durchgängen nicht die halbe Kochwelt ausgeschlossen ist. Die Deckelung auf
 * zwölf ist die Notbremse für den Fall, dass jemand die Stundengrenze
 * ausreizt.
 */
const AVOID_BATCHES = 3;
const AVOID_TITLES = 12;

/**
 * Die Titel der zuletzt vorgeschlagenen Gerichte dieser Liste.
 *
 * Der Grund ist beobachtet, nicht vermutet: zwei Durchgänge hintereinander
 * auf demselben Vorrat lieferten fast dieselben drei Gerichte. Das ist auch
 * kein Fehler des Modells -- es sieht jedes Mal dieselbe Anfrage, ohne
 * Gedächtnis dazwischen, und antwortet folglich ähnlich. Die Erinnerung muss
 * also aus der Datenbank kommen und mit in den Auftrag.
 *
 * Nur die Titel und nicht die ganzen Rezepte: sie reichen, um ein Gericht zu
 * erkennen, und der Prompt bleibt kurz. Über temperature liefe das nicht --
 * für die 3.x-Modelle rät Google davon ab (siehe generationConfig), und
 * "würfle anders" ist ohnehin etwas anderes als "das gab es schon".
 */
export async function recentRecipeTitles(listId: number): Promise<string[]> {
  const rows = await db
    .select({ recipes: recipeSuggestions.recipes })
    .from(recipeSuggestions)
    .where(eq(recipeSuggestions.listId, listId))
    .orderBy(desc(recipeSuggestions.createdAt))
    .limit(AVOID_BATCHES);

  const titles = new Set<string>();
  for (const row of rows) {
    for (const title of titlesOf(safeParse(row.recipes))) {
      if (titles.size >= AVOID_TITLES) return [...titles];
      titles.add(title);
    }
  }

  return [...titles];
}

/**
 * Nur die Titel aus einer gespeicherten Zeile.
 *
 * Und ausdrücklich nicht parseRecipes(): das prüft und kürzt für jedes der
 * rund neun Rezepte auch Emoji, Beschreibung, bis zu zwanzig Zutaten und
 * ebenso viele Schritte -- gut vierhundert Zeichenketten, von denen hier eine
 * je Rezept überlebt. Das lief bisher in der Anfrage, vor der jemand wartet.
 */
function titlesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const titles: string[] = [];
  for (const entry of value.slice(0, MAX_RECIPES)) {
    if (typeof entry !== "object" || entry === null) continue;
    const title = text((entry as Record<string, unknown>).title);
    if (title) titles.push(title);
  }
  return titles;
}

/**
 * Was diese Liste gerade noch erzeugen darf.
 *
 * Die Bremse gegen ein leergelaufenes Kontingent. "Der Knopf ist während der
 * Anfrage gesperrt" ist keine: jedes Mitglied kann die Route mit curl in
 * einer Schleife anstoßen, und das Kontingent des Schlüssels ist das einzige
 * Kostenlimit, das dieses Feature hat. Pro Liste und nicht pro Nutzer, weil
 * der Vorrat der Liste gehört -- und weil sonst drei Mitglieder dreimal
 * dasselbe Kontingent verbrauchen dürften.
 *
 * Über die Tabelle und nicht über einen Zähler im Speicher wie
 * lib/attempt-limit.ts: die Zeilen stehen ohnehin schon da, und ein Neustart
 * soll diese Grenze nicht zurücksetzen.
 *
 * Zurück kommt nicht nur "darfst du", sondern auch "wie viele noch" und "ab
 * wann wieder". Der Grund steht in der Beschwerde, aus der das entstanden ist:
 * Eine Grenze, die man erst durch eine Fehlermeldung kennenlernt, fühlt sich
 * wie eine Störung an -- eine, die vorher an der Schaltfläche steht, wie eine
 * Regel. Deshalb liest auch die Seite dieselbe Funktion und nicht nur die
 * Route.
 *
 * Beide Fenster rollen (letzte 60 Minuten, letzte 24 Stunden) und richten sich
 * bewusst nicht nach Googles Tageswechsel um Mitternacht Pazifikzeit: Das hier
 * ist unser Budget, nicht deren, und ein rollendes Fenster kann niemand durch
 * Warten auf 9 Uhr morgens ausnutzen.
 *
 * `state` entsteht hier und nur hier -- die Form steht in ./types.
 */
export async function getRecipeBudget(listId: number): Promise<RecipeBudget> {
  const now = Date.now();
  const dayAgo = new Date(now - DAY_MS);

  // Absteigend und an der Notbremse abgeschnitten: Mehr Zeilen als die kann
  // es im Fenster nicht geben, und alles darunter braucht die Rechnung.
  const rows = await db
    .select({ createdAt: recipeSuggestions.createdAt })
    .from(recipeSuggestions)
    .where(and(eq(recipeSuggestions.listId, listId), gte(recipeSuggestions.createdAt, dayAgo)))
    .orderBy(desc(recipeSuggestions.createdAt))
    .limit(MAX_BATCHES_PER_DAY_HARD);

  const hourAgo = now - HOUR_MS;
  const inHour = rows.filter((row) => row.createdAt.getTime() >= hourAgo);

  const hourLeft = Math.max(0, MAX_BATCHES_PER_HOUR - inHour.length);
  const dayLeft = Math.max(0, MAX_BATCHES_PER_DAY - rows.length);
  const hardLeft = Math.max(0, MAX_BATCHES_PER_DAY_HARD - rows.length);

  // Wann ein Platz frei wird: nicht wenn der älteste Stapel hinausrutscht,
  // sondern wenn der `limit`-neueste es tut. Bei genau ausgeschöpftem Budget
  // ist das dasselbe -- seit die Bestätigung die weichen Grenzen überschreiten
  // darf, aber nicht mehr. Stehen zehn Stapel in der Stunde, wird der erste
  // Platz frei, wenn der fünftneueste eine Stunde alt ist, und nicht schon
  // beim ältesten.
  const freesAt = (entries: typeof rows, limit: number, windowMs: number) => {
    const entry = entries[limit - 1];
    return entry ? entry.createdAt.getTime() + windowMs : null;
  };

  // Sind beide weichen Fenster voll, zählt der spätere der beiden Zeitpunkte:
  // Der Tag gäbe sonst eine Zusage, die die Stunde nicht hält.
  const deadlines = [
    hourLeft === 0 ? freesAt(inHour, MAX_BATCHES_PER_HOUR, HOUR_MS) : null,
    dayLeft === 0 ? freesAt(rows, MAX_BATCHES_PER_DAY, DAY_MS) : null,
  ].filter((value): value is number => value !== null);

  const hardDeadline =
    hardLeft === 0 ? freesAt(rows, MAX_BATCHES_PER_DAY_HARD, DAY_MS) : null;

  // Die Notbremse zuerst: Sie kennt kein Überschreiben, also ist "blocked"
  // stärker als "braucht Bestätigung", auch wenn beides zugleich zutrifft.
  const state: RecipeBudgetState =
    hardLeft === 0 ? "blocked" : hourLeft === 0 || dayLeft === 0 ? "needsOverride" : "ok";

  return {
    state,
    hourLeft,
    dayLeft,
    hardLeft,
    freeAt: deadlines.length > 0 ? new Date(Math.max(...deadlines)).toISOString() : null,
    hardFreeAt: hardDeadline === null ? null : new Date(hardDeadline).toISOString(),
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Schreibt einen fertigen Batch und gibt ihn geparst zurück. */
export async function saveSuggestion(
  listId: number,
  userId: string,
  recipes: Recipe[],
  basis: RecipeBasis[],
): Promise<ParsedSuggestion> {
  const [row] = await db
    .insert(recipeSuggestions)
    .values({
      listId,
      createdById: userId,
      createdAt: new Date(),
      recipes: JSON.stringify(recipes),
      basedOn: JSON.stringify(basis),
    })
    .returning();

  return parseSuggestion(row);
}
