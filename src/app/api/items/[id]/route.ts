import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { status } = body as { status: "active" | "used" | "thrown_away" };

  if (!["active", "used", "thrown_away"].includes(status)) {
    return NextResponse.json({ error: "ungueltiger status" }, { status: 400 });
  }

  const [updated] = await db
    .update(items)
    .set({ status })
    .where(eq(items.id, Number(id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
