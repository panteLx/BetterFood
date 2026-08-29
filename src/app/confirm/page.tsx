import Link from "next/link";
import { ItemForm } from "@/components/item-form";
import { EstimatedExpiry } from "@/components/estimated-expiry";
import { lookupProductByBarcode } from "@/lib/off";
import { DEFAULT_CATEGORIES, guessCategoryFromOffTags } from "@/lib/categories";
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
    const redirect = `/confirm?barcode=${barcode ?? ""}`;

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
              <EstimatedExpiry shelfLifeDays={category?.shelfLifeDays ?? 14} />
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            Als Gast wird nichts gespeichert. Lege ein Konto an oder melde dich an – dieser
            Artikel wartet dann hier auf dich.
          </p>
          {/* Beide Wege behalten den Barcode: wer erst scannt und dann ein
              Konto anlegt, soll genau hier weitermachen und nicht auf einer
              leeren Startseite landen. */}
          <div className="flex flex-col gap-2">
            <Link href={`/register?redirect=${encodeURIComponent(redirect)}`}>
              <Button className="h-11 w-full">Konto erstellen und speichern</Button>
            </Link>
            <Link href={`/login?redirect=${encodeURIComponent(redirect)}`}>
              <Button variant="outline" className="h-11 w-full">
                Ich habe schon ein Konto
              </Button>
            </Link>
          </div>
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
        // Nach dem Einkauf ist der naechste Artikel der Normalfall: ohne diesen
        // Weg kostete jeder weitere Scan erneut FAB, Auswahl-Sheet und einen
        // kompletten Kamera-Start.
        showScanNext
      />
    </div>
  );
}
