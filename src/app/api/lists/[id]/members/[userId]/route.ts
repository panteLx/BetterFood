import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { listMembers, lists } from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { requireSession, reassignActiveListAway } from "@/lib/session";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await requireSession();
  const { id, userId } = await params;
  const listId = Number(id);

  const requesterMembership = await db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .where(and(eq(listMembers.userId, session.user.id), eq(listMembers.listId, listId)))
    .get();
  if (!requesterMembership) {
    return NextResponse.json({ error: "Kein Mitglied dieser Liste" }, { status: 403 });
  }

  const list = await db.select().from(lists).where(eq(lists.id, listId)).get();
  if (!list) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  const isSelf = userId === session.user.id;
  const isOwner = list.ownerId === session.user.id;
  if (!isSelf && !isOwner) {
    return NextResponse.json(
      { error: "Nur der Besitzer kann andere Mitglieder entfernen" },
      { status: 403 },
    );
  }
  if (userId === list.ownerId) {
    return NextResponse.json({ error: "Der Besitzer kann nicht entfernt werden" }, { status: 400 });
  }

  const targetMembership = await db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .where(and(eq(listMembers.userId, userId), eq(listMembers.listId, listId)))
    .get();
  if (!targetMembership) {
    return NextResponse.json({ error: "Nutzer ist kein Mitglied dieser Liste" }, { status: 404 });
  }

  const memberCount = await db
    .select({ n: count() })
    .from(listMembers)
    .where(eq(listMembers.listId, listId))
    .get();
  if (!memberCount || memberCount.n <= 1) {
    return NextResponse.json(
      { error: "Die letzte Person kann eine Liste nicht verlassen" },
      { status: 400 },
    );
  }

  db.transaction((tx) => {
    tx.delete(listMembers)
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
      .run();
    reassignActiveListAway(tx, userId, listId);
  });

  return NextResponse.json({ ok: true });
}
