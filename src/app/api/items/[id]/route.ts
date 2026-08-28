import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { name, category, expiryDate, quantity, status } = body as {
    name?: string;
    category?: string;
    expiryDate?: string;
    quantity?: number;
    status?: "active" | "used" | "thrown_away";
  };

  const update: Partial<typeof items.$inferInsert> = {};

  if (name !== undefined) {
    if (!name.trim()) {
      return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    }
    update.name = name.trim();
  }

  if (category !== undefined) {
    const categoryRow = await db
      .select()
      .from(categories)
      .where(eq(categories.key, category))
      .get();
    if (!categoryRow) {
      return NextResponse.json({ error: "ungültige Kategorie" }, { status: 400 });
    }
    update.category = category;
  }

  if (expiryDate !== undefined) {
    update.expiryDate = new Date(expiryDate);
  }

  if (quantity !== undefined) {
    const qty = Math.round(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return NextResponse.json({ error: "Menge muss mindestens 1 sein" }, { status: 400 });
    }
    update.quantity = qty;
  }

  if (status !== undefined) {
    if (!["active", "used", "thrown_away"].includes(status)) {
      return NextResponse.json({ error: "ungueltiger status" }, { status: 400 });
    }
    update.status = status;
    update.resolvedAt = status === "active" ? null : new Date();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Keine Änderungen übergeben" }, { status: 400 });
  }

  const [updated] = await db
    .update(items)
    .set(update)
    .where(eq(items.id, Number(id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
