import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await requireSession();

  const body = await req.json();
  const { endpoint, keys } = body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "ungueltige subscription" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .get();

  if (!existing) {
    await db.insert(pushSubscriptions).values({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      createdAt: new Date(),
      userId: session.user.id,
      sessionId: session.session.id,
    });
  } else if (
    existing.userId !== session.user.id ||
    existing.sessionId !== session.session.id
  ) {
    // Auch bei gleichbleibendem Konto neu binden: nach jeder Anmeldung ist
    // die Sitzung eine andere, und nur ueber die aktuelle haengt die
    // Push-Anmeldung mit, wenn dieses Geraet in den Kontoeinstellungen
    // abgemeldet wird.
    await db
      .update(pushSubscriptions)
      .set({ userId: session.user.id, sessionId: session.session.id })
      .where(eq(pushSubscriptions.id, existing.id));
  }

  return NextResponse.json({ ok: true });
}

/**
 * Gegenstück zum Abmelden: ein Gerät, das sich ausloggt, darf ab diesem Moment
 * keine Benachrichtigungen des Kontos mehr bekommen. Früher blieb die
 * Subscription in der Datenbank stehen und lieferte weiter -- bis sich
 * zufällig ein anderes Konto auf demselben Gerät anmeldete und die Zeile per
 * POST übernahm.
 */
export async function DELETE(req: NextRequest) {
  const session = await requireSession();

  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  const endpoint = body?.endpoint;

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint fehlt" }, { status: 400 });
  }

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, session.user.id),
      ),
    );

  return NextResponse.json({ ok: true });
}
