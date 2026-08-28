import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
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
  const { name, category, barcode, expiryDate } = body as {
    name: string;
    category: string;
    barcode?: string;
    expiryDate?: string;
  };

  if (!name || !category) {
    return NextResponse.json({ error: "name und category sind erforderlich" }, { status: 400 });
  }

  const now = new Date();
  const expiry = expiryDate ? new Date(expiryDate) : estimateExpiryDate(category, now);

  const [created] = await db
    .insert(items)
    .values({
      name,
      category,
      barcode: barcode ?? null,
      addedAt: now,
      expiryDate: expiry,
      status: "active",
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
