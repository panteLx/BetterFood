import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { estimateExpiryDate } from "@/lib/categories";

export async function GET() {
  const rows = await db
    .select()
    .from(items)
    .where(eq(items.status, "active"))
    .orderBy(items.expiryDate);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, category, barcode, expiryDate, quantity } = body as {
    name: string;
    category: string;
    barcode?: string;
    expiryDate?: string;
    quantity?: number;
  };

  if (!name || !category) {
    return NextResponse.json({ error: "name und category sind erforderlich" }, { status: 400 });
  }

  const categoryRow = await db
    .select()
    .from(categories)
    .where(eq(categories.key, category))
    .get();

  if (!categoryRow) {
    return NextResponse.json({ error: "ungültige Kategorie" }, { status: 400 });
  }

  const qty = quantity !== undefined ? Math.round(quantity) : 1;
  if (!Number.isFinite(qty) || qty < 1) {
    return NextResponse.json({ error: "Menge muss mindestens 1 sein" }, { status: 400 });
  }

  const now = new Date();
  const expiry = expiryDate ? new Date(expiryDate) : estimateExpiryDate(categoryRow.shelfLifeDays, now);

  const [created] = await db
    .insert(items)
    .values({
      name,
      category,
      barcode: barcode ?? null,
      quantity: qty,
      addedAt: now,
      expiryDate: expiry,
      status: "active",
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
