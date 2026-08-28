import { ItemForm } from "@/components/item-form";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";

export default async function AddPage() {
  const allCategories = await db.select().from(categories).orderBy(asc(categories.label));

  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Manuell hinzufügen</h1>
      </div>
      <ItemForm categories={allCategories} />
    </div>
  );
}
