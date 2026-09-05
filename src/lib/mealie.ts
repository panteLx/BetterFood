import "server-only";
import { connection } from "next/server";
import type { Recipe } from "@/lib/recipes/types";

/**
 * Export of a generated recipe into a Mealie instance.
 *
 * The counterpart to lib/recipes/: that one produces a suggestion, this one
 * hands it to the recipe manager the household actually cooks from. Same
 * division of labour as everywhere else here -- the route below
 * (api/recipes/export) only does session, status codes and wording, the
 * dealings with the foreign server happen in this file.
 *
 * Server-side without exception, and that is not a preference: the CSP is
 * `connect-src 'self'` (next.config.ts), so the browser may not call Mealie
 * at all. Same reason Open Food Facts is fetched in lib/off.ts and not in the
 * scanner component.
 */

/**
 * Why an export failed.
 *
 * One error type with a discriminator instead of five classes -- the route
 * maps `kind` onto a status code and a sentence, and all cases sit in one
 * table there instead of in five catch branches. Modelled on
 * RecipeGenerationError in lib/recipes/index.ts.
 *
 * The distinction that matters to the person pressing the button is between
 * "this server is misconfigured" (auth, unreachable) and "try again"
 * (timeout, upstream): the first two are for whoever runs the container, and
 * nothing about pressing again will fix them.
 */
export class MealieExportError extends Error {
  constructor(
    readonly kind: "auth" | "unreachable" | "timeout" | "rejected" | "upstream",
    message: string,
  ) {
    super(message);
    this.name = "MealieExportError";
  }
}

/**
 * How long a single Mealie request may take.
 *
 * An export is three requests one after the other (see exportRecipe), so the
 * worst case a person waits for is three times this. 8 seconds each is
 * generous for a self-hosted instance on the same network and still short
 * enough that a Mealie that has gone away does not leave the button spinning
 * for a minute.
 */
const REQUEST_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Deliberately a function and not a module constant: it is read at call time,
 * in the running container with its environment -- not in the process that
 * built the image at some point. Same reasoning as isRecipesConfigured() in
 * lib/recipes/index.ts and isOidcConfigured() in lib/oidc.ts.
 *
 * Both values or neither. A URL without a token would produce a button that
 * always answers 401, and a token without a URL has nowhere to go.
 */
export function isMealieConfigured(): boolean {
  return Boolean(process.env.MEALIE_URL?.trim() && process.env.MEALIE_TOKEN?.trim());
}

/**
 * The same for server components -- with the `connection()` in front.
 *
 * Without it Next prerenders the answer with the value from build time, and
 * that is exactly the mistake isMealieConfigured() alone cannot prevent: it
 * is left to the caller, and the fourth caller forgets. Route handlers do not
 * need it (requireSession() makes them dynamic anyway) and keep using the
 * synchronous form.
 */
export async function getMealieEnabled(): Promise<boolean> {
  await connection();
  return isMealieConfigured();
}

/**
 * The instance address, without a trailing slash.
 *
 * The pathname survives on purpose: Mealie behind a reverse proxy under
 * `https://haus.example/mealie` is a normal setup, and cutting to the origin
 * would send every request to the wrong place. Only the trailing slash goes,
 * because every path below is written with a leading one.
 *
 * A bad value throws as "unreachable" rather than crashing at startup: this
 * is an optional feature, and a typo in MEALIE_URL should cost the export
 * button, not the whole app.
 */
function baseUrl(): string {
  const raw = process.env.MEALIE_URL?.trim() ?? "";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MealieExportError("unreachable", `MEALIE_URL ist keine gültige Adresse: "${raw}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MealieExportError(
      "unreachable",
      `MEALIE_URL muss mit http:// oder https:// beginnen, nicht mit "${parsed.protocol}"`,
    );
  }

  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// The connection to Mealie
// ---------------------------------------------------------------------------

/**
 * One request to Mealie, with all the ways it can go wrong sorted out.
 *
 * The response body is parsed but never handed on verbatim: Mealie answers a
 * 422 with a full pydantic validation tree, and that belongs in the operator's
 * log, not in a toast on someone's phone. What leaves this function is the
 * `kind` -- the route turns it into a sentence.
 */
