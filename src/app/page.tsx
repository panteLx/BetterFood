import { db } from "@/db";
import { items, listMembers, lists } from "@/db/schema";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { HomeOverview } from "@/components/home-overview";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";

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
    // ab. Drei Spalten pro abgehaktem Artikel sind guenstig genug, dass sich
    // das Zurechtschneiden im Client lohnt.
    db
      .select({ status: items.status, quantity: items.quantity, resolvedAt: items.resolvedAt })
      .from(items)
      .where(
        and(ne(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)),
      ),
    db
      .select({
        id: lists.id,
        name: lists.name,
        // Unterabfragen statt zweier weiterer Joins: ein Join ueber Artikel
        // UND Mitglieder gleichzeitig vervielfacht die Zeilen und zaehlt
        // beides falsch.
        itemCount: sql<number>`(
          select count(*) from ${items}
          where ${items.listId} = ${lists.id}
            and ${items.status} = 'active'
            and ${items.hiddenAt} is null
        )`,
        memberCount: sql<number>`(
          select count(*) from ${listMembers} where ${listMembers.listId} = ${lists.id}
        )`,
      })
      .from(lists)
      .innerJoin(listMembers, eq(listMembers.listId, lists.id))
      .where(and(eq(listMembers.userId, session.user.id), isNull(lists.archivedAt)))
      .orderBy(asc(lists.createdAt)),
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
