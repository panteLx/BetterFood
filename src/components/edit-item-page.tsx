import { notFound } from "next/navigation";
import { ItemForm } from "@/components/item-form";
import { db } from "@/db";
import { items, user } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";

export async function EditItemPage({ id }: { id: string }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [item, allCategories] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        category: items.category,
        expiryDate: items.expiryDate,
        quantity: items.quantity,
        addedByName: user.name,
        addedByEmail: user.email,
      })
      .from(items)
      .leftJoin(user, eq(user.id, items.addedById))
      .where(and(eq(items.id, Number(id)), eq(items.listId, listId)))
      .get(),
    getCategoriesForList(listId),
  ]);

  if (!item) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Artikel bearbeiten</h1>
      </div>
      {/* key=item.id erzwingt einen frischen ItemForm-Mount pro Artikel -
          gleicher Grund wie bei /confirm (siehe dort): ohne key wuerde beim
          Wechsel von Bearbeiten-Artikel-A zu Bearbeiten-Artikel-B (gleiche
          abgefangene Route, <Activity> haelt die Instanz am Leben) weiterhin
          Artikel A's Name/Kategorie/etc. angezeigt. */}
      <ItemForm
        key={item.id}
        itemId={item.id}
        categories={allCategories}
        initialName={item.name}
        initialCategory={item.category}
        initialExpiryDate={item.expiryDate}
        initialQuantity={item.quantity}
        addedBy={
          item.addedByName && item.addedByEmail
            ? { name: item.addedByName, email: item.addedByEmail }
            : null
        }
      />
    </div>
  );
}
