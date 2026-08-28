import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

const LEAD_DAYS_KEY = "notification_lead_days";
const DEFAULT_LEAD_DAYS = 2;

export async function GET() {
  const session = await requireSession();
  const row = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, session.user.id), eq(settings.key, LEAD_DAYS_KEY)))
    .get();
  const leadDays = row ? Number(row.value) : DEFAULT_LEAD_DAYS;
  return NextResponse.json({ leadDays });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  const { leadDays } = (await req.json()) as { leadDays: number };

  if (!Number.isFinite(leadDays) || leadDays < 0 || leadDays > 30) {
    return NextResponse.json({ error: "leadDays muss zwischen 0 und 30 liegen" }, { status: 400 });
  }

  await db
    .insert(settings)
    .values({ userId: session.user.id, key: LEAD_DAYS_KEY, value: String(leadDays) })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value: String(leadDays) },
    });

  return NextResponse.json({ leadDays });
}
