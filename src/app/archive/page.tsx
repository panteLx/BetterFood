import Link from "next/link";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { ArchiveList } from "@/components/archive-list";
import { ArchiveStats } from "@/components/archive-stats";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";

export default async function ArchivePage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [resolvedItems, allCategories] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(ne(items.status, "active"), eq(items.listId, listId)))
      .orderBy(desc(items.resolvedAt)),
    getCategoriesForList(listId),
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
        <h1 className="text-lg font-semibold">Archiv</h1>
      </div>
      {/* Die Rettungsquote steht ueber der Liste: sie ist der Grund, hier
          ueberhaupt reinzuschauen, wenn gerade nichts ablaeuft. */}
      <ArchiveStats items={resolvedItems} />

      <ArchiveList initialItems={resolvedItems} categories={allCategories} />
    </div>
  );
}
