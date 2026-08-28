import { ItemForm } from "@/components/item-form";
import { lookupProductByBarcode } from "@/lib/off";
import { guessCategoryFromOffTags } from "@/lib/categories";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;
  const allCategories = await db.select().from(categories).orderBy(asc(categories.label));

  let initialName = "";
  let initialCategory: string | undefined;

  if (barcode) {
    try {
      const result = await lookupProductByBarcode(barcode);
      if (result.found) {
        initialName = result.name ?? "";
        initialCategory = guessCategoryFromOffTags(result.categoryTags ?? [], allCategories);
      }
    } catch {
      // Lookup fehlgeschlagen -- Nutzer füllt Felder manuell aus.
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Artikel bestätigen</h1>
        {barcode && !initialName && (
          <p className="mt-1 text-sm text-muted-foreground">
            Produkt zu Barcode {barcode} nicht gefunden – bitte Details ergänzen.
          </p>
        )}
      </div>
      <ItemForm
        categories={allCategories}
        initialName={initialName}
        initialCategory={initialCategory}
        barcode={barcode}
      />
    </div>
  );
}
