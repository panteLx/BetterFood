import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, listMembers, lists, pushSubscriptions, settings } from "@/db/schema";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { getWebPush } from "@/lib/push";
import type { Item } from "@/db/schema";

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

/**
 * Der Ton unterscheidet sich nach Dringlichkeit: dieselbe Ware meldete sich
 * bisher an drei aufeinanderfolgenden Tagen mit exakt demselben Satz. Ist
 * etwas bereits abgelaufen oder laeuft heute ab, soll die Meldung das auch
 * sagen.
 */
function notificationTitle(dueItems: Item[], today: Date): string {
  const soonest = Math.min(
    ...dueItems.map((item) =>
      Math.round((item.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    ),
  );
  const single = dueItems.length === 1;

  if (soonest < 0) {
    return single
      ? `${dueItems[0].name} ist abgelaufen`
      : `${dueItems.length} Lebensmittel sind abgelaufen`;
  }
  if (soonest === 0) {
    return single
      ? `${dueItems[0].name} läuft heute ab`
      : `${dueItems.length} Lebensmittel laufen heute ab`;
  }
  return single
    ? `${dueItems[0].name} läuft bald ab`
    : `${dueItems.length} Lebensmittel laufen bald ab`;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = startOfToday();
  const webpush = getWebPush();

  const allLists = await db.select({ id: lists.id }).from(lists);

  let totalSent = 0;
  let totalNotified = 0;
  let totalChecked = 0;

  for (const list of allLists) {
    const members = await db
      .select({ userId: listMembers.userId })
      .from(listMembers)
      .where(eq(listMembers.listId, list.id));
    if (members.length === 0) continue;

    // Die Vorwarnzeit ist eine persoenliche Einstellung. Vorher wurde
    // ausschliesslich die des Listen-Eigentuemers gelesen -- ein Mitglied
    // konnte den Wert verstellen, bekam "Gespeichert" und es passierte nichts.
    const leadDaysByUser = new Map<string, number>();
    for (const member of members) {
      const row = await db
        .select()
        .from(settings)
        .where(
          and(eq(settings.userId, member.userId), eq(settings.key, "notification_lead_days")),
        )
        .get();
      const parsed = row ? Number(row.value) : NaN;
      leadDaysByUser.set(
        member.userId,
        Number.isFinite(parsed) ? parsed : DEFAULT_LEAD_DAYS,
      );
    }

    // Einmal die weiteste Vorwarnzeit abfragen und danach pro Mitglied
    // filtern -- statt pro Mitglied erneut die Datenbank zu befragen.
    const maxLead = Math.max(...leadDaysByUser.values());
    const candidates = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.status, "active"),
          eq(items.listId, list.id),
          isNull(items.hiddenAt),
          lte(items.expiryDate, thresholdFor(maxLead)),
        ),
      );
    totalChecked += candidates.length;

    const notYetNotifiedToday = candidates.filter(
      (item) => !item.lastNotifiedAt || item.lastNotifiedAt < today,
    );
    if (notYetNotifiedToday.length === 0) continue;

    const actuallyNotified = new Set<number>();

    for (const member of members) {
      const threshold = thresholdFor(leadDaysByUser.get(member.userId) ?? DEFAULT_LEAD_DAYS);
      const dueItems = notYetNotifiedToday.filter((item) => item.expiryDate <= threshold);
      if (dueItems.length === 0) continue;

      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(
          and(isNotNull(pushSubscriptions.userId), eq(pushSubscriptions.userId, member.userId)),
        );
      if (subscriptions.length === 0) continue;

      const payload = JSON.stringify({
        title: notificationTitle(dueItems, today),
        body: dueItems.map((i) => i.name).join(", "),
        // Eine Meldung pro Liste ersetzt die vorherige, statt sich zu stapeln.
        tag: `list-${list.id}`,
        url: "/",
        // Aktionen ("Aufgebraucht" / "Noch da") ergeben nur bei genau einem
        // Artikel Sinn -- bei mehreren waere unklar, worauf sie sich beziehen.
        itemId: dueItems.length === 1 ? dueItems[0].id : null,
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          totalSent++;
          for (const item of dueItems) actuallyNotified.add(item.id);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          } else {
            console.error("push notification failed", sub.endpoint, err);
          }
        }
      }
    }

    // Nur als benachrichtigt markieren, was auch wirklich rausging -- sonst
    // verschluckt ein fehlgeschlagener Versand die Meldung fuer diesen Tag.
    if (actuallyNotified.size > 0) {
      const now = new Date();
      await db
        .update(items)
        .set({ lastNotifiedAt: now })
        .where(inArray(items.id, Array.from(actuallyNotified)));
      totalNotified += actuallyNotified.size;
    }
  }

  return NextResponse.json({ sent: totalSent, itemsChecked: totalChecked, itemsNotified: totalNotified });
}
