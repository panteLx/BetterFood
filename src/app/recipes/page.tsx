import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ListSwitcher } from "@/components/list-switcher";
import { RecipeSuggestions } from "@/components/recipe-suggestions";
import { requireActiveList, requireSession } from "@/lib/session";
import { getListsWithCounts } from "@/lib/data";
import {
  getRecipeBudget,
  getRecipeSuggestions,
  hasCookableItems,
  isRecipesConfigured,
} from "@/lib/recipes";
import { isMealieConfigured } from "@/lib/mealie";
import type { SuggestionView } from "@/lib/recipes/types";

export const metadata: Metadata = {
  title: "Rezepte",
  description: "Vorschläge aus dem, was als Nächstes abläuft.",
};

/**
 * Die Rezeptvorschläge einer Liste.
 *
 * Aufbau wie app/inventory/page.tsx und nicht wie app/archive/page.tsx: der
 * Inhalt hängt am heutigen Tag (welche Artikel sind noch nicht abgelaufen?),
 * und ein `new Date()` im Server-Render ist unter cacheComponents:true ein
 * "unstable value", der den Prerender der ganzen Route abbricht -- gemeldet
 * als "Route /recipes: Next.js encountered the unstable value `new Date()`
 * while prerendering". Unterhalb der <Suspense>-Grenze mit einem
 * vorangestellten connection() ist genau dieser Teil vom Prerender
 * ausgenommen: die Hülle wird vorgerendert, der Inhalt kommt zur Laufzeit.
 */
export default function RecipesPage() {
  return (
    <div className="flex flex-1 flex-col gap-4.5 pt-2 pb-4">
      <Suspense fallback={<RecipesFallback />}>
        <ResolvedRecipes />
      </Suspense>
    </div>
  );
}

async function ResolvedRecipes() {
  // Vor jedem Zugriff, der den heutigen Tag braucht -- dieselbe Begründung
  // wie in lib/oidc.ts und lib/registration.ts.
  await connection();

  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [suggestions, cookable, myLists, budget] = await Promise.all([
    getRecipeSuggestions(listId),
    hasCookableItems(listId),
    getListsWithCounts(session.user.id),
    // Damit unter dem Knopf steht, wie viele Vorschläge noch gehen, bevor
    // jemand drückt -- und nicht erst danach als Fehlermeldung.
    getRecipeBudget(listId),
  ]);

  // Date -> ISO an der Grenze zur Client-Komponente: die Antwort der Route
  // liefert dasselbe Feld als Zeichenkette, und ein frisch vorangestellter
  // Stapel soll nicht anders aussehen als die geladenen.
  const view: SuggestionView[] = suggestions.map((suggestion) => ({
    ...suggestion,
    createdAt: suggestion.createdAt.toISOString(),
  }));

  return (
    <>
      {/* Kopf wie im Archiv und nicht wie auf einer Unterseite: seit die
          Rezepte einen eigenen Platz in der Leiste haben, führt kein Weg
          mehr "zurück" -- ein Pfeil links oben zeigte auf die zuletzt
          besuchte Seite und damit jedes Mal woandershin. Der Listenwechsel
          steht dafür da, wo er auf jeder Listenseite steht: Vorschläge
          gehören der Liste, nicht dem Nutzer, und wer abends kocht, sieht
          die vom Mittag. */}
      <div className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight">Rezepte</h1>
          <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
            Gekocht aus dem, was als Nächstes abläuft
          </p>
        </div>
        <ListSwitcher activeListId={listId} lists={myLists} />
      </div>
      {/* Der key ist hier keine Optimierung, sondern die Korrektur eines
          Fehlers: RecipeSuggestions haelt die Vorschlaege in useState, und
          ein Zustand, der einmal gesetzt ist, aendert sich nicht mehr, nur
          weil neue Props hereinkommen. Der Listenwechsel loest zwar ein
          router.refresh() aus (siehe ListSwitcher), die Seite lieferte
          danach auch die richtigen Zeilen -- angezeigt wurden aber weiter
          die der alten Liste, bis jemand von Hand neu lud. Mit der Listen-ID
          als key baut React die Komponente neu auf, statt sie
          weiterzuverwenden.

          isMealieConfigured() und isRecipesConfigured() stehen hier in ihrer
          synchronen Fassung: Das connection() ganz oben nimmt diese Komponente
          ohnehin aus dem Prerender, die Werte werden also im laufenden
          Container gelesen und nicht in dem, der das Image gebaut hat. */}
      <RecipeSuggestions
        key={listId}
        initialSuggestions={view}
        configured={isRecipesConfigured()}
        hasItems={cookable}
        initialBudget={budget}
        mealieEnabled={isMealieConfigured()}
      />
    </>
  );
}

/** Kopfzeile, Knopf und eine Karte -- in den Maßen, die gleich echt dastehen. */
function RecipesFallback() {
  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-52 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="flex flex-col gap-3 px-5">
        <div className="h-13 animate-pulse rounded-[18px] bg-muted" />
        <div className="h-[248px] animate-pulse rounded-[24px] bg-muted" />
      </div>
    </>
  );
}
