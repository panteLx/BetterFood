import { notFound } from "next/navigation";
import { db } from "@/db";
import { categories, items, places, user } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { ItemDetail } from "@/components/item-detail";
import { requireSession, requireActiveList } from "@/lib/session";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const row = await db
    .select({
      item: items,
      categoryLabel: categories.label,
      placeName: places.name,
      addedByName: user.name,
      addedByEmail: user.email,
    })
    .from(items)
    // Kategorie und Ort gehoeren beide der Liste, aber keins von beidem muss
    // es noch geben: eine geloeschte Kategorie oder ein aufgeloestes Fach
    // darf den Artikel nicht unauffindbar machen.
    .leftJoin(
      categories,
      and(eq(categories.key, items.category), eq(categories.listId, listId)),
    )
    .leftJoin(places, eq(places.id, items.placeId))
    .leftJoin(user, eq(user.id, items.addedById))
    .where(and(eq(items.id, Number(id)), eq(items.listId, listId), isNull(items.hiddenAt)))
    .get();

  if (!row) notFound();

  return (
    <ItemDetail
      item={row.item}
      categoryLabel={row.categoryLabel ?? row.item.category}
      placeName={row.placeName}
      addedBy={
        row.addedByName && row.addedByEmail
          ? { name: row.addedByName, email: row.addedByEmail }
          : null
      }
    />
  );
}
