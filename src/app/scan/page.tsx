import { Suspense } from "react";
import { ScanScreen } from "@/components/scan-screen";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";
import { requireActiveList, requireSession } from "@/lib/session";

/**
 * Der Scanner.
 *
 * Bis zu dieser Einheit war das hier die Client-Komponente selbst -- die Seite
 * brauchte nichts vom Server, weil sie nur Barcodes einsammelte. Seit das MHD
 * auch direkt beim Scannen eingetragen werden kann, braucht sie die Kategorien
 * (Richtwerte, Standardfächer) und die Fächer der aktiven Liste. Die kommen aus
 * `getCategoriesForList` / `getPlacesForList`, sind dort gecacht und gehören auf
 * den Server -- denselben Weg geht `/review/[index]` schon.
 *
 * Damit prüft `/scan` jetzt auch selbst die Session. Der Proxy gatet den Pfad
 * ohnehin, aber er ist nicht das einzige Gate (CLAUDE.md).
 *
 * Das Titel-Metadatum steht weiterhin in `layout.tsx`: die Kamera-Komponente
 * kann als Client-Komponente keins exportieren, und dieses Layout ist der
 * einzige Grund, warum es überhaupt existiert.
 */
export default function ScanPage() {
  // Der Zugriff auf Cookies und Datenbank muss unterhalb einer
  // <Suspense>-Grenze passieren, sonst blockiert die Navigation komplett den
  // Server-Render (Next 16 "Instant Navigation"-Validierung, siehe
  // node_modules/next/dist/docs/.../instant-navigation.md).
  return (
    <Suspense fallback={<ScanFallback />}>
      <ResolvedScan />
    </Suspense>
  );
}

/**
 * Derselbe dunkle Grund, den der Scanner selbst hat -- ein heller Platzhalter
 * blitzte auf dem Weg zur Kamera als weißer Schlag auf.
 */
function ScanFallback() {
  return (
    <div className="dark -mt-[max(env(safe-area-inset-top),1.75rem)] flex flex-1 bg-[#0d1512]" />
  );
}

async function ResolvedScan() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [allCategories, allPlaces] = await Promise.all([
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  return <ScanScreen categories={allCategories} places={allPlaces} />;
}
