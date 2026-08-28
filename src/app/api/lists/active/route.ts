import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { listMembers, user } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

export async function PUT(req: NextRequest) {
  const session = await requireSession();

  const { listId } = (await req.json()) as { listId: number };

  if (!Number.isFinite(listId)) {
    return NextResponse.json({ error: "listId ist erforderlich" }, { status: 400 });
  }

  const membership = await db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .where(and(eq(listMembers.userId, session.user.id), eq(listMembers.listId, listId)))
    .get();

  if (!membership) {
    return NextResponse.json({ error: "Kein Mitglied dieser Liste" }, { status: 403 });
  }

  await db.update(user).set({ activeListId: listId }).where(eq(user.id, session.user.id));

  return NextResponse.json({ activeListId: listId });
}
