import { db } from "@/db";
import { itemNotifications, items, listMembers, lists, pushSubscriptions, settings } from "@/db/schema";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { getWebPush, sendToSubscriptions } from "@/lib/push";
import { addDays, daysUntil, startOfDay, toDateInputValue } from "@/lib/expiry";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_CATCHUP_UNTIL_HOUR,
  NOTIFICATION_KEYS,
  NOTIFICATION_TIMES,
  notificationHour,
  type NotificationTime,
} from "@/lib/notification-settings";
import type { Item } from "@/db/schema";

const DEFAULT_LEAD_DAYS = DEFAULT_NOTIFICATION_SETTINGS.leadDays;

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

// Wann dieses Mitglied zuletzt überhaupt eine Erinnerung bekommen hat.
//
// Bewusst nur ein Protokoll und kein Filter: gegen doppelte Meldungen schützen
// die Merker in item_notifications, und zwar je Artikel. Als Tagesfilter
// benutzt hätte diese eine Zeile pro Nutzer -- ohne Liste im Schlüssel -- die
// Meldungen aller weiteren Listen verschluckt, sobald die erste etwas
// verschickt hat. Geschrieben wird er nur, wenn wirklich etwas zugestellt
// wurde; /settings/erinnerungen zeigt ihn später als "Zuletzt gesendet".
const LAST_RUN_KEY = "notification_last_run";

// Wie oft sich ein bereits abgelaufener Artikel wieder meldet. Einmal und nie
// wieder wäre genau der Fall, für den die App existiert -- täglich war der
// Zustand vorher und der Grund, warum die Meldungen weggewischt wurden.
const EXPIRED_REPEAT_DAYS = 7;

// Wie weit die Wochenübersicht schaut. "Sonntags, was diese Woche fällig
// ist" soll wörtlich stimmen: vorher zählte sie alles mit, was überhaupt
// unter der Schwelle lag -- inklusive der Ware, die seit Monaten abgelaufen
// im Kühlschrank stand.
const DIGEST_WINDOW_DAYS = 7;

// Ab hier wird der Meldungstext abgeschnitten. iOS zeigt ohnehin nur zwei
// Zeilen; eine kommagetrennte Liste aus zwanzig Namen war weder lesbar noch
// als Vorschau brauchbar.
const BODY_NAME_LIMIT = 5;

type MemberPreferences = {
  leadDays: number;
  time: NotificationTime;
  weeklySummary: boolean;
  weeklyLastSent: string | null;
};

async function readPreferences(userId: string, listId: number): Promise<MemberPreferences> {
  const rows = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.userId, userId),
        inArray(settings.key, [...Object.values(NOTIFICATION_KEYS), weeklySentKey(listId)]),
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
    weeklyLastSent: byKey.get(weeklySentKey(listId)) ?? null,
  };
}

function thresholdFor(leadDays: number): Date {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + leadDays);
  threshold.setHours(23, 59, 59, 999);
  return threshold;
}

/**
 * Die drei Anlässe, zu denen ein Artikel etwas zu sagen hat.
 *
 * Vorher gab es nur einen: "liegt unter der Vorwarnschwelle" -- und weil die
 * Schwelle mehrere Tage umfasst, meldete sich dieselbe Ware an jedem dieser
 * Tage mit exakt demselben Satz, nach dem Ablauf dann täglich weiter. Die
 * Stufe macht aus dem Zustand ein Ereignis: jede sagt etwas anderes, und jede
 * sagt es einmal.
 */
type Stage = "lead" | "zero" | "expired";

/**
 * In welcher Stufe der Artikel heute steckt und wann diese Stufe begonnen hat.
 *
 * Der Beginn lässt sich allein aus dem MHD rechnen, es braucht also keine
 * Stufenspalte in der Datenbank. Das macht die Regel auch selbstheilend: war
 * der Server am Ablauftag aus, ist die Stufe am nächsten Tag immer noch
 * "abgelaufen" und der zugehörige Merker immer noch älter als ihr Beginn --
 * die Meldung kommt verspätet statt gar nicht.
 */
