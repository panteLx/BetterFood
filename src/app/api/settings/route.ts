import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import {
  NOTIFICATION_HOUR_MAX,
  NOTIFICATION_HOUR_MIN,
  NOTIFICATION_KEYS,
  NOTIFICATION_LAST_RUN_KEY,
  NOTIFICATION_SETTING_KEYS,
  NOTIFICATION_STAGES,
  STAGES,
  isValidNotificationTime,
  parseNotificationSettings,
  type Stage,
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
        inArray(settings.key, [
          ...NOTIFICATION_SETTING_KEYS,
          MONTHLY_GOAL_KEY,
          NOTIFICATION_LAST_RUN_KEY,
        ]),
      ),
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return NextResponse.json({
    ...parseNotificationSettings(byKey),
    // Kein eigener Endpunkt: das Monatsziel ist dieselbe Sorte
    // Nutzereinstellung und liegt in derselben Tabelle. Ein zweiter Aufruf
    // für eine zweite Zeile wäre ein Umweg um nichts.
    monthlyGoal: parseMonthlyGoal(byKey.get(MONTHLY_GOAL_KEY)),
    // Keine Einstellung, sondern ein Protokoll: der Cron-Job schreibt die
    // Zeile, die Seite zeigt sie als "Zuletzt gesendet". Roh durchgereicht --
    // ob daraus "Heute, 09:14" oder ein Datum wird, entscheidet die Anzeige.
    lastSentAt: byKey.get(NOTIFICATION_LAST_RUN_KEY) ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  const { leadDays, time, weeklySummary, stages, monthlyGoal } = (await req.json()) as {
    leadDays?: number;
    time?: string;
    weeklySummary?: boolean;
    stages?: Partial<Record<Stage, boolean>>;
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
    if (!isValidNotificationTime(time)) {
      return NextResponse.json(
        {
          error: `Uhrzeit muss eine volle Stunde zwischen ${NOTIFICATION_HOUR_MIN} und ${NOTIFICATION_HOUR_MAX} sein`,
        },
        { status: 400 },
      );
    }
    updates.push({ key: NOTIFICATION_KEYS.time, value: time });
  }

  if (weeklySummary !== undefined) {
    updates.push({ key: NOTIFICATION_KEYS.weeklySummary, value: weeklySummary ? "1" : "0" });
  }

  // Ein Durchlauf über die Anlass-Karte statt eines handgeschriebenen Zweigs
  // je Schalter: ein weiterer Anlass ist damit ein Eintrag in
  // NOTIFICATION_STAGES und sonst nichts.
  if (stages !== undefined) {
    for (const stage of STAGES) {
      const value = stages[stage];
      if (value === undefined) continue;
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: `ungültiger Wert für ${stage}` }, { status: 400 });
      }
      updates.push({ key: NOTIFICATION_STAGES[stage].key, value: value ? "1" : "0" });
    }
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
