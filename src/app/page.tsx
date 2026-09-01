import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { HomeOverview } from "@/components/home-overview";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getListsWithCounts, getPlacesForList } from "@/lib/data";

export default async function HomePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [activeItems, allCategories, allPlaces, resolvedEntries, myLists] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(eq(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
      .orderBy(items.expiryDate),
    getCategoriesForList(listId),
    getPlacesForList(listId),
    // Ohne Zeitfenster: der Stichtag liesse sich hier nur ueber new Date()
    // bilden, und ein solcher "unstable value" bricht den Prerender der Route
    // ab. Vier schmale Spalten pro abgehaktem Artikel sind guenstig genug,
    // dass sich das Zurechtschneiden im Client lohnt.
    db
      .select({
        status: items.status,
        quantity: items.quantity,
        resolvedAt: items.resolvedAt,
        // Die vierte Spalte traegt die Ersparnis-Rechnung: ohne die Kategorie
        // laesst sich einem abgehakten Artikel kein Schaetzwert zuordnen.
        category: items.category,
      })
      .from(items)
      .where(
        and(ne(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)),
      ),
    getListsWithCounts(session.user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col pb-4">
      <HomeOverview
        initialItems={activeItems}
        categories={allCategories}
        places={allPlaces}
        resolvedEntries={resolvedEntries}
        lists={myLists}
        activeListId={listId}
        // Nur der Vorname: "Guten Morgen, Lena Krüger" liest sich wie ein
        // Serienbrief.
        userName={session.user.name?.split(" ")[0] || "du"}
      />
    </div>
  );
}
