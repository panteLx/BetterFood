import { NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWebPush } from "@/lib/push";
import { requireSession } from "@/lib/session";

export async function POST() {
  const session = await requireSession();

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, session.user.id));

  // Häufigster Fall lokal: der Browser hat die Berechtigung, aber nie eine
  // Subscription hinterlegt. Der Text sagt das, statt nur "404".
  if (subscriptions.length === 0) {
    return NextResponse.json(
      {
        error:
          "Für dieses Konto ist keine Benachrichtigung registriert. Bitte unten erneut einrichten.",
      },
      { status: 404 },
    );
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

  // Alle Zustellversuche gescheitert: das ist ein Fehler und keine Erfolgs-
  // meldung mit sent: 0 -- typischerweise fehlen oder passen die VAPID-Keys
  // nicht zu der Subscription, mit der sich der Browser angemeldet hat.
  if (sent === 0) {
    return NextResponse.json(
      { error: "Zustellung fehlgeschlagen (siehe Serverlog). VAPID-Keys prüfen." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent });
}
