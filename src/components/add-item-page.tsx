import { ItemForm } from "@/components/item-form";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";

/**
 * standalone = als echte Seite geoeffnet (Deep-Link, Home-Bildschirm-Shortcut,
 * Neuladen), nicht als abgefangenes Modal. Dann darf nach dem Speichern kein
 * router.back() laufen -- das fuehrte aus der App heraus auf eine leere Seite.
 */
export async function AddItemPage({ standalone = false }: { standalone?: boolean } = {}) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const allCategories = await getCategoriesForList(listId);

  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Manuell hinzufügen</h1>
      </div>
      <ItemForm categories={allCategories} redirectTo={standalone ? "/" : undefined} />
    </div>
  );
}
