import type { Metadata } from "next";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { ArchiveView } from "@/components/archive-view";
import { ListSwitcher } from "@/components/list-switcher";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getListsWithCounts } from "@/lib/data";

export const metadata: Metadata = {
  title: "Archiv",
  description: "Was du aufgebraucht oder entsorgt hast, samt Rettungsquote.",
};

export default async function ArchivePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [resolvedItems, allCategories, myLists] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(ne(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
      .orderBy(desc(items.resolvedAt)),
    getCategoriesForList(listId),
    getListsWithCounts(session.user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4.5 pt-2 pb-4">
      {/* Der Listenwechsel steht auf jeder Seite, die den Inhalt einer Liste
          zeigt -- das Archiv gehoert genauso zu einer Liste wie der Vorrat,
          und wer dort nachsieht, muss dafuer nicht ueber die Startseite. */}
      <div className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight">Archiv</h1>
          <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
            Was du aufgebraucht oder entsorgt hast
          </p>
        </div>
        <ListSwitcher activeListId={listId} lists={myLists} />
      </div>
      {/* Die Rettungsquote steht ueber der Liste: sie ist der Grund, hier
          ueberhaupt reinzuschauen, wenn gerade nichts ablaeuft. */}
      <ArchiveView initialItems={resolvedItems} categories={allCategories} />
    </div>
  );
}
