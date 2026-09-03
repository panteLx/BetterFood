import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import type { PushSubscriptionRow } from "@/db/schema";

let configured = false;

// Deferred until first use so importing this module (e.g. during `next
// build`'s route data collection) never touches process.env - the VAPID
// keys are only required at actual request time, which lets them be
// supplied purely as container runtime env vars.
export function getWebPush() {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return webpush;
}

/**
 * Verschickt eine Meldung an alle Geräte eines Nutzers und meldet, wie oft
 * das geklappt hat. Abgemeldete Endpunkte (404/410) räumt sie dabei weg --
 * ein Gerät, das der Push-Dienst nicht mehr kennt, bleibt sonst ewig als
 * scheiternder Zustellversuch stehen.
 *
 * Steht hier und nicht im Cron-Job, weil die Testbenachrichtigung dieselbe
 * Schleife braucht und sie vorher Zeile für Zeile ein zweites Mal enthielt.
 */
export async function sendToSubscriptions(
  webpush: ReturnType<typeof getWebPush>,
  subscriptions: PushSubscriptionRow[],
  payload: string,
): Promise<number> {
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        console.error("push notification failed", sub.endpoint, err);
      }
    }
  }
  return sent;
}
