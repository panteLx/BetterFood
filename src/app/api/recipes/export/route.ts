import { NextResponse } from "next/server";
import { requireActiveList, requireSession } from "@/lib/session";
import { getSuggestionForList } from "@/lib/recipes";
import { MealieExportError, exportRecipe, isMealieConfigured } from "@/lib/mealie";

/**
 * Who is currently exporting.
 *
 * An export is three requests to a foreign server (see lib/mealie.ts), and a
 * finger that slips on the button would send the same dish twice -- Mealie
 * takes the duplicate happily and appends a counter to the slug, so nothing
 * stops it on that side. One export at a time per person is enough; nobody
 * sends two recipes in the same second on purpose.
 *
 * In memory and per process, same build as in api/recipes/generate: the app
 * runs as a single container, and a restart is supposed to forget the entry.
 */
const exporting = new Set<string>();

/**
 * Which failure gets which status code and which sentence.
 *
 * The split that matters is between the two cases nobody at the phone can do
 * anything about -- a rejected token, an unreachable address -- and the rest.
 * Those two name the environment variable, because the person who has to fix
 * it is whoever runs the container, and the message is the only place they
 * will look first.
 */
const FAILURES: Record<MealieExportError["kind"], { status: number; error: string }> = {
  auth: {
    status: 502,
    error: "Mealie hat den Zugang abgelehnt. Der Token in MEALIE_TOKEN stimmt nicht mehr.",
  },
  unreachable: {
    status: 502,
    error: "Mealie ist nicht erreichbar. Prüfe die Adresse in MEALIE_URL.",
  },
  timeout: {
    status: 504,
    error: "Mealie hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen.",
  },
  // "Rejected" is a 4xx from Mealie and in practice means a version whose
  // recipe schema differs from what we send. The detail sits in the log, and
  // the sentence says where to look rather than pretending it is temporary.
  rejected: {
    status: 502,
    error: "Mealie konnte das Rezept nicht annehmen. Die Einzelheiten stehen im Server-Log.",
  },
  upstream: {
    status: 502,
    error: "Mealie hatte gerade ein Problem. Bitte noch einmal versuchen.",
  },
};

/**
 * Sends one recipe from a stored suggestion to Mealie.
 *
 * The body names the batch and the position within it, never the recipe
 * itself -- see getSuggestionForList for why. Everything about the foreign
 * server happens in lib/mealie.ts; here there is only session, guard rails
 * and status codes, the same division as between api/recipes/generate and
 * lib/recipes/.
 */
export async function POST(request: Request) {
  // Right at the front, before session and database: this is a look at the
  // environment and costs nothing, while requireSession() and
  // requireActiveList() together are several queries. Same order as in
  // api/recipes/generate.
  if (!isMealieConfigured()) {
    return NextResponse.json(
      { error: "Der Mealie-Export ist auf diesem Server nicht eingerichtet." },
      { status: 503 },
    );
  }

  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const body = (await request.json().catch(() => null)) as {
    suggestionId?: unknown;
    index?: unknown;
  } | null;

  // Integer.isInteger and not a truthiness check: index 0 is the first recipe
  // of every batch and therefore the most common value there is.
  const suggestionId = body?.suggestionId;
  const index = body?.index;
  if (
    typeof suggestionId !== "number" ||
    !Number.isInteger(suggestionId) ||
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0
  ) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const suggestion = await getSuggestionForList(listId, suggestionId);
  const recipe = suggestion?.recipes[index];
  // One answer for "no such batch", "belongs to another list" and "the batch
  // has fewer recipes than that": all three mean the same thing from outside,
  // and telling them apart would say whether an id exists elsewhere.
  if (!recipe) {
    return NextResponse.json({ error: "Dieses Rezept gibt es nicht mehr." }, { status: 404 });
  }

  if (exporting.has(session.user.id)) {
    return NextResponse.json(
      { error: "Es wird bereits ein Rezept übertragen. Einen Moment noch." },
      { status: 429 },
    );
  }

  exporting.add(session.user.id);
  try {
    const { url } = await exportRecipe(recipe);
    return NextResponse.json({ url, title: recipe.title });
  } catch (error) {
    if (error instanceof MealieExportError) {
      // Into the log in full: the sentence the browser gets is deliberately
      // short, and the status code Mealie actually sent -- with its 422 body
      // -- only exists here. Without it a schema mismatch on someone else's
      // instance is unfindable.
      console.error(`Mealie-Export (${error.kind}):`, error.message);
      const failure = FAILURES[error.kind];
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }
    // Anything else is a bug in this app and not at Mealie.
    console.error("Mealie-Export: unerwarteter Fehler", error);
    return NextResponse.json(
      { error: "Da ist etwas schiefgegangen. Bitte noch einmal versuchen." },
      { status: 500 },
    );
  } finally {
    // Also when something above throws: a stuck entry would lock the feature
    // for this person until the next restart.
    exporting.delete(session.user.id);
  }
}
