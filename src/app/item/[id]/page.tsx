import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { categories, items, places, user } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { ItemDetail } from "@/components/item-detail";
import { requireSession, isListMember } from "@/lib/session";

/**
 * Der Artikel gibt der Seite ihren Titel: im Verlauf und in der
 * Tab-Übersicht stehen sonst zehnmal "BetterFood" nebeneinander, und keiner
 * davon sagt, welcher Artikel gemeint war.
 *
 * Die Abfrage läuft über dieselbe Listengrenze wie die Seite -- ein Titel
 * darf nicht verraten, wie ein Artikel in einer fremden Liste heißt. Findet
 * sie nichts, bleibt es beim Standardtitel; das notFound() fällt in der
 * Seite selbst.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;

  const row = await db
    .select({ name: items.name, listId: items.listId })
    .from(items)
    .where(and(eq(items.id, Number(id)), isNull(items.hiddenAt)))
    .get();

  return row && (await isListMember(session.user.id, row.listId)) ? { title: row.name } : {};
}

// "await params" muss unterhalb einer <Suspense>-Grenze passieren, sonst
// blockiert die Navigation komplett den Server-Render (Next 16 "Instant
// Navigation"-Validierung, siehe node_modules/next/dist/docs/.../
// instant-navigation.md).
export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ItemFallback />}>
      <ResolvedItem params={params} />
    </Suspense>
  );
}

function ItemFallback() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-5 pt-2">
      <div className="size-11 animate-pulse rounded-2xl bg-muted" />
      <div className="flex flex-col items-center gap-4">
        <div className="size-23 animate-pulse rounded-[30px] bg-muted" />
        <div className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-8.5 w-32 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-56 animate-pulse rounded-3xl bg-muted" />
    </div>
  );
}

/**
 * Der Artikel bestimmt die Liste, nicht die aktive Liste den Artikel.
 *
 * Vorher filterte die Seite auf requireActiveList(): ein Deep-Link aus einer
 * Benachrichtigung auf einen Artikel eines anderen Haushalts lief damit in
 * ein 404, obwohl es die Zeile gibt und der Nutzer sie sehen darf. Jetzt
 * entscheidet die Mitgliedschaft in der Liste des Artikels -- und die aktive
 * Liste bleibt, wo sie war: eine angetippte Meldung soll niemanden
 * unbemerkt in einen anderen Haushalt versetzen.
 */
async function ResolvedItem({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();

  const { id } = await params;
  const row = await db
    .select({
      item: items,
      categoryLabel: categories.label,
      shelfLifeDays: categories.shelfLifeDays,
      placeName: places.name,
      addedByName: user.name,
      addedByEmail: user.email,
    })
    .from(items)
    // Kategorie und Ort gehören beide der Liste, aber keins von beidem muss
    // es noch geben: eine gelöschte Kategorie oder ein aufgelöstes Fach
    // darf den Artikel nicht unauffindbar machen.
    .leftJoin(
      categories,
      and(eq(categories.key, items.category), eq(categories.listId, items.listId)),
    )
    .leftJoin(places, eq(places.id, items.placeId))
    .leftJoin(user, eq(user.id, items.addedById))
    .where(and(eq(items.id, Number(id)), isNull(items.hiddenAt)))
    .get();

  if (!row) notFound();
  if (!(await isListMember(session.user.id, row.item.listId))) notFound();

  return (
    <ItemDetail
      item={row.item}
      categoryLabel={row.categoryLabel ?? row.item.category}
      shelfLifeDays={row.shelfLifeDays}
      placeName={row.placeName}
      addedBy={
        row.addedByName && row.addedByEmail
          ? { name: row.addedByName, email: row.addedByEmail }
          : null
      }
    />
  );
}
