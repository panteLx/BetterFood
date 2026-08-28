import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { listMembers, lists, user } from "@/db/schema";

type Executor = Omit<typeof db, "$client">;

export async function requireSession() {
  "use cache: private";

  const session = await auth.api.getSession({ headers: await headers() });
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

export async function requireActiveList(userId: string): Promise<number> {
  const row = await db
    .select({ activeListId: user.activeListId })
    .from(user)
    .where(eq(user.id, userId))
    .get();

  if (row?.activeListId) {
    const membership = await db
      .select({ listId: listMembers.listId })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(
        and(
          eq(listMembers.userId, userId),
          eq(listMembers.listId, row.activeListId),
          isNull(lists.archivedAt),
        ),
      )
      .get();
    if (membership) return row.activeListId;
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
