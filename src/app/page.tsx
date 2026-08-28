import { db } from "@/db";
import { items, listMembers, lists } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { InventoryList } from "@/components/inventory-list";
import { Button } from "@/components/ui/button";
import { ListSwitcher } from "@/components/list-switcher";
import { ManualAddDialog } from "@/components/manual-add-dialog";
import Link from "next/link";
import { Settings, Camera, Archive } from "lucide-react";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";

export default async function HomePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [activeItems, allCategories, myLists] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(eq(items.status, "active"), eq(items.listId, listId)))
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
        <div className="flex shrink-0 gap-1">
          <Link href="/archive">
            <Button variant="ghost" size="icon" aria-label="Archiv">
              <Archive className="size-5" />
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="ghost" size="icon" aria-label="Einstellungen">
              <Settings className="size-5" />
            </Button>
          </Link>
        </div>
      </div>

      <InventoryList initialItems={activeItems} categories={allCategories} />

      <div className="flex gap-2 border-t p-4">
        <Link href="/scan" className="flex-1">
          <Button className="w-full" size="lg">
            <Camera className="size-4" />
            Scannen
          </Button>
        </Link>
        <div className="flex-1">
          <ManualAddDialog />
        </div>
      </div>
    </div>
  );
}
