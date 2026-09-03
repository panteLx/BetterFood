import { NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWebPush, sendToSubscriptions } from "@/lib/push";
import { requireActiveList, requireSession } from "@/lib/session";
import { buildPreviewNotification } from "@/lib/expiry-check";

export async function POST() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

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
          "Für dieses Konto ist keine Benachrichtigung registriert. Bitte oben erneut einrichten.",
      },
      { status: 404 },
    );
  }

  // Eine echte Meldung zu einem echten Artikel statt "Push-Benachrichtigungen
  // funktionieren.": ein Druck beantwortet dann beide Fragen -- kommt sie an,
  // und wie sieht sie aus. Nur wenn der Vorrat leer ist, bleibt es beim
  // allgemeinen Satz; es gibt dann schlicht nichts vorzuzeigen.
  const preview = await buildPreviewNotification(session.user.id, listId);

  const webpush = getWebPush();
  const payload = JSON.stringify(
    preview ?? {
      title: "🌱 Testbenachrichtigung",
      body: "Push-Benachrichtigungen funktionieren.",
    },
  );

  const sent = await sendToSubscriptions(webpush, subscriptions, payload);

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
