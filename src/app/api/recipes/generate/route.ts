import { NextResponse } from "next/server";
import { requireActiveList, requireSession } from "@/lib/session";
import {
  MAX_BATCHES_PER_DAY,
  MAX_BATCHES_PER_DAY_HARD,
  MAX_BATCHES_PER_HOUR,
  RecipeGenerationError,
  generateRecipes,
  getRecipeBudget,
  isRecipesConfigured,
  recentRecipeTitles,
  saveSuggestion,
  selectRecipeBasis,
} from "@/lib/recipes";

/**
 * Wer gerade einen Vorschlag erzeugt.
 *
 * Die Stundenbremse allein hat ein Loch: fünf gleichzeitig abgeschickte
 * Anfragen zählen alle noch die Null von vorhin und laufen alle durch. Ein
 * Vorschlag auf einmal pro Person schließt es -- niemand lässt sich zwei
 * Rezeptstapel gleichzeitig vorschlagen.
 *
 * Im Speicher und pro Prozess, dieselbe Bauart wie in api/receipt/parse: die
 * App läuft als ein einzelner Container, und ein Neustart soll den Eintrag
 * ohnehin vergessen.
 */
const generating = new Set<string>();

/** Welcher Fehler welchen Statuscode und welchen Satz bekommt. */
const FAILURES: Record<RecipeGenerationError["kind"], { status: number; error: string }> = {
  // Ausdrücklich "bei Google", und das ist eine Lehre aus dem Betrieb: Wer
  // gerade auf "Trotzdem vorschlagen" gedrückt hat, liest ein blankes
  // "Kontingent aufgebraucht" als Fehlfunktion unserer eigenen Grenze --
  // schließlich hat er die eben erst ausdrücklich überschrieben. Erst wenn
  // dasteht, wessen Kontingent gemeint ist, ergibt die Meldung einen Sinn.
  // Erreicht wird sie ohnehin nur, wenn ALLE Modelle der Kette abgelehnt
  // haben (siehe generateRecipes).
  quota: {
    status: 429,
    error:
      "Google hat für diesen Schlüssel kein Kontingent mehr – das ist nicht unsere Grenze. Es setzt sich von selbst zurück, spätestens morgen.",
  },
  // Erst wenn auch das letzte Modell der Kette ausgelastet war -- vorher
  // wechselt lib/recipes.ts von selbst weiter.
  overloaded: {
    status: 503,
    error: "Der Rezeptdienst ist gerade überlastet. In ein paar Minuten noch einmal versuchen.",
  },
  timeout: {
    status: 504,
    error: "Der Dienst hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen.",
  },
  upstream: {
    status: 502,
    error: "Der Dienst konnte gerade nichts vorschlagen. Bitte noch einmal versuchen.",
  },
  unusable: {
    status: 502,
    error: "Die Antwort war unbrauchbar. Bitte noch einmal versuchen.",
  },
};

/**
 * Erzeugt einen Stapel Rezeptvorschläge aus dem, was bald abläuft.
 *
 * Fachlich passiert alles in lib/recipes.ts -- hier stehen nur Sitzung,
 * Schranken und Statuscodes.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  // Der Knopf schickt normalerweise keinen Rumpf -- ein fehlender oder
  // kaputter zaehlt deshalb als "kein Ueberschreiben" und nicht als Fehler.
  const body = (await request.json().catch(() => null)) as { override?: unknown } | null;
  const override = body?.override === true;

  if (!isRecipesConfigured()) {
    return NextResponse.json(
      { error: "Rezeptvorschläge sind auf diesem Server nicht eingerichtet." },
      { status: 503 },
    );
  }

  if (generating.has(session.user.id)) {
    return NextResponse.json(
      { error: "Es werden bereits Rezepte gesucht. Einen Moment noch." },
      { status: 429 },
    );
  }

  // Das Budget geht bei jeder Antwort mit zurueck, auch bei dieser Absage:
  // Die Seite zeigt es unter dem Knopf an, und sie soll es nicht schaetzen
  // muessen. Der erschoepfte Fall ist damit derselbe Datensatz wie der
  // erlaubte, nur mit Null darin.
  const budget = await getRecipeBudget(listId);

  // Die Notbremse zuerst, und die kennt kein Ueberschreiben: Sie faengt die
  // Endlosschleife und den steckengebliebenen Finger ab, und beide wuerden
  // ein `override: true` genauso mitschicken wie ein Mensch.
  if (budget.hardLeft === 0) {
    return NextResponse.json(
      {
        error: `Auch mit Bestätigung ist bei ${MAX_BATCHES_PER_DAY_HARD} Vorschlägen am Tag Schluss.`,
        budget,
      },
      { status: 429 },
    );
  }

  // Die beiden weichen Grenzen darf ueberschreiten, wer im Dialog ausdruecklich
  // bestaetigt hat. Serverseitig gelesen und nicht im Knopf entschieden: Der
  // graue Knopf ist die Hoeflichkeitsform, die Grenze liegt hier.
  if ((budget.hourLeft === 0 || budget.dayLeft === 0) && !override) {
    return NextResponse.json(
      {
        error:
          budget.hourLeft === 0
            ? `Höchstens ${MAX_BATCHES_PER_HOUR} Vorschläge pro Stunde.`
            : `Höchstens ${MAX_BATCHES_PER_DAY} Vorschläge pro Tag.`,
        budget,
      },
      { status: 429 },
    );
  }

  if (override && (budget.hourLeft === 0 || budget.dayLeft === 0)) {
    // Ins Log, weil es der Betreiber sehen koennen muss: Wenn das Kontingent
    // des Schluessels ueberraschend leer ist, steht hier, woher.
    console.warn(
      `Rezeptvorschlag: Liste ${listId} erzeugt auf eigene Verantwortung über die Grenze hinaus ` +
        `(Stunde ${budget.hourLeft}, Tag ${budget.dayLeft}, Notbremse ${budget.hardLeft})`,
    );
  }

  const basis = await selectRecipeBasis(listId);
  if (basis.length === 0) {
    return NextResponse.json(
      { error: "Dein Vorrat ist leer – es gibt nichts, woraus sich etwas kochen ließe." },
      { status: 400 },
    );
  }

  generating.add(session.user.id);
  try {
    // Erst hier und nicht oben neben der Auswahl: die Titel werden nur
    // gebraucht, wenn wirklich gefragt wird, und alle Schranken davor
    // brechen ohne sie ab.
    const recipes = await generateRecipes(basis, await recentRecipeTitles(listId));
    const suggestion = await saveSuggestion(listId, session.user.id, recipes, basis);
    // Nach dem Schreiben neu gelesen und nicht im Client heruntergezaehlt:
    // Die Liste kann mehreren Leuten gehoeren, und wer gerade auf einem
    // zweiten Geraet erzeugt hat, verbraucht dasselbe Budget.
    return NextResponse.json({ suggestion, budget: await getRecipeBudget(listId) });
  } catch (error) {
    if (error instanceof RecipeGenerationError) {
      const failure = FAILURES[error.kind];
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }
    // Alles andere ist ein Fehler in dieser App und nicht bei Google -- der
    // gehört ins Log, nicht nur in einen Toast.
    console.error("Rezeptvorschlag: unerwarteter Fehler", error);
    return NextResponse.json(
      { error: "Da ist etwas schiefgegangen. Bitte noch einmal versuchen." },
      { status: 500 },
    );
  } finally {
    // Auch wenn oben etwas wirft: ein hängengebliebener Eintrag würde das
    // Feature für diese Person bis zum Neustart sperren.
    generating.delete(session.user.id);
  }
}
