import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { getRecipesEnabled } from "@/lib/recipes";

/**
 * Der Weg zu den Einstellungen, wenn die Fußleiste keinen mehr hat.
 *
 * Mit Rezeptdienst sind die fünf Plätze der Leiste an Start, Vorrat,
 * Hinzufügen, Rezepte und Archiv vergeben (siehe RIGHT-Items in
 * components/bottom-nav.tsx) -- "Mehr" muss weichen, weil es von allen
 * Zielen am seltensten gebraucht wird. Seltener heißt aber nicht versteckt:
 * hier oben rechts steht es auf dem Bildschirm, den ohnehin jeder als Erstes
 * sieht, neben dem Listenwechsel und in derselben Form wie er.
 *
 * Ohne Schlüssel wird der Platz in der Leiste frei, "Mehr" steht wieder da,
 * und dieser Knopf verschwindet -- zwei Wege zur selben Seite auf einem
 * Bildschirm sind einer zu viel.
 *
 * Eine eigene Server-Komponente und kein Schalter an HomeOverview: die
 * Antwort hängt an GEMINI_API_KEY, und der wird im laufenden Container
 * gelesen. Läge die Abfrage in der Seite, zöge das `connection()` in
 * getRecipesEnabled() die ganze Startseite aus dem Prerender; hier betrifft es
 * nur diesen Knopf.
 */
export async function SettingsEntry() {
  if (!(await getRecipesEnabled())) return null;

  return (
    <Link
      href="/settings"
      aria-label="Einstellungen"
      title="Einstellungen"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-row outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <SlidersHorizontal className="size-4.5 text-muted-foreground" strokeWidth={2.2} />
    </Link>
  );
}
