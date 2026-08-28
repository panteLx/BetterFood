import { NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWebPush } from "@/lib/push";

export async function POST() {
  const subscriptions = await db.select().from(pushSubscriptions);

  if (subscriptions.length === 0) {
    return NextResponse.json({ error: "keine subscription vorhanden" }, { status: 404 });
  }

  const webpush = getWebPush();
  const payload = JSON.stringify({
    title: "Testbenachrichtigung",
    body: "Push-Benachrichtigungen funktionieren.",
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
      } else {
        console.error("push notification failed", sub.endpoint, err);
      }
    }
  }

  return NextResponse.json({ sent });
}
