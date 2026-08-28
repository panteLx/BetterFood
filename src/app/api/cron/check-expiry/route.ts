import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, pushSubscriptions, settings } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { webpush } from "@/lib/push";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leadRow = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "notification_lead_days"))
    .get();
  const leadDays = leadRow ? Number(leadRow.value) : 2;

  const threshold = new Date();
  threshold.setDate(threshold.getDate() + leadDays);
  threshold.setHours(23, 59, 59, 999);

  const today = startOfToday();

  const candidates = await db
    .select()
    .from(items)
    .where(and(eq(items.status, "active"), lte(items.expiryDate, threshold)));

  const dueItems = candidates.filter(
    (item) => !item.lastNotifiedAt || item.lastNotifiedAt < today,
  );

  if (dueItems.length === 0) {
    return NextResponse.json({ sent: 0, itemsChecked: candidates.length });
  }

  const subscriptions = await db.select().from(pushSubscriptions);

  const names = dueItems.map((i) => i.name).join(", ");
  const payload = JSON.stringify({
    title:
      dueItems.length === 1
        ? `${dueItems[0].name} läuft bald ab`
        : `${dueItems.length} Lebensmittel laufen bald ab`,
    body: names,
  });

  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }

  const now = new Date();
  for (const item of dueItems) {
    await db.update(items).set({ lastNotifiedAt: now }).where(eq(items.id, item.id));
  }

  return NextResponse.json({ sent, itemsNotified: dueItems.length });
}
