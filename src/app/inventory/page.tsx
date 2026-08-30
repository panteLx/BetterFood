import { Suspense } from "react";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { InventoryList } from "@/components/inventory-list";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getListsWithCounts, getPlacesForList } from "@/lib/data";

/**
 * Der vollstaendige Vorrat, getrennt von der Startseite.
 *
 * Vorher war beides dieselbe Seite: die Startseite zeigte die komplette
 * Liste, und die Frage "was muss ich heute aufbrauchen?" ging zwischen 40
 * Artikeln unter. Jetzt beantwortet die Startseite genau diese Frage, und
 * hier steht alles -- durchsuchbar, filterbar und wahlweise nach Ablauf, Ort
 * oder Kategorie gruppiert.
 */
export default function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  return (
    <div className="flex flex-1 flex-col pb-4">
      {/* "await searchParams" muss unterhalb einer <Suspense>-Grenze
          passieren, sonst blockiert die Navigation komplett den Server-Render
          (Next 16 "Instant Navigation"-Validierung, siehe
          node_modules/next/dist/docs/.../instant-navigation.md). */}
      <Suspense fallback={<InventoryFallback />}>
        <ResolvedInventory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ResolvedInventory({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [{ filter }, activeItems, allCategories, allPlaces, myLists] = await Promise.all([
    searchParams,
    db
      .select()
      .from(items)
      .where(and(eq(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
      .orderBy(items.expiryDate),
    getCategoriesForList(listId),
    getPlacesForList(listId),
    getListsWithCounts(session.user.id),
  ]);

  return (
    /* key=filter erzwingt einen frischen Mount pro Filter: unter
       cacheComponents:true haelt <Activity> die vorherige Instanz samt
       useState am Leben, und der ueber die Zaehler der Startseite
       angesteuerte Filter wuerde beim zweiten Mal ignoriert. */
    <InventoryList
      key={filter ?? "alle"}
      initialItems={activeItems}
      categories={allCategories}
      places={allPlaces}
      initialStatus={filter === "bald" || filter === "abgelaufen" ? filter : "alle"}
      lists={myLists}
      activeListId={listId}
    />
  );
}

function InventoryFallback() {
  return (
    <div className="flex flex-1 flex-col gap-3.5 px-5 pt-2">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-12 animate-pulse rounded-2xl bg-muted" />
      <div className="h-10 animate-pulse rounded-[13px] bg-muted" />
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-[74px] animate-pulse rounded-[20px] bg-muted" />
      ))}
    </div>
  );
}