function stageOf(
  item: Item,
  leadDays: number,
  today: Date,
): { stage: Stage; start: Date } | null {
  const days = daysUntil(item.expiryDate, today);
  const expiry = startOfDay(item.expiryDate);

  if (days < 0) return { stage: "expired", start: addDays(1, expiry) };
  if (days === 0) return { stage: "zero", start: expiry };
  if (days <= leadDays) return { stage: "lead", start: addDays(-leadDays, expiry) };
  return null;
}

/**
 * Hat dieses Mitglied die aktuelle Stufe schon gehört?
 *
 * Ein einziger Vergleich: liegt der letzte Merker vor dem Beginn der Stufe,
 * ist die Meldung fällig. Abgelaufene Ware kommt zusätzlich wöchentlich
 * wieder -- ein vergessener Artikel darf nicht für immer verstummen.
 */
function isDue(
  stage: Stage,
  start: Date,
  notifiedAt: Date | undefined,
  today: Date,
): boolean {
  if (!notifiedAt) return true;
  if (notifiedAt < start) return true;
  return stage === "expired" && daysUntil(notifiedAt, today) <= -EXPIRED_REPEAT_DAYS;
}

type DueItem = { item: Item; stage: Stage };

// Vom Dringlichsten zum Unwichtigsten -- die Reihenfolge, in der die Stufen
// im Titel erscheinen.
const STAGE_ORDER: Stage[] = ["expired", "zero", "lead"];

function singleTitle(name: string, stage: Stage): string {
  if (stage === "expired") return `${name} ist abgelaufen`;
  if (stage === "zero") return `${name} läuft heute ab`;
  return `${name} läuft bald ab`;
}

function soleStageTitle(stage: Stage, count: number): string {
  if (stage === "expired") return `${count} Lebensmittel sind abgelaufen`;
  if (stage === "zero") return `${count} Lebensmittel laufen heute ab`;
  return `${count} Lebensmittel laufen bald ab`;
}

function stagePhrase(stage: Stage, count: number): string {
  if (stage === "expired") return `${count} abgelaufen`;
  if (stage === "zero") return count === 1 ? "1 läuft heute ab" : `${count} laufen heute ab`;
  return count === 1 ? "1 läuft bald ab" : `${count} laufen bald ab`;
}

/**
 * Der Titel benennt jede vertretene Stufe mit ihrer Zahl.
 *
 * Vorher entschied allein der dringlichste Artikel über den Satz und die
 * Gesamtzahl füllte ihn auf: ein abgelaufener Joghurt neben zwei heute
 * fälligen ergab "3 Lebensmittel sind abgelaufen" -- eine Aussage, die für
 * zwei von drei Artikeln schlicht falsch war.
 */
function notificationTitle(due: DueItem[]): string {
  if (due.length === 1) return singleTitle(due[0].item.name, due[0].stage);

  const present = STAGE_ORDER.map((stage) => ({
    stage,
    count: due.filter((entry) => entry.stage === stage).length,
  })).filter((entry) => entry.count > 0);

  if (present.length === 1) return soleStageTitle(present[0].stage, present[0].count);
  return present.map((entry) => stagePhrase(entry.stage, entry.count)).join(", ");
}

/** Die Namen, gekappt -- der Rest wird gezählt statt aufgezählt. */
function notificationBody(names: string[]): string {
  if (names.length <= BODY_NAME_LIMIT) return names.join(", ");
  const rest = names.length - BODY_NAME_LIMIT;
  const suffix = rest === 1 ? "+ 1 weiteres" : `+ ${rest} weitere`;
  return `${names.slice(0, BODY_NAME_LIMIT).join(", ")} ${suffix}`;
}

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
    // entsprechend. Nach unten ist das Fenster offen: abgelaufene Ware meldet
    // sich weiter, nur eben wöchentlich statt täglich.
    const maxLead = Math.max(
      ...[...preferencesByUser.values()].map((p) =>
        isSunday && p.weeklySummary ? Math.max(p.leadDays, DIGEST_WINDOW_DAYS) : p.leadDays,
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
          url: "/",
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

          await writeSetting(member.userId, LAST_RUN_KEY, todayKey);
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
        }
      }
    }
  }

  return { sent: totalSent, itemsChecked: totalChecked, itemsNotified: totalNotified };
}
