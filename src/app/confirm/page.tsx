import { ItemForm } from "@/components/item-form";
import { lookupProductByBarcode } from "@/lib/off";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;

  let initialName = "";
  let initialCategory = "sonstiges";

  if (barcode) {
    try {
      const result = await lookupProductByBarcode(barcode);
      if (result.found) {
        initialName = result.name ?? "";
        initialCategory = result.category ?? "sonstiges";
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
        initialName={initialName}
        initialCategory={initialCategory}
        barcode={barcode}
      />
    </div>
  );
}
