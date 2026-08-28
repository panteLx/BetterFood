import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { InventoryList } from "@/components/inventory-list";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Settings, Camera, Plus, Archive } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [activeItems, allCategories] = await Promise.all([
    db.select().from(items).where(eq(items.status, "active")).orderBy(items.expiryDate),
    db.select().from(categories).orderBy(asc(categories.label)),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold">Vorrat</h1>
        <div className="flex gap-1">
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
        <Link href="/add" className="flex-1">
          <Button variant="outline" className="w-full" size="lg">
            <Plus className="size-4" />
            Manuell
          </Button>
        </Link>
      </div>
    </div>
  );
}
