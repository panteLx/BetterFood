import { db } from "@/db";
import { itemNotifications, items, listMembers, lists, pushSubscriptions, settings } from "@/db/schema";
import { and, asc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { getWebPush, sendToSubscriptions } from "@/lib/push";
import { daysUntil, startOfDay, toDateInputValue } from "@/lib/expiry";
import {
  NOTIFICATION_LAST_RUN_KEY,
  NOTIFICATION_SETTING_KEYS,
  NOTIFICATION_CATCHUP_UNTIL_HOUR,
  notificationHour,
  parseNotificationSettings,
  type NotificationSettings,
} from "@/lib/notification-settings";
import {
  isDue,
  notificationBody,
  notificationTitle,
  stageOf,
} from "@/lib/notification-message";
import type { Item } from "@/db/schema";
import type { Stage } from "@/lib/notification-settings";

// Merker für die Wochenübersicht: der Job läuft ggf. stündlich, die Übersicht
// darf sonntags aber nur einmal rausgehen. Steht als Einstellungs-Zeile beim
// Nutzer, weil sie an keinem einzelnen Artikel hängt -- und je Liste, weil sie
// je Liste verschickt wird. Ohne die Liste im Schlüssel verschluckte die
// Übersicht der ersten Liste die aller weiteren: wer in zwei Haushalten
// mitliest, sah nur den ersten.
const WEEKLY_SENT_KEY = "notification_weekly_last_sent";

function weeklySentKey(listId: number): string {
  return `${WEEKLY_SENT_KEY}:${listId}`;
}

// Wie weit die Wochenübersicht schaut. "Sonntags, was diese Woche fällig
// ist" soll wörtlich stimmen: vorher zählte sie alles mit, was überhaupt
// unter der Schwelle lag -- inklusive der Ware, die seit Monaten abgelaufen
// im Kühlschrank stand.
const DIGEST_WINDOW_DAYS = 7;

type MemberPreferences = NotificationSettings & {
  weeklyLastSent: string | null;
};

async function readPreferences(userId: string, listId: number): Promise<MemberPreferences> {
  const rows = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.userId, userId),
        inArray(settings.key, [...NOTIFICATION_SETTING_KEYS, weeklySentKey(listId)]),
      ),
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    ...parseNotificationSettings(byKey),
    weeklyLastSent: byKey.get(weeklySentKey(listId)) ?? null,
  };
}

function thresholdFor(leadDays: number): Date {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + leadDays);
  threshold.setHours(23, 59, 59, 999);
  return threshold;
}

type DueItem = { item: Item; stage: Stage };

/** Nach MHD aufsteigend: was zuerst weg muss, steht im gekappten Text vorn. */
function byExpiry(a: { expiryDate: Date }, b: { expiryDate: Date }): number {
  return a.expiryDate.getTime() - b.expiryDate.getTime();
}

async function writeSetting(userId: string, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, key, value })
    .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } });
}

export type ExpiryCheckResult = {
  sent: number;
  itemsChecked: number;
  itemsNotified: number;
};

/**
 * Ein Durchlauf der Ablauf-Erinnerungen über alle Listen.
 *
 * Steht als Bibliothek und nicht mehr nur als Route da, weil die App den Lauf
 * seit dem eingebauten Zeitgeber selbst anstößt -- ein HTTP-Aufruf an die
 * eigene Adresse wäre dafür ein Umweg über das Netzwerk, der nur
 * fehlschlagen kann.
 *
 * `respectPreferredHour` hält sich an die pro Nutzer eingestellte Uhrzeit und
 * öffnet von dort ein Nachholfenster bis 22:00. Das setzt einen stündlichen
 * Lauf voraus: wer den Job weiterhin einmal am Tag von außen anstößt,
 * lässt den Schalter aus und bekommt bei jedem Lauf alles Fällige -- eine
 * stillschweigende Zeitprüfung würde dort schlicht nie zutreffen und die
 * Erinnerungen für immer verstummen lassen. Doppelt verschickt wird auch
 * ohne den Schalter nichts: dafür sorgen die Merker in item_notifications.
 */
