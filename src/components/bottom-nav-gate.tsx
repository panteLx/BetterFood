import { connection } from "next/server";
import { optionalSession } from "@/lib/session";
import { isRecipesConfigured } from "@/lib/recipes";
import { BottomNav } from "@/components/bottom-nav";

/**
 * Die Navigationsleiste hat ohne Anmeldung keinen Sinn: Start, Archiv und
 * Einstellungen sind allesamt geschützt und führen nur zurück auf /login --
 * auf Splash, Onboarding und den Anmeldeseiten stünde sie als reine
 * Sackgasse im Weg.
 *
 * Die Prüfung gehört auf den Server: der Client kann die Session nicht sehen,
 * und ein kurz eingeblendetes und wieder verschwindendes Menü wäre schlechter
 * als eines, das einen Wimpernschlag später erscheint. Deshalb steht im
 * Layout auch kein Platzhalter mehr unter dem Suspense.
 */
export async function BottomNavGate() {
  const session = await optionalSession();
  if (!session) return null;

  // Vor dem Blick in die Umgebung: welches Ziel auf dem vierten Platz steht,
  // haengt an GEMINI_API_KEY, und der wird im laufenden Container gelesen und
  // nicht in dem Prozess, der das Image gebaut hat. Ohne connection() wuerde
  // Next die Leiste mit dem Wert vom Bauzeitpunkt vorrendern -- dieselbe
  // Begruendung wie in lib/oidc.ts.
  await connection();

  return <BottomNav recipes={isRecipesConfigured()} />;
}
