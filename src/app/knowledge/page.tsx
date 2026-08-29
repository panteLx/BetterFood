import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { lists } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { KnowledgeManager } from "@/components/knowledge-manager";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getKnowledgeForList } from "@/lib/data";

export default async function KnowledgePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [entries, allCategories, list] = await Promise.all([
    getKnowledgeForList(listId),
    getCategoriesForList(listId),
    db
      .select({ name: lists.name })
      .from(lists)
      .where(eq(lists.id, listId))
      .get(),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 p-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Zurück
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Datenbank</h1>
        {/* Dankenbank gehoert der Liste, nicht dem Nutzer -- in einer anderen
            Liste kann dasselbe Produkt anders einsortiert sein. */}
        {list && (
          <span className="ml-auto truncate rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
            {list.name}
          </span>
        )}
      </div>
      <KnowledgeManager
        initialEntries={entries}
        initialCategories={allCategories}
      />
    </div>
  );
}
