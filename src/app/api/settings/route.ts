import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_KEYS,
  NOTIFICATION_TIMES,
  type NotificationTime,
} from "@/lib/notification-settings";
import {
  MONTHLY_GOAL_KEY,
  isValidMonthlyGoal,
  parseMonthlyGoal,
} from "@/lib/monthly-goal";

export async function GET() {
  const session = await requireSession();

  const rows = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.userId, session.user.id),
        inArray(settings.key, [...Object.values(NOTIFICATION_KEYS), MONTHLY_GOAL_KEY]),
      ),
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const leadDays = Number(byKey.get(NOTIFICATION_KEYS.leadDays));
  const time = byKey.get(NOTIFICATION_KEYS.time);

  return NextResponse.json({
    leadDays: Number.isFinite(leadDays) ? leadDays : DEFAULT_NOTIFICATION_SETTINGS.leadDays,
    time: NOTIFICATION_TIMES.includes(time as NotificationTime)
      ? (time as NotificationTime)
      : DEFAULT_NOTIFICATION_SETTINGS.time,
    weeklySummary:
      byKey.get(NOTIFICATION_KEYS.weeklySummary) === undefined
        ? DEFAULT_NOTIFICATION_SETTINGS.weeklySummary
        : byKey.get(NOTIFICATION_KEYS.weeklySummary) === "1",
    // Kein eigener Endpunkt: das Monatsziel ist dieselbe Sorte
    // Nutzereinstellung und liegt in derselben Tabelle. Ein zweiter Aufruf
    // fuer eine zweite Zeile waere ein Umweg um nichts.
    monthlyGoal: parseMonthlyGoal(byKey.get(MONTHLY_GOAL_KEY)),
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  const { leadDays, time, weeklySummary, monthlyGoal } = (await req.json()) as {
    leadDays?: number;
    time?: string;
    weeklySummary?: boolean;
    monthlyGoal?: number;
  };

  const updates: { key: string; value: string }[] = [];

  if (leadDays !== undefined) {
    if (!Number.isFinite(leadDays) || leadDays < 0 || leadDays > 30) {
      return NextResponse.json({ error: "leadDays muss zwischen 0 und 30 liegen" }, { status: 400 });
    }
    updates.push({ key: NOTIFICATION_KEYS.leadDays, value: String(Math.round(leadDays)) });
  }

  if (time !== undefined) {
    if (!NOTIFICATION_TIMES.includes(time as NotificationTime)) {
      return NextResponse.json({ error: "ungültige Uhrzeit" }, { status: 400 });
    }
    updates.push({ key: NOTIFICATION_KEYS.time, value: time });
  }

  if (weeklySummary !== undefined) {
    updates.push({ key: NOTIFICATION_KEYS.weeklySummary, value: weeklySummary ? "1" : "0" });
  }

  if (monthlyGoal !== undefined) {
    if (!isValidMonthlyGoal(monthlyGoal)) {
      return NextResponse.json(
        { error: "Monatsziel muss zwischen 1 und 100 liegen" },
        { status: 400 },
      );
    }
    updates.push({ key: MONTHLY_GOAL_KEY, value: String(Math.round(monthlyGoal)) });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Keine Änderungen übergeben" }, { status: 400 });
  }

  for (const update of updates) {
    await db
      .insert(settings)
      .values({ userId: session.user.id, key: update.key, value: update.value })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value: update.value },
      });
  }

  return GET();
}
