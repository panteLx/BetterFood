import { notFound } from "next/navigation";
import { ItemForm } from "@/components/item-form";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [item, allCategories] = await Promise.all([
    db.select().from(items).where(eq(items.id, Number(id))).get(),
    db.select().from(categories).orderBy(asc(categories.label)),
  ]);

  if (!item) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Artikel bearbeiten</h1>
      </div>
      <ItemForm
        itemId={item.id}
        categories={allCategories}
        initialName={item.name}
        initialCategory={item.category}
        initialExpiryDate={item.expiryDate}
        initialQuantity={item.quantity}
      />
    </div>
  );
}
