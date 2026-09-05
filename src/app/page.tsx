import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { Suspense } from "react";
import { HomeOverview } from "@/components/home-overview";
import { SettingsEntry } from "@/components/settings-entry";
import { requireSession, requireActiveList } from "@/lib/session";
import {
  getCategoriesForList,
  getListsWithCounts,
  getMonthlyGoal,
  getPlacesForList,
} from "@/lib/data";

export default async function HomePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [activeItems, allCategories, allPlaces, resolvedEntries, myLists, monthlyGoal] =
    await Promise.all([
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
      // Das Monatsziel steht in settings und gehoert dem Nutzer, nicht der
      // Liste: die Fortschrittsleiste der Hero-Karte misst daran.
      getMonthlyGoal(session.user.id),
    ]);

  return (
    <div className="flex flex-1 flex-col pb-4">
      <HomeOverview
        initialItems={activeItems}
        categories={allCategories}
        places={allPlaces}
        resolvedEntries={resolvedEntries}
        monthlyGoal={monthlyGoal}
        lists={myLists}
        activeListId={listId}
        // Nur der Vorname: "Guten Morgen, Lena Krüger" liest sich wie ein
        // Serienbrief.
        userName={session.user.name?.split(" ")[0] || "du"}
        // Hinter <Suspense>, weil SettingsEntry die Umgebung liest und dafuer
        // ein connection() braucht: ohne die Grenze zoege das die ganze
        // Startseite aus dem Prerender. Ohne Platzhalter, denn der haeufigere
        // Fall ist "kein Knopf" -- 40px reservierte Luft neben dem
        // Listenwechsel waeren dann dauerhaft leer.
        //
        // Der key ist nicht dekorativ: React reicht eine Suspense-Grenze, die
        // als Prop ueber die Server/Client-Grenze geht, als Liste weiter und
        // meldet sonst "Each child in a list should have a unique key prop"
        // in der Konsole.
        settingsEntry={
          <Suspense key="settings-entry" fallback={null}>
            <SettingsEntry />
          </Suspense>
        }
      />
    </div>
  );
}
