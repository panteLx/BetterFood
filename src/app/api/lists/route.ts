import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { listMembers, lists, user } from "@/db/schema";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { applyDefaultCategoryPlaces, seedDefaultCategories, seedDefaultPlaces } from "@/lib/data";

const listColumns = {
  id: lists.id,
  name: lists.name,
  ownerId: lists.ownerId,
  createdAt: lists.createdAt,
  archivedAt: lists.archivedAt,
};

export async function GET() {
  const session = await requireSession();
  const activeListId = await requireActiveList(session.user.id);

  const rows = await db
    .select(listColumns)
    .from(lists)
    .innerJoin(listMembers, eq(listMembers.listId, lists.id))
    .where(and(eq(listMembers.userId, session.user.id), isNull(lists.archivedAt)))
    .orderBy(asc(lists.createdAt));

  const archivedLists = await db
    .select(listColumns)
    .from(lists)
    .where(and(eq(lists.ownerId, session.user.id), isNotNull(lists.archivedAt)))
    .orderBy(asc(lists.createdAt));

  return NextResponse.json({ lists: rows, archivedLists, activeListId });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();

  const body = await req.json();
  const { name } = body as { name: string };

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }

  const now = new Date();
  const [created] = await db
    .insert(lists)
    .values({ name: name.trim(), ownerId: session.user.id, createdAt: now })
    .returning();

  await db.insert(listMembers).values({ listId: created.id, userId: session.user.id, addedAt: now });
  // Ohne Standardkategorien landet der Nutzer in einer Liste, in der sich kein
  // Artikel speichern laesst -- siehe seedDefaultCategories.
  await seedDefaultCategories(created.id);
  await seedDefaultPlaces(created.id);
  // Erst wenn beides steht, laesst sich das eine aufs andere zeigen.
  await applyDefaultCategoryPlaces(created.id);
  await db.update(user).set({ activeListId: created.id }).where(eq(user.id, session.user.id));

  return NextResponse.json(created, { status: 201 });
}
