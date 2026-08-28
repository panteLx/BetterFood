import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items, listMembers, lists } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, everyMemberHasAnotherActiveList, reassignActiveListAway } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const listId = Number(id);

  const list = await db.select().from(lists).where(eq(lists.id, listId)).get();
  if (!list) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }
  if (list.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Nur der Besitzer kann die Liste archivieren" }, { status: 403 });
  }

  const { archived } = (await req.json()) as { archived: boolean };
  if (typeof archived !== "boolean") {
    return NextResponse.json({ error: "archived ist erforderlich" }, { status: 400 });
  }

  if (archived && list.archivedAt) {
    return NextResponse.json({ error: "Liste ist bereits archiviert" }, { status: 400 });
  }
  if (!archived && !list.archivedAt) {
    return NextResponse.json({ error: "Liste ist nicht archiviert" }, { status: 400 });
  }

  if (archived) {
    const safe = await everyMemberHasAnotherActiveList(db, listId);
    if (!safe) {
      return NextResponse.json(
        { error: "Mindestens ein Mitglied hätte danach keine aktive Liste mehr" },
        { status: 400 },
      );
    }
  }

  const updated = db.transaction((tx) => {
    const [row] = tx
      .update(lists)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(lists.id, listId))
      .returning()
      .all();

    if (archived) {
      const members = tx
        .select({ userId: listMembers.userId })
        .from(listMembers)
        .where(eq(listMembers.listId, listId))
        .all();
      for (const member of members) {
        reassignActiveListAway(tx, member.userId, listId);
      }
    }

    return row;
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const listId = Number(id);

  const list = await db.select().from(lists).where(eq(lists.id, listId)).get();
  if (!list) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }
  if (list.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Nur der Besitzer kann die Liste löschen" }, { status: 403 });
  }

  const safe = await everyMemberHasAnotherActiveList(db, listId);
  if (!safe) {
    return NextResponse.json(
      { error: "Mindestens ein Mitglied hätte danach keine aktive Liste mehr" },
      { status: 400 },
    );
  }

  db.transaction((tx) => {
    const members = tx
      .select({ userId: listMembers.userId })
      .from(listMembers)
      .where(eq(listMembers.listId, listId))
      .all();

    tx.delete(items).where(eq(items.listId, listId)).run();
    tx.delete(categories).where(eq(categories.listId, listId)).run();
    tx.delete(listMembers).where(eq(listMembers.listId, listId)).run();
    tx.delete(lists).where(eq(lists.id, listId)).run();

    for (const member of members) {
      reassignActiveListAway(tx, member.userId, listId);
    }
  });

  return NextResponse.json({ ok: true });
}
