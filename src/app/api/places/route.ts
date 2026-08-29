import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { places } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";
import { getPlacesForList, placesTag } from "@/lib/data";

export async function GET() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  return NextResponse.json(await getPlacesForList(listId));
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { name } = (await req.json()) as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }

  const last = await db
    .select({ position: places.position })
    .from(places)
    .where(eq(places.listId, listId))
    .orderBy(desc(places.position))
    .get();

  const [created] = await db
    .insert(places)
    .values({
      name: name.trim(),
      position: (last?.position ?? -1) + 1,
      createdAt: new Date(),
      listId,
    })
    .returning();

  revalidateTag(placesTag(listId), { expire: 0 });

  return NextResponse.json(created, { status: 201 });
}
