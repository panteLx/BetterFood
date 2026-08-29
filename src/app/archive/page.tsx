import { db } from "@/db";
import { items } from "@/db/schema";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { ArchiveView } from "@/components/archive-view";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";

export default async function ArchivePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [resolvedItems, allCategories] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(ne(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
      .orderBy(desc(items.resolvedAt)),
    getCategoriesForList(listId),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4.5 pt-2 pb-4">
      <div className="px-5">
        <h1 className="text-[26px] leading-tight">Archiv</h1>
        <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
          Was du aufgebraucht oder entsorgt hast
        </p>
      </div>
      {/* Die Rettungsquote steht ueber der Liste: sie ist der Grund, hier
          ueberhaupt reinzuschauen, wenn gerade nichts ablaeuft. */}
      <ArchiveView initialItems={resolvedItems} categories={allCategories} />
    </div>
  );
}
