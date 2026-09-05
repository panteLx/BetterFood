import Link from "next/link";
import { ChevronRight, CookingPot } from "lucide-react";
import { getRecipesEnabled } from "@/lib/recipes";

/**
 * The way to the recipes when the bottom bar no longer has one.
 *
 * The literal counterpart to SettingsEntry: with a key, "Rezepte" sits in the
 * bar and the settings move to the head of the home screen; without one,
 * "Mehr" returns to the bar and /recipes was left with no entry point at all.
 * Two ways to the same page are one too many -- so exactly one of the two
 * components ever renders, never both.
 *
 * Without an entry point the page is not merely inconvenient but unreachable,
 * and there is other people's data behind it: whoever removes the key later,
 * or has not set it again after a move, would lose the suggestions they
 * already generated even though they sit unchanged in the database. The page
 * itself has long handled that case -- it swaps the button for a notice and
 * keeps showing the batches (RecipeSuggestions, `configured`).
 *
 * A server component of its own rather than a flag in SettingsScreen: the
 * answer hangs on GEMINI_API_KEY, which is read in the running container, and
 * the `connection()` inside getRecipesEnabled() would otherwise pull the whole
 * settings page out of the prerender. Here it only affects this one row.
 *
 * The divider is a border-t on this row and not a border-b on the last row
 * above: the card cannot know whether this slot renders anything or null --
 * were the line up there, it would hang below the last row in mid-air
 * whenever the key is set.
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
