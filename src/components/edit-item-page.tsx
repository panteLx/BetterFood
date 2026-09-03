import { notFound } from "next/navigation";
import { ItemForm } from "@/components/item-form";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession, visibleListId } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";

/** standalone: siehe AddItemPage -- verhindert router.back() aus der App heraus. */
export async function EditItemPage({ id, standalone = false }: { id: string; standalone?: boolean }) {
  const session = await requireSession();

  // Kategorien und Fächer gehören der Liste des Artikels, nicht der gerade
  // aktiven -- sonst böte das Formular hinter einem Deep-Link die
  // Kategorien eines fremden Haushalts an. Beides lässt sich erst nach dem
  // Artikel laden, deshalb nacheinander statt im Promise.all von vorher.
  const item = await db
    .select()
    .from(items)
    .where(and(eq(items.id, Number(id)), isNull(items.hiddenAt)))
    .get();

  const listId = await visibleListId(session.user.id, item);
  if (!item || listId === null) notFound();

  const [allCategories, allPlaces] = await Promise.all([
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  return (
    /* key=item.id erzwingt einen frischen ItemForm-Mount pro Artikel -
       gleicher Grund wie bei /confirm (siehe dort): ohne key würde beim
       Wechsel von Bearbeiten-Artikel-A zu Bearbeiten-Artikel-B (gleiche
       abgefangene Route, <Activity> hält die Instanz am Leben) weiterhin
       Artikel A's Name/Kategorie/etc. angezeigt. */
    <ItemForm
      key={item.id}
      title="Artikel bearbeiten"
      itemId={item.id}
      redirectTo={standalone ? "/" : undefined}
      categories={allCategories}
      places={allPlaces}
      initialName={item.name}
      initialCategory={item.category}
      initialExpiryDate={item.expiryDate}
      initialQuantity={item.quantity}
      initialPlaceId={item.placeId}
      initialNote={item.note ?? ""}
    />
  );
}
