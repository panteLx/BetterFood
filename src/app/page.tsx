import { db } from "@/db";
import { items, listMembers, lists } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { InventoryList } from "@/components/inventory-list";
import { ListSwitcher } from "@/components/list-switcher";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";
import { InstallHintBanner } from "@/components/install-hint";

export default async function HomePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [activeItems, allCategories, myLists] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(eq(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
      .orderBy(items.expiryDate),
    getCategoriesForList(listId),
    db
      .select({ id: lists.id, name: lists.name })
      .from(lists)
      .innerJoin(listMembers, eq(listMembers.listId, lists.id))
      .where(and(eq(listMembers.userId, session.user.id), isNull(lists.archivedAt)))
      .orderBy(asc(lists.createdAt)),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 p-4">
        <ListSwitcher activeListId={listId} lists={myLists} />
      </div>

      {activeItems.length > 0 && <InstallHintBanner />}

      <InventoryList initialItems={activeItems} categories={allCategories} />
    </div>
  );
}
