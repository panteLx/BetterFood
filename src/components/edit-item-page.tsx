import { notFound } from "next/navigation";
import { ItemForm } from "@/components/item-form";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";

/** standalone: siehe AddItemPage -- verhindert router.back() aus der App heraus. */
export async function EditItemPage({ id, standalone = false }: { id: string; standalone?: boolean }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [item, allCategories, allPlaces] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(eq(items.id, Number(id)), eq(items.listId, listId), isNull(items.hiddenAt)))
      .get(),
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  if (!item) notFound();

  return (
    /* key=item.id erzwingt einen frischen ItemForm-Mount pro Artikel -
       gleicher Grund wie bei /confirm (siehe dort): ohne key wuerde beim
       Wechsel von Bearbeiten-Artikel-A zu Bearbeiten-Artikel-B (gleiche
       abgefangene Route, <Activity> haelt die Instanz am Leben) weiterhin
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
