import { db } from "@/db";
import { lists } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SubPageHeader } from "@/components/sub-page-header";
import { KnowledgeManager } from "@/components/knowledge-manager";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getKnowledgeForList, getPlacesWithCounts } from "@/lib/data";

export default async function KnowledgePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [entries, allCategories, placesWithCounts, list] = await Promise.all([
    getKnowledgeForList(listId),
    getCategoriesForList(listId),
    // Die Zahl steht in der Loeschabfrage ("3 Artikel liegen hier") und macht
    // erst begreifbar, was das Entfernen eines Fachs bedeutet.
    getPlacesWithCounts(listId),
    db.select({ name: lists.name }).from(lists).where(eq(lists.id, listId)).get(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-4">
      <div className="flex items-center gap-2.5">
        <SubPageHeader title="Datenbank" />
        {/* Die Datenbank gehoert der Liste, nicht dem Nutzer -- in einer
            anderen Liste kann dasselbe Produkt anders einsortiert sein. */}
        {list && (
          <span className="ml-auto max-w-[40%] truncate rounded-[9px] bg-primary-tint px-2.5 py-1 text-[11.5px] font-bold text-primary">
            {list.name}
          </span>
        )}
      </div>
      <KnowledgeManager
        initialEntries={entries}
        initialCategories={allCategories}
        places={placesWithCounts}
      />
    </div>
  );
}
