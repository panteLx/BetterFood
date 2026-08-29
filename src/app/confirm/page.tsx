import Link from "next/link";
import { ItemForm } from "@/components/item-form";
import { lookupProductByBarcode } from "@/lib/off";
import { DEFAULT_CATEGORIES, estimateExpiryDate, guessCategoryFromOffTags } from "@/lib/categories";
import { optionalSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;
  const session = await optionalSession();

  let initialName = "";
  let offTags: string[] = [];

  if (barcode) {
    try {
      const result = await lookupProductByBarcode(barcode);
      if (result.found) {
        initialName = result.name ?? "";
        offTags = result.categoryTags ?? [];
      }
    } catch {
      // Lookup fehlgeschlagen -- Nutzer füllt Felder manuell aus.
    }
  }

  if (!session) {
    const guessedKey = guessCategoryFromOffTags(offTags, [...DEFAULT_CATEGORIES]);
    const category = DEFAULT_CATEGORIES.find((c) => c.key === guessedKey);
    const estimatedExpiry = estimateExpiryDate(category?.shelfLifeDays ?? 14);

    return (
      <div className="flex flex-1 flex-col">
        <div className="p-4">
          <h1 className="text-lg font-semibold">Artikel bestätigen</h1>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          {barcode && !initialName && (
            <p className="text-sm text-muted-foreground">
              Produkt zu Barcode {barcode} nicht gefunden.
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{initialName || "Unbekanntes Produkt"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
              {barcode && <p>Barcode: {barcode}</p>}
              <p>
                Voraussichtlich haltbar bis ca.{" "}
                {estimatedExpiry.toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            Als Gast wird nichts gespeichert. Melde dich an, um diesen Artikel deinem Vorrat
            hinzuzufügen.
          </p>
          <Link href={`/login?redirect=${encodeURIComponent(`/confirm?barcode=${barcode ?? ""}`)}`}>
            <Button className="w-full">Zum Speichern anmelden</Button>
          </Link>
        </div>
      </div>
    );
  }

  const listId = await requireActiveList(session.user.id);
  const allCategories = await getCategoriesForList(listId);

  const initialCategory = guessCategoryFromOffTags(offTags, allCategories);

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
      {/* key=barcode erzwingt einen frischen ItemForm-Mount pro Barcode: unter
          cacheComponents:true haelt React <Activity> die vorherige Instanz
          samt useState-Werten am Leben, wenn man erneut zu /confirm mit
          anderem Barcode navigiert (gleiche Route, gleiche Baumposition) -
          initialName wuerde sonst nur beim allerersten Scan uebernommen. */}
      <ItemForm
        key={barcode}
        categories={allCategories}
        initialName={initialName}
        initialCategory={initialCategory}
        barcode={barcode}
        redirectTo="/"
      />
    </div>
  );
}
