import { Suspense } from "react";
import { RouteModal } from "@/components/route-modal";
import { EditItemPage } from "@/components/edit-item-page";

// "await params" muss unterhalb einer <Suspense>-Grenze passieren, sonst
// blockiert die Navigation komplett den Server-Render (Next 16 "Instant
// Navigation"-Validierung, siehe node_modules/next/dist/docs/.../
// instant-navigation.md, Abschnitt "Fixing a navigation that blocks").
// RouteModal (das Sheet/Backdrop) bleibt bewusst ausserhalb, damit es sofort
// erscheint, waehrend der Artikel-Inhalt nachlaedt.
export default function InterceptedEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <RouteModal>
      <Suspense fallback={<EditItemFallback />}>
        <ResolvedEditItemPage params={params} />
      </Suspense>
    </RouteModal>
  );
}

async function ResolvedEditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditItemPage id={id} />;
}

function EditItemFallback() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