export async function runExpiryCheck({
  respectPreferredHour,
}: {
  respectPreferredHour: boolean;
}): Promise<ExpiryCheckResult> {
  const now = new Date();
  const today = startOfDay(now);
  const webpush = getWebPush();

  const currentHour = now.getHours();
  const isSunday = now.getDay() === 0;
  const todayKey = toDateInputValue(today);

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

    // Vorwarnzeit und Uhrzeit sind persönliche Einstellungen. Vorher wurde
    // ausschließlich die des Listen-Eigentümers gelesen -- ein Mitglied
    // konnte den Wert verstellen, bekam "Gespeichert" und es passierte nichts.
    const preferencesByUser = new Map<string, MemberPreferences>();
    for (const member of members) {
      preferencesByUser.set(member.userId, await readPreferences(member.userId, list.id));
    }

    // Einmal die weiteste Vorwarnzeit abfragen und danach pro Mitglied
    // filtern -- statt pro Mitglied erneut die Datenbank zu befragen. Die
    // Wochenübersicht schaut sieben Tage voraus und weitet das Fenster
    // entsprechend. Wer die Vorwarnung abgeschaltet hat, schaut gar nicht
    // voraus: seine eingestellte Vorwarnzeit bleibt gespeichert, zählt hier
    // aber nicht mit. Nach unten ist das Fenster offen: abgelaufene Ware
    // meldet sich weiter, nur eben wöchentlich statt täglich.
    const maxLead = Math.max(
      ...[...preferencesByUser.values()].map((p) => {
        const lead = p.stages.lead ? p.leadDays : 0;
        return isSunday && p.weeklySummary ? Math.max(lead, DIGEST_WINDOW_DAYS) : lead;
      }),
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
    if (candidates.length === 0) continue;

    // Alle Merker dieser Liste in einem Zug, statt pro Mitglied und Artikel
    // eine eigene Abfrage.
    const notifiedRows = await db
      .select()
      .from(itemNotifications)
      .where(
        inArray(
          itemNotifications.itemId,
          candidates.map((item) => item.id),
        ),
      );
    const notifiedAtByKey = new Map(
      notifiedRows.map((row) => [`${row.itemId}:${row.userId}`, row.notifiedAt]),
    );

    for (const member of members) {
      const prefs = preferencesByUser.get(member.userId)!;

      // Das Nachholfenster: von der gewählten Stunde bis 22:00. Vorher musste
      // der Lauf exakt zur gewählten Stunde stattfinden -- ein Neustart um
      // 09:05 verschluckte die 09:00-Runde für den ganzen Tag.
      const preferredHour = notificationHour(prefs.time);
      if (
        respectPreferredHour &&
        (currentHour < preferredHour || currentHour > NOTIFICATION_CATCHUP_UNTIL_HOUR)
      ) {
        continue;
      }

      // Sonntags zusätzlich zur Tagesmeldung ein Blick auf die ganze Woche.
      // Die Übersicht ist eine andere Aussage als "das hier läuft gleich ab"
      // und trägt deshalb ihren eigenen tag: vorher ersetzte sie die
      // Tagesmeldung, und die Milch, die morgen abläuft, blieb sonntags stumm.
      const wantsWeekly = isSunday && prefs.weeklySummary && prefs.weeklyLastSent !== todayKey;

      const dueItems: DueItem[] = candidates
        .map((item) => {
          const current = stageOf(item, prefs.leadDays, today);
          if (!current) return null;
          // Abgeschaltete Stufe: der Artikel bekommt keinen Merker und meldet
          // sich damit in seiner nächsten Stufe ganz normal wieder. Wer nur
          // die Vorwarnung abbestellt, hört am Ablauftag trotzdem davon.
          if (!prefs.stages[current.stage]) return null;
          const notifiedAt = notifiedAtByKey.get(`${item.id}:${member.userId}`);
          if (!isDue(current.stage, current.start, notifiedAt, today)) return null;
          return { item, stage: current.stage };
        })
        .filter((entry): entry is DueItem => entry !== null)
        .sort((a, b) => byExpiry(a.item, b.item));

      // Nur die kommenden sieben Tage: die Übersicht sagt "diese Woche", und
      // längst abgelaufene Ware gehört in die Tagesmeldung, nicht in eine
      // Wochenvorschau.
      const digestItems = wantsWeekly
        ? candidates
            .filter((item) => {
              const days = daysUntil(item.expiryDate, today);
              return days >= 0 && days <= DIGEST_WINDOW_DAYS;
            })
            .sort(byExpiry)
        : [];

      if (dueItems.length === 0 && digestItems.length === 0) continue;

      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(
          and(isNotNull(pushSubscriptions.userId), eq(pushSubscriptions.userId, member.userId)),
        );
      if (subscriptions.length === 0) continue;

      if (dueItems.length > 0) {
        const payload = JSON.stringify({
          title: notificationTitle(dueItems),
          body: notificationBody(dueItems.map((entry) => entry.item.name)),
          // Eine Meldung pro Liste ersetzt die vorherige, statt sich zu stapeln.
          tag: `list-${list.id}`,
          // Genau ein Artikel: direkt zu ihm. Bei mehreren führt der Weg auf
          // die Startseite -- die gruppiert den Vorrat bereits in genau die
          // Abschnitte, von denen die Meldung spricht (Abgelaufen / Heute /
          // Morgen / Diese Woche). Es bleibt beim url-Feld: der Service Worker
          // liest ausschließlich das, ein zusätzliches itemId würde er
          // nirgends anfassen.
          url: dueItems.length === 1 ? `/item/${dueItems[0].item.id}` : "/",
        });

        const sent = await sendToSubscriptions(webpush, subscriptions, payload);
        totalSent += sent;

        // Nur als benachrichtigt markieren, was auch wirklich rausging -- sonst
        // verschluckt ein fehlgeschlagener Versand die Stufe endgültig.
        if (sent > 0) {
          await db
            .insert(itemNotifications)
            .values(
              dueItems.map((entry) => ({
                itemId: entry.item.id,
                userId: member.userId,
                notifiedAt: now,
              })),
            )
            .onConflictDoUpdate({
              target: [itemNotifications.itemId, itemNotifications.userId],
              set: { notifiedAt: now },
            });
          totalNotified += dueItems.length;

          await writeSetting(member.userId, NOTIFICATION_LAST_RUN_KEY, now.toISOString());
        }
      }

      if (digestItems.length > 0) {
        const payload = JSON.stringify({
          title: `Diese Woche: ${digestItems.length} Lebensmittel laufen ab`,
          body: notificationBody(digestItems.map((item) => item.name)),
          // Eigener tag: die Übersicht darf die Tagesmeldung nicht ersetzen.
          tag: `list-${list.id}-woche`,
          url: "/",
        });

        const sent = await sendToSubscriptions(webpush, subscriptions, payload);
        totalSent += sent;

        if (sent > 0) {
          await writeSetting(member.userId, weeklySentKey(list.id), todayKey);
          prefs.weeklyLastSent = todayKey;
          // Auch die Übersicht ist eine zugestellte Erinnerung: an einem
          // Sonntag, an dem sonst nichts fällig war, wäre "Zuletzt gesendet"
          // sonst älter als die Meldung, die gerade auf dem Sperrbildschirm
          // liegt.
          await writeSetting(member.userId, NOTIFICATION_LAST_RUN_KEY, now.toISOString());
        }
      }
    }
  }

  return { sent: totalSent, itemsChecked: totalChecked, itemsNotified: totalNotified };
}

