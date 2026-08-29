import { Suspense } from "react";
import { ItemForm } from "@/components/item-form";
import { lookupProductByBarcode } from "@/lib/off";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";
import { parseEntryMethod } from "@/lib/entry-method";

// "await searchParams" muss unterhalb einer <Suspense>-Grenze passieren, sonst
// blockiert die Navigation komplett den Server-Render (Next 16 "Instant
// Navigation"-Validierung, siehe node_modules/next/dist/docs/.../
// instant-navigation.md).
export default function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string; via?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Confirm searchParams={searchParams} />
    </Suspense>
  );
}

async function Confirm({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string; via?: string }>;
}) {
  const { barcode, via } = await searchParams;
  const session = await requireSession();

  let initialName = "";

  if (barcode) {
    try {
      const result = await lookupProductByBarcode(barcode);
      if (result.found) initialName = result.name ?? "";
    } catch {
      // Lookup fehlgeschlagen -- Nutzer füllt Felder manuell aus.
    }
  }

  const listId = await requireActiveList(session.user.id);
  const [allCategories, allPlaces] = await Promise.all([
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      {barcode && !initialName && (
        <p className="px-5 pt-3 text-[13px] font-medium text-muted-foreground">
          Zu Barcode <span className="font-mono">{barcode}</span> ist nichts
          hinterlegt – bitte Details ergänzen.
        </p>
      )}
      {/* key=barcode erzwingt einen frischen ItemForm-Mount pro Barcode: unter
          cacheComponents:true haelt React <Activity> die vorherige Instanz
          samt useState-Werten am Leben, wenn man erneut zu /confirm mit
          anderem Barcode navigiert (gleiche Route, gleiche Baumposition) -
          initialName wuerde sonst nur beim allerersten Scan uebernommen. */}
      <ItemForm
        key={barcode}
        title="Artikel bestätigen"
        categories={allCategories}
        places={allPlaces}
        initialName={initialName}
        barcode={barcode}
        // Ohne via kam der Aufruf noch aus einer Version, die den Weg nicht
        // mitschickte -- ein Barcode auf /confirm entstand dort immer am
        // Scanner.
        method={parseEntryMethod(via ?? "scan")}
        redirectTo="/"
      />
    </div>
  );
}
