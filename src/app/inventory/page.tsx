import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { InventoryList } from "@/components/inventory-list";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";

/**
 * Der vollstaendige Vorrat, getrennt von der Startseite.
 *
 * Vorher war beides dieselbe Seite: die Startseite zeigte die komplette
 * Liste, und die Frage "was muss ich heute aufbrauchen?" ging zwischen 40
 * Artikeln unter. Jetzt beantwortet die Startseite genau diese Frage, und
 * hier steht alles -- durchsuchbar, filterbar und wahlweise nach Ablauf, Ort
 * oder Kategorie gruppiert.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [{ filter }, activeItems, allCategories, allPlaces] = await Promise.all([
    searchParams,
    db
      .select()
      .from(items)
      .where(and(eq(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
      .orderBy(items.expiryDate),
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  return (
    <div className="flex flex-1 flex-col pb-4">
      {/* key=filter erzwingt einen frischen Mount pro Filter: unter
          cacheComponents:true haelt <Activity> die vorherige Instanz samt
          useState am Leben, und der ueber die Zaehler der Startseite
          angesteuerte Filter wuerde beim zweiten Mal ignoriert. */}
      <InventoryList
        key={filter ?? "alle"}
        initialItems={activeItems}
        categories={allCategories}
        places={allPlaces}
        initialStatus={filter === "bald" || filter === "abgelaufen" ? filter : "alle"}
      />
    </div>
  );
}