/**
 * Die Meldung, die dieser Nutzer als nächstes zu diesem Artikel bekäme --
 * für die Testbenachrichtigung.
 *
 * Genommen wird der Artikel mit dem nächstliegenden MHD, nicht ein gerade
 * fälliger: im Normalfall ist nichts fällig, und ein Test, der dann doch nur
 * "Push-Benachrichtigungen funktionieren." zeigt, beantwortet die zweite
 * Frage nicht (kommt sie an -- und wie sieht sie aus). Liegt das MHD noch
 * jenseits der Vorwarnzeit, wird die Meldung als Vorwarnung formuliert: das
 * ist die Stufe, in der dieser Artikel als nächstes etwas sagen wird.
 *
 * Schreibt bewusst KEINE Merker in item_notifications -- ein Test darf die
 * echte Meldung nicht verschlucken. Und einen eigenen tag, damit er eine
 * bereits liegende Erinnerung nicht ersetzt.
 */
export async function buildPreviewNotification(
  userId: string,
  listId: number,
): Promise<{ title: string; body: string; tag: string; url: string } | null> {
  const item = await db
    .select()
    .from(items)
    .where(and(eq(items.status, "active"), eq(items.listId, listId), isNull(items.hiddenAt)))
    .orderBy(asc(items.expiryDate))
    .get();

  if (!item) return null;

  const prefs = await readPreferences(userId, listId);
  const stage: Stage = stageOf(item, prefs.leadDays, startOfDay(new Date()))?.stage ?? "lead";
  const due: DueItem[] = [{ item, stage }];

  return {
    title: notificationTitle(due),
    body: notificationBody([item.name]),
    tag: "test",
    url: `/item/${item.id}`,
  };
}
