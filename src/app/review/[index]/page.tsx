import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ReviewStep } from "@/components/review-step";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";
import { requireActiveList, requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Kurz prüfen",
};

/**
 * Der Prüf-Schritt nach dem Erfassen.
 *
 * Die Route heißt bewusst `/review` und nicht `/scan/review`: derselbe
 * Bildschirm übernimmt ab Einheit 9 auch den Rechnungsimport, der seine
 * geparsten Zeilen in denselben Batch schreibt. Ein Pfad unter `/scan` würde
 * behaupten, das hier gehöre zur Kamera -- dabei ist der Scanner nur eine von
 * zwei Quellen.
 *
 * Der Index steht im Pfad und nicht im Zustand einer einzigen Seite, damit
 * die Zeilen unter der Karte ("Fertig · n -- antippen zum Ändern") auf einen
 * Schritt zeigen können und der Zurück-Knopf des Browsers dasselbe tut wie
 * "Voriger Artikel".
 *
 * Der Batch selbst liegt im `sessionStorage` und damit ausschließlich im
 * Browser -- der Server kann hier nichts anderes beitragen als Kategorien und
 * Fächer der aktiven Liste. Beides kommt trotzdem von hier und nicht aus
 * einer Abfrage im Client: es ist gecacht (`getCategoriesForList`), und die
 * Session-Grenze gehört auf den Server.
 */
export default function ReviewPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  // "await params" muss unterhalb einer <Suspense>-Grenze passieren, sonst
  // blockiert die Navigation komplett den Server-Render (Next 16 "Instant
  // Navigation"-Validierung, siehe node_modules/next/dist/docs/.../
  // instant-navigation.md).
  return (
    <Suspense fallback={<ReviewFallback />}>
      <ResolvedReview params={params} />
    </Suspense>
  );
}

function ReviewFallback() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-2">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-1 animate-pulse rounded-full bg-muted" />
      <div className="h-[520px] animate-pulse rounded-[24px] bg-muted" />
    </div>
  );
}

async function ResolvedReview({ params }: { params: Promise<{ index: string }> }) {
  // Der Proxy gatet /review bereits, aber jede datentragende Seite prüft
  // zusätzlich selbst -- der Proxy ist nicht das einzige Gate (CLAUDE.md).
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [{ index }, allCategories, allPlaces] = await Promise.all([
    params,
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  // Alles, was keine nicht-negative Ganzzahl ist, ist keine Position im
  // Batch. Die Obergrenze prüft der Client: nur er kennt den Batch, und ein
  // Index hinter dem letzten Artikel ist dort der Abschluss-Schritt, kein
  // Fehler.
  const position = Number(index);
  if (!Number.isInteger(position) || position < 0) notFound();

  return (
    <ReviewStep index={position} categories={allCategories} places={allPlaces} />
  );
}
