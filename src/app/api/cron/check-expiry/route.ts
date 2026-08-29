import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, listMembers, lists, pushSubscriptions, settings } from "@/db/schema";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { getWebPush } from "@/lib/push";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_KEYS,
  NOTIFICATION_TIMES,
  notificationHour,
  type NotificationTime,
} from "@/lib/notification-settings";
import type { Item } from "@/db/schema";

const DEFAULT_LEAD_DAYS = DEFAULT_NOTIFICATION_SETTINGS.leadDays;

// Merker fuer die Wochenuebersicht: der Job laeuft ggf. stuendlich, die
// Uebersicht darf sonntags aber nur einmal rausgehen. Steht als
// Einstellungs-Zeile beim Nutzer, weil sie -- anders als lastNotifiedAt am
// Artikel -- an keinem einzelnen Artikel haengt.
const WEEKLY_SENT_KEY = "notification_weekly_last_sent";

type MemberPreferences = {
  leadDays: number;
  time: NotificationTime;
  weeklySummary: boolean;
  weeklyLastSent: string | null;
};

async function readPreferences(userId: string): Promise<MemberPreferences> {
  const rows = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.userId, userId),
        inArray(settings.key, [...Object.values(NOTIFICATION_KEYS), WEEKLY_SENT_KEY]),
      ),
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const leadDays = Number(byKey.get(NOTIFICATION_KEYS.leadDays));
  const time = byKey.get(NOTIFICATION_KEYS.time);
  const weekly = byKey.get(NOTIFICATION_KEYS.weeklySummary);

  return {
    leadDays: Number.isFinite(leadDays) ? leadDays : DEFAULT_LEAD_DAYS,
    time: NOTIFICATION_TIMES.includes(time as NotificationTime)
      ? (time as NotificationTime)
      : DEFAULT_NOTIFICATION_SETTINGS.time,
    weeklySummary:
      weekly === undefined ? DEFAULT_NOTIFICATION_SETTINGS.weeklySummary : weekly === "1",
    weeklyLastSent: byKey.get(WEEKLY_SENT_KEY) ?? null,
  };
}

/** Lokales Datum als yyyy-mm-dd -- Vergleichsschluessel fuer den Wochenmerker. */
function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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

  // Die gewuenschte Uhrzeit laesst sich nur einhalten, wenn der Job auch
  // stuendlich laeuft. Wer ihn weiterhin einmal am Tag anstoesst, ruft ihn
  // ohne diesen Parameter auf und bekommt wie bisher bei jedem Lauf alles
  // Faellige -- eine stillschweigende Zeitpruefung wuerde dort schlicht nie
  // zutreffen und die Erinnerungen fuer immer verstummen lassen.
  const respectPreferredHour = req.nextUrl.searchParams.get("schedule") === "hourly";
  const currentHour = new Date().getHours();
  const isSunday = new Date().getDay() === 0;
  const todayKey = dateKey(today);

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

    // Vorwarnzeit und Uhrzeit sind persoenliche Einstellungen. Vorher wurde
    // ausschliesslich die des Listen-Eigentuemers gelesen -- ein Mitglied
    // konnte den Wert verstellen, bekam "Gespeichert" und es passierte nichts.
    const preferencesByUser = new Map<string, MemberPreferences>();
    for (const member of members) {
      preferencesByUser.set(member.userId, await readPreferences(member.userId));
    }

    // Einmal die weiteste Vorwarnzeit abfragen und danach pro Mitglied
    // filtern -- statt pro Mitglied erneut die Datenbank zu befragen. Die
    // Wochenuebersicht schaut sieben Tage voraus und weitet das Fenster
    // entsprechend.
    const maxLead = Math.max(
      ...[...preferencesByUser.values()].map((p) =>
        isSunday && p.weeklySummary ? Math.max(p.leadDays, 7) : p.leadDays,
      ),
    );
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
    // Sonntags kann trotzdem etwas rausgehen, auch wenn heute schon jeder
    // einzelne Artikel gemeldet wurde: die Wochenuebersicht haengt nicht an
    // lastNotifiedAt.
    if (notYetNotifiedToday.length === 0 && !isSunday) continue;

    const actuallyNotified = new Set<number>();

    for (const member of members) {
      const prefs = preferencesByUser.get(member.userId)!;

      // Sonntags zusaetzlich zur normalen Vorwarnzeit ein Blick auf die
      // ganze Woche -- und zwar unabhaengig davon, ob die einzelnen Artikel
      // heute schon gemeldet wurden: die Uebersicht ist eine andere Aussage
      // als "das hier laeuft gleich ab".
      const wantsWeekly =
        isSunday && prefs.weeklySummary && prefs.weeklyLastSent !== todayKey;

      if (respectPreferredHour && notificationHour(prefs.time) !== currentHour) continue;

      const threshold = thresholdFor(wantsWeekly ? Math.max(prefs.leadDays, 7) : prefs.leadDays);
      const pool = wantsWeekly ? candidates : notYetNotifiedToday;
      const dueItems = pool.filter((item) => item.expiryDate <= threshold);
      if (dueItems.length === 0) continue;

      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(
          and(isNotNull(pushSubscriptions.userId), eq(pushSubscriptions.userId, member.userId)),
        );
      if (subscriptions.length === 0) continue;

      const payload = JSON.stringify({
        title: wantsWeekly
          ? `Diese Woche: ${dueItems.length} Lebensmittel laufen ab`
          : notificationTitle(dueItems, today),
        body: dueItems.map((i) => i.name).join(", "),
        // Eine Meldung pro Liste ersetzt die vorherige, statt sich zu stapeln.
        tag: `list-${list.id}`,
        url: "/",
        // Aktionen ("Aufgebraucht" / "Noch da") ergeben nur bei genau einem
        // Artikel Sinn -- bei mehreren waere unklar, worauf sie sich beziehen.
        itemId: dueItems.length === 1 ? dueItems[0].id : null,
      });

      let sentToMember = 0;

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          totalSent++;
          sentToMember++;
          // Die Wochenuebersicht verbraucht nicht die Tagesmeldung: sonst
          // bliebe die Milch, die morgen ablaeuft, am Montag stumm.
          if (!wantsWeekly) {
            for (const item of dueItems) actuallyNotified.add(item.id);
          }
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          } else {
            console.error("push notification failed", sub.endpoint, err);
          }
        }
      }
      if (wantsWeekly && sentToMember > 0) {
        await db
          .insert(settings)
          .values({ userId: member.userId, key: WEEKLY_SENT_KEY, value: todayKey })
          .onConflictDoUpdate({
            target: [settings.userId, settings.key],
            set: { value: todayKey },
          });
        prefs.weeklyLastSent = todayKey;
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
