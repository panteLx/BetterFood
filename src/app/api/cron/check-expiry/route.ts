import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, listMembers, lists, pushSubscriptions, settings } from "@/db/schema";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getWebPush } from "@/lib/push";

const DEFAULT_LEAD_DAYS = 2;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function thresholdFor(leadDays: number): Date {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + leadDays);
  threshold.setHours(23, 59, 59, 999);
  return threshold;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = startOfToday();
  const webpush = getWebPush();

  const allLists = await db.select({ id: lists.id, ownerId: lists.ownerId }).from(lists);

  let totalSent = 0;
  let totalNotified = 0;
  let totalChecked = 0;

  for (const list of allLists) {
    const leadRow = await db
      .select()
      .from(settings)
      .where(and(eq(settings.userId, list.ownerId), eq(settings.key, "notification_lead_days")))
      .get();
    const leadDays = leadRow ? Number(leadRow.value) : DEFAULT_LEAD_DAYS;
    const threshold = thresholdFor(leadDays);

    const candidates = await db
      .select()
      .from(items)
      .where(
        and(eq(items.status, "active"), eq(items.listId, list.id), lte(items.expiryDate, threshold)),
      );
    totalChecked += candidates.length;

    const dueItems = candidates.filter(
      (item) => !item.lastNotifiedAt || item.lastNotifiedAt < today,
    );
    if (dueItems.length === 0) continue;

    const memberIds = await db
      .select({ userId: listMembers.userId })
      .from(listMembers)
      .where(eq(listMembers.listId, list.id));
    if (memberIds.length === 0) continue;

    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          isNotNull(pushSubscriptions.userId),
          inArray(
            pushSubscriptions.userId,
            memberIds.map((m) => m.userId),
          ),
        ),
      );

    const names = dueItems.map((i) => i.name).join(", ");
    const payload = JSON.stringify({
      title:
        dueItems.length === 1
          ? `${dueItems[0].name} läuft bald ab`
          : `${dueItems.length} Lebensmittel laufen bald ab`,
      body: names,
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        totalSent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error("push notification failed", sub.endpoint, err);
        }
      }
    }

    const now = new Date();
    for (const item of dueItems) {
      await db.update(items).set({ lastNotifiedAt: now }).where(eq(items.id, item.id));
    }
    totalNotified += dueItems.length;
  }

  return NextResponse.json({ sent: totalSent, itemsChecked: totalChecked, itemsNotified: totalNotified });
}
