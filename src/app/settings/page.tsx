import { Suspense } from "react";
import { RecipesSettingsRow } from "@/components/recipes-settings-row";
import { SettingsScreen } from "@/components/settings-screen";

/**
 * The page is only the shell -- the screen itself lives in
 * components/settings-screen.tsx.
 *
 * Split apart because a single row needs an answer from the server: whether
 * "Rezepte" shows up here hangs on GEMINI_API_KEY, and only the server reads
 * that. The screen stays a client component (theme, session, two fetches), and
 * a client component cannot render a server component -- so the page hands it
 * in as a prop. Same shape as `settingsEntry` in app/page.tsx.
 *
 * Behind <Suspense>, because RecipesSettingsRow reads the environment and
 * needs a `connection()` for it: without the boundary that would pull the
 * whole page out of the prerender. No fallback, because the common case is
 * "no row" -- reserved space at the end of the card would then sit empty.
 *
 * The key is not decorative: React passes a Suspense boundary that crosses the
 * server/client boundary as a prop along as a list, and otherwise logs "Each
 * child in a list should have a unique key prop" to the console.
 */
export default function SettingsPage() {
  return (
    <SettingsScreen
      recipesRow={
        <Suspense key="recipes-settings-row" fallback={null}>
          <RecipesSettingsRow />
        </Suspense>
      }
    />
  );
}