async function call(
  path: string,
  init?: { method: "POST" | "PUT"; body: unknown },
): Promise<unknown> {
  const token = process.env.MEALIE_TOKEN?.trim() ?? "";
  const url = `${baseUrl()}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init ? { "Content-Type": "application/json" } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // No caching for any of this: two of the three requests write, and the
      // third reads back what the first just created.
      cache: "no-store",
    });
  } catch (error) {
    // AbortSignal.timeout() aborts with a TimeoutError, everything else here
    // is DNS, a refused connection or a broken certificate. Worth telling
    // apart, because only one of the two is worth a second press.
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new MealieExportError("timeout", `Mealie hat auf ${path} nicht rechtzeitig geantwortet`);
    }
    throw new MealieExportError("unreachable", `Mealie ist unter ${baseUrl()} nicht erreichbar`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new MealieExportError("auth", `Mealie hat den Token abgelehnt (${res.status} auf ${path})`);
  }

  if (!res.ok) {
    // The body goes into the message and therefore into the log -- a 422 says
    // exactly which field Mealie disliked, and without it a version mismatch
    // is unfindable. Capped, because that validation tree can be pages long.
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new MealieExportError(
      res.status >= 500 ? "upstream" : "rejected",
      `Mealie antwortete mit ${res.status} auf ${init?.method ?? "GET"} ${path}: ${detail}`,
    );
  }

  // A 204 and an empty 200 both happen here; neither is an error, and neither
  // is JSON. Reading the text first and parsing it ourselves keeps res.json()
  // from throwing on an empty body.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new MealieExportError("upstream", `Mealie antwortete auf ${path} nicht mit JSON`);
  }
}

/**
 * The group this token belongs to -- needed only to build the link.
 *
 * Cached for the life of the process, and that is safe precisely because the
 * token comes from the environment: it cannot change while the container
 * runs, so neither can its group. Whoever swaps MEALIE_TOKEN restarts anyway.
 *
 * `undefined` means "not asked yet", `null` means "asked and did not learn
 * it" -- the difference keeps a Mealie too old to report a groupSlug from
 * being asked again on every single export.
 */
let cachedGroupSlug: string | null | undefined;

async function groupSlug(): Promise<string | null> {
  if (cachedGroupSlug !== undefined) return cachedGroupSlug;

  try {
    const self = await call("/api/users/self");
    const slug = (self as { groupSlug?: unknown } | null)?.groupSlug;
    cachedGroupSlug = typeof slug === "string" && slug ? slug : null;
  } catch {
    // Deliberately swallowed: this call exists to make the link nicer, and a
    // recipe that landed in Mealie must not be reported as a failure just
    // because we could not work out its prettiest URL.
    cachedGroupSlug = null;
  }

  return cachedGroupSlug;
}

/**
 * Where a recipe lives in the Mealie web interface.
 *
 * Two layouts, because Mealie changed it: since the households rework the
 * path is `/g/{group}/r/{slug}`, before that it was plain `/recipe/{slug}`.
 * The older form still redirects on new instances, so it is the fallback --
 * used whenever /api/users/self did not name a group.
 */
function recipeUrl(slug: string, group: string | null): string {
  return group ? `${baseUrl()}/g/${group}/r/${slug}` : `${baseUrl()}/recipe/${slug}`;
}

// ---------------------------------------------------------------------------
// Our recipe in Mealie's shape
// ---------------------------------------------------------------------------

/**
 * One ingredient line as a plain note.
 *
 * Mealie can hold ingredients structured (quantity + unit + food, which is
 * what makes scaling and shopping lists work) or as free text in `note`,
 * which the model comments as "Force Show Text - Overrides Concat". We take
 * the free text, and on purpose: our lines read "200 g Sahne", and getting
 * them structured would mean Mealie's ingredient parser, which is trained on
 * English and turns "1 Bund Petersilie" into a unit called "Bund" that then
 * clutters the household's unit list. A note shows exactly what the card
 * showed.
 *
 * `quantity: null` and not 0: the column is `Float | None`, and only the null
 * keeps Mealie from putting a leading amount in front of the note.
 * `originalText` is filled with the same string because Mealie shows it when
 * someone later re-parses the ingredient -- it is the "this is what it said
 * originally" field.
 */
function toIngredient(line: string) {
  return {
    quantity: null,
    unit: null,
    food: null,
    title: null,
    note: line,
    originalText: line,
  };
}

/**
 * The note that explains why this recipe exists.
 *
 * `uses` and `buy` are the whole point of a suggestion -- what it rescues and
 * what still has to be bought -- and Mealie's schema has no field for either.
 * Without this they would simply be dropped at the border, and the recipe
 * would arrive as an ordinary recipe from nowhere. `notes` is the one free
 * text area Mealie shows on the recipe page, so that is where it goes.
 *
 * Returns an array so the caller can spread it: with neither list filled
 * there is nothing worth saying, and an empty note block on every exported
 * recipe would be noise.
 */
function provenanceNotes(recipe: Recipe): { title: string; text: string }[] {
  const lines: string[] = [];
  if (recipe.uses.length > 0) lines.push(`Aus dem Vorrat: ${recipe.uses.join(", ")}`);
  if (recipe.buy.length > 0) lines.push(`Noch zu kaufen: ${recipe.buy.join(", ")}`);
  if (lines.length === 0) return [];

  return [{ title: "Aus deinem Vorrat vorgeschlagen", text: lines.join("\n\n") }];
}

/**
 * Sends one recipe to Mealie and returns where it landed.
 *
 * Three requests, and the detour is deliberate. Mealie's `POST /api/recipes`
 * accepts nothing but `{ name }` and answers with the slug -- everything else
 * has to follow as a `PUT /api/recipes/{slug}`, and that PUT wants a whole
 * recipe object, not a patch. Rather than assembling that object from our own
 * idea of Mealie's schema, we read back what Mealie just created and change
 * only the fields we actually have. That is what makes this survive version
 * drift: self-hosted instances range from 1.x to current, `settings` and
 * `recipeServings` have moved and been renamed in that span, and every field
 * we do not touch keeps whatever default that particular Mealie chose.
 *
 * The title is not made unique beforehand: Mealie appends a counter to the
 * slug by itself when the name is taken, so exporting the same suggestion
 * twice gives two recipes rather than an error -- which is the friendlier of
 * the two, given the button does not remember across a reload.
 */
export async function exportRecipe(recipe: Recipe): Promise<{ slug: string; url: string }> {
  const created = await call("/api/recipes", { method: "POST", body: { name: recipe.title } });

  // Mealie answers this one with the bare slug as a JSON string. Older
  // versions wrap it in an object, so both are accepted -- it is one line
  // here and an unexplainable failure on someone else's instance otherwise.
  const slug =
    typeof created === "string"
      ? created
      : typeof (created as { slug?: unknown } | null)?.slug === "string"
        ? ((created as { slug: string }).slug)
        : null;

  if (!slug) {
    throw new MealieExportError("upstream", "Mealie hat auf das Anlegen keinen Slug zurückgegeben");
  }

  const current = await call(`/api/recipes/${encodeURIComponent(slug)}`);
  if (typeof current !== "object" || current === null) {
    throw new MealieExportError("upstream", `Mealie lieferte das angelegte Rezept ${slug} nicht zurück`);
  }

  await call(`/api/recipes/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: {
      ...current,
      name: recipe.title,
      description: recipe.description,
      recipeIngredient: recipe.ingredients.map(toIngredient),
      recipeInstructions: recipe.steps.map((text) => ({ text })),
      notes: provenanceNotes(recipe),
      // Where it came from. BETTER_AUTH_URL is this instance as the browser
      // reaches it, so the link works from the same places the app does; if
      // it is unset (dev), the field stays at whatever Mealie had.
      orgURL: process.env.BETTER_AUTH_URL
        ? `${process.env.BETTER_AUTH_URL.replace(/\/+$/, "")}/recipes`
        : (current as { orgURL?: string }).orgURL,
    },
  });

  return { slug, url: recipeUrl(slug, await groupSlug()) };
}
