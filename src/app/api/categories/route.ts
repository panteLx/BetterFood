import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { slugifyCategoryKey } from "@/lib/categories";

export async function GET() {
  const rows = await db.select().from(categories).orderBy(asc(categories.label));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { label, shelfLifeDays } = body as { label: string; shelfLifeDays: number };

  if (!label || !label.trim()) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }
  if (!Number.isFinite(shelfLifeDays) || shelfLifeDays < 1 || shelfLifeDays > 3650) {
    return NextResponse.json(
      { error: "Haltbarkeit muss zwischen 1 und 3650 Tagen liegen" },
      { status: 400 },
    );
  }

  const existing = await db.select({ key: categories.key }).from(categories);
  const existingKeys = new Set(existing.map((c) => c.key));

  const baseKey = slugifyCategoryKey(label);
  let key = baseKey;
  let suffix = 2;
  while (existingKeys.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  const [created] = await db
    .insert(categories)
    .values({
      key,
      label: label.trim(),
      shelfLifeDays: Math.round(shelfLifeDays),
      createdAt: new Date(),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
