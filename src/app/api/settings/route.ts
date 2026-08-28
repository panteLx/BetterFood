import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const LEAD_DAYS_KEY = "notification_lead_days";
const DEFAULT_LEAD_DAYS = 2;

export async function GET() {
  const row = await db.select().from(settings).where(eq(settings.key, LEAD_DAYS_KEY)).get();
  const leadDays = row ? Number(row.value) : DEFAULT_LEAD_DAYS;
  return NextResponse.json({ leadDays });
}

export async function PUT(req: NextRequest) {
  const { leadDays } = (await req.json()) as { leadDays: number };

  if (!Number.isFinite(leadDays) || leadDays < 0 || leadDays > 30) {
    return NextResponse.json({ error: "leadDays muss zwischen 0 und 30 liegen" }, { status: 400 });
  }

  await db
    .insert(settings)
    .values({ key: LEAD_DAYS_KEY, value: String(leadDays) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(leadDays) } });

  return NextResponse.json({ leadDays });
}
