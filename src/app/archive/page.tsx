import Link from "next/link";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { asc, desc, ne } from "drizzle-orm";
import { ArchiveList } from "@/components/archive-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const [resolvedItems, allCategories] = await Promise.all([
    db
      .select()
      .from(items)
      .where(ne(items.status, "active"))
      .orderBy(desc(items.resolvedAt)),
    db.select().from(categories).orderBy(asc(categories.label)),
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
      <ArchiveList initialItems={resolvedItems} categories={allCategories} />
    </div>
  );
}
