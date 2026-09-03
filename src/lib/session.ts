import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { items, listMembers, lists, user } from "@/db/schema";
import type { Executor } from "@/lib/data";

// Liefert null statt nach /login umzuleiten -- für Stellen, die eine fehlende
// Anmeldung selbst beantworten (die Navigationsleiste blendet sich aus, eine
// API-Route antwortet mit 401).
//
// Das "use cache: private" ist hier nicht nur Caching: better-auth liest beim
// Prüfen der Session new Date(), und ein solcher "unstable value" lässt den
// Prerender die ganze Route abbrechen ("Route /confirm: Next.js encountered
// the unstable value `new Date()` while prerendering"). Innerhalb der
// Cache-Grenze passiert das nicht mehr.
export async function optionalSession() {
  "use cache: private";

  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await optionalSession();
  if (!session) redirect("/login");
  return session;
}

export async function oldestActiveMembership(userId: string) {
  return db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId))
    .where(and(eq(listMembers.userId, userId), isNull(lists.archivedAt)))
    .orderBy(asc(listMembers.addedAt))
    .get();
}

/**
 * Darf dieser Nutzer diese Liste sehen?
 *
 * Genau der Join, der in requireActiveList() steckte -- dort an
 * user.activeListId gebunden, hier frei. Gebraucht wird er, seit eine
 * Benachrichtigung auf einen Artikel zeigen kann, der nicht in der gerade
 * aktiven Liste liegt: die Frage ist dann nicht "welche Liste sieht der
 * Nutzer gerade an", sondern "darf er diese Zeile sehen". Ein Deep-Link
 * wechselt die aktive Liste bewusst nicht -- niemand soll durch das Antippen
 * einer Meldung in einem anderen Haushalt landen.
 *
 * Archivierte Listen zählen nicht, dieselbe Grenze wie bisher. Eine
 * fehlende listId ebenfalls nicht: es gibt Alt-Zeilen aus der Zeit vor der
 * Spalte, und die gehören niemandem.
 */
export async function isListMember(userId: string, listId: number | null): Promise<boolean> {
  if (listId === null) return false;

  const membership = await db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId))
    .where(
      and(
        eq(listMembers.userId, userId),
        eq(listMembers.listId, listId),
        isNull(lists.archivedAt),
      ),
    )
    .get();

  return membership !== undefined;
}

/**
 * Die Liste einer bereits geladenen Artikel-Zeile, sofern der Nutzer sie sehen
 * darf -- sonst null.
 *
 * Vorher schnitten die Artikel-Routen über requireActiveList() zu: eine
 * Änderung an einem Artikel war nur möglich, solange dessen Liste zufällig
 * die aktive war. Seit eine Benachrichtigung direkt auf einen Artikel zeigen
 * kann, entscheidet die Mitgliedschaft in seiner eigenen Liste. Der
 * Rückgabewert ersetzt die aktive Liste überall dort, wo sie vorher stand --
 * auch Kategorie und Ort werden gegen ihn geprüft.
 *
 * Als eigene Funktion, weil die Regel sonst an jeder Stelle neu
 * zusammengesetzt wird, die die Zeile schon in der Hand hat (Detailseite,
 * Bearbeiten-Formular, /resolve) -- und "eine Zeile ohne listId gehört
 * niemandem" ist eine Sichtbarkeitsgrenze, die genau eine Fassung haben soll.
 */
export async function visibleListId(
  userId: string,
  row: { listId: number | null } | undefined,
): Promise<number | null> {
  const listId = row?.listId ?? null;
  return (await isListMember(userId, listId)) ? listId : null;
}

/**
 * Dasselbe für Aufrufer, die den Artikel gar nicht laden -- die Schreibrouten
 * unter /api/items/[id] brauchen nur die Liste.
 *
 * Ein Join und nicht Zeile-lesen-dann-Mitgliedschaft-prüfen: die Frage steht
 * auf dem Weg jedes Mengenschritts, jedes Speicherns und jedes
 * Rückgängigmachens, und zwei Abfragen beantworten sie nicht besser als eine.
 */
export async function itemListId(userId: string, itemId: number): Promise<number | null> {
  const row = await db
    .select({ listId: items.listId })
    .from(items)
    .innerJoin(
      listMembers,
      and(eq(listMembers.listId, items.listId), eq(listMembers.userId, userId)),
    )
    .innerJoin(lists, and(eq(lists.id, items.listId), isNull(lists.archivedAt)))
    .where(and(eq(items.id, itemId), isNull(items.hiddenAt)))
    .get();

  return row?.listId ?? null;
}

export async function requireActiveList(userId: string): Promise<number> {
  const row = await db
    .select({ activeListId: user.activeListId })
    .from(user)
    .where(eq(user.id, userId))
    .get();

  if (row?.activeListId && (await isListMember(userId, row.activeListId))) {
    return row.activeListId;
  }

  const fallback = await oldestActiveMembership(userId);

  if (!fallback) {
    throw new Error("Benutzer ist Mitglied keiner Liste");
  }

  await db.update(user).set({ activeListId: fallback.listId }).where(eq(user.id, userId));
  return fallback.listId;
}

/**
 * If the given user's activeListId currently points at `awayFromListId`, reassign it to
 * their oldest remaining non-archived membership (or null if none is left). Used after a
 * membership is removed or a list is archived/deleted, inside the same transaction.
 *
 * Synchronous (no async/await): better-sqlite3's transaction callbacks must run fully
 * synchronously, so this must too when called from inside `db.transaction(...)`.
 */
export function reassignActiveListAway(executor: Executor, userId: string, awayFromListId: number) {
  const current = executor
    .select({ activeListId: user.activeListId })
    .from(user)
    .where(eq(user.id, userId))
    .get();

  if (current?.activeListId !== awayFromListId) return;

  const fallback = executor
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId))
    .where(
      and(
        eq(listMembers.userId, userId),
        isNull(lists.archivedAt),
        ne(listMembers.listId, awayFromListId),
      ),
    )
    .orderBy(asc(listMembers.addedAt))
    .get();

  executor.update(user).set({ activeListId: fallback?.listId ?? null }).where(eq(user.id, userId)).run();
}

/**
 * True if every member of `listId` has at least one OTHER non-archived list membership --
 * i.e. it's safe to archive/delete this list without leaving anyone list-less.
 */
export async function everyMemberHasAnotherActiveList(
  executor: Executor,
  listId: number,
): Promise<boolean> {
  const members = await executor
    .select({ userId: listMembers.userId })
    .from(listMembers)
    .where(eq(listMembers.listId, listId));

  for (const member of members) {
    const other = await executor
      .select({ n: count() })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(
        and(
          eq(listMembers.userId, member.userId),
          ne(listMembers.listId, listId),
          isNull(lists.archivedAt),
        ),
      )
      .get();
    if (!other || other.n === 0) return false;
  }

  return true;
}
