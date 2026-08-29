import { ItemForm } from "@/components/item-form";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";

/**
 * standalone = als echte Seite geoeffnet (Deep-Link, Home-Bildschirm-Shortcut,
 * Neuladen), nicht als abgefangenes Modal. Dann darf nach dem Abbrechen kein
 * router.back() laufen -- das fuehrte aus der App heraus auf eine leere Seite.
 */
export async function AddItemPage({ standalone = false }: { standalone?: boolean } = {}) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [allCategories, allPlaces] = await Promise.all([
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  return (
    <ItemForm
      title="Von Hand eintragen"
      categories={allCategories}
      places={allPlaces}
      redirectTo={standalone ? "/" : undefined}
    />
  );
}
