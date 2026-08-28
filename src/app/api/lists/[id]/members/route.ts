import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { listMembers, lists, user } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const listId = Number(id);

  const list = await db.select().from(lists).where(eq(lists.id, listId)).get();
  if (!list) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  const membership = await db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .where(and(eq(listMembers.userId, session.user.id), eq(listMembers.listId, listId)))
    .get();
  if (!membership) {
    return NextResponse.json({ error: "Kein Mitglied dieser Liste" }, { status: 403 });
  }

  const rows = await db
    .select({ userId: user.id, name: user.name, email: user.email })
    .from(listMembers)
    .innerJoin(user, eq(user.id, listMembers.userId))
    .where(eq(listMembers.listId, listId))
    .orderBy(listMembers.addedAt);

  const members = rows.map((row) => ({ ...row, isOwner: row.userId === list.ownerId }));

  return NextResponse.json({ members });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;
  const listId = Number(id);

  const membership = await db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .where(and(eq(listMembers.userId, session.user.id), eq(listMembers.listId, listId)))
    .get();

  if (!membership) {
    return NextResponse.json({ error: "Kein Mitglied dieser Liste" }, { status: 403 });
  }

  const { userId } = (await req.json()) as { userId: string };
  if (!userId) {
    return NextResponse.json({ error: "userId ist erforderlich" }, { status: 400 });
  }

  const targetUser = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();

  if (!targetUser) {
    return NextResponse.json({ error: "Nutzer nicht gefunden" }, { status: 404 });
  }

  const existingMembership = await db
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .where(and(eq(listMembers.userId, targetUser.id), eq(listMembers.listId, listId)))
    .get();

  if (existingMembership) {
    return NextResponse.json({ error: "Nutzer ist bereits Mitglied dieser Liste" }, { status: 409 });
  }

  const [created] = await db
    .insert(listMembers)
    .values({ listId, userId: targetUser.id, addedAt: new Date() })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
