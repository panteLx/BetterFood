import Link from "next/link";
import { ChevronRight, CookingPot } from "lucide-react";
import { getRecipesEnabled } from "@/lib/recipes";

/**
 * Der Weg zu den Rezepten, wenn die Fußleiste keinen mehr hat.
 *
 * Das Gegenstück zu SettingsEntry, und zwar wörtlich: Mit Schlüssel steht
 * „Rezepte" in der Leiste und die Einstellungen ziehen an den Kopf der
 * Startseite; ohne Schlüssel kehrt „Mehr" in die Leiste zurück und /recipes
 * hatte danach überhaupt kein Ziel mehr. Zwei Wege zur selben Seite sind
 * einer zu viel -- deshalb rendert genau eine der beiden Komponenten etwas,
 * nie beide.
 *
 * Ohne Ziel wäre die Seite nicht bloß unbequem, sondern unerreichbar, und
 * dahinter liegen fremde Daten: Wer den Schlüssel nachträglich entfernt oder
 * ihn nach einem Umzug noch nicht wieder gesetzt hat, hätte seine bereits
 * erzeugten Vorschläge verloren, obwohl sie unverändert in der Datenbank
 * stehen. Die Seite selbst kommt mit dem Fall längst zurecht: Sie tauscht
 * nur den Knopf gegen einen Hinweis und zeigt die Stapel weiter
 * (RecipeSuggestions, `configured`).
 *
 * Eine eigene Server-Komponente und kein Schalter in SettingsScreen: Die
 * Antwort hängt an GEMINI_API_KEY, der im laufenden Container gelesen wird,
 * und das nötige `connection()` in getRecipesEnabled() zöge sonst die ganze
 * Einstellungsseite aus dem Prerender. Hier betrifft es nur diese Zeile.
 *
 * Der Trennstrich sitzt als border-t an dieser Zeile und nicht als border-b
 * an der letzten darüber: Die Karte weiß nicht, ob dieser Platzhalter etwas
 * rendert oder null -- läge der Strich oben, hinge er ohne Schlüssel unter
 * der letzten Zeile in der Luft.
 */
export async function RecipesSettingsRow() {
  if (await getRecipesEnabled()) return null;

  return (
    <Link
      href="/recipes"
      className="flex items-center gap-3 border-t border-hairline px-4 py-3.5"
    >
      <span className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary">
        <CookingPot className="size-4" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[15px] font-bold">Rezepte</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug font-medium text-muted-foreground">
          Frühere Vorschläge ansehen
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint" strokeWidth={2} />
    </Link>
  );
}
