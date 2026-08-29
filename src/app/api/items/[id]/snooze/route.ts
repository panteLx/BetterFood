import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession, requireActiveList } from "@/lib/session";

/**
 * "Noch da" aus der Benachrichtigung heraus.
 *
 * Setzt lastNotifiedAt auf das MHD des Artikels. Die Dedupe-Regel des
 * Cron-Jobs ist `lastNotifiedAt < heute`, damit meldet sich der Artikel erst
 * wieder, wenn er tatsaechlich abgelaufen ist -- und nicht mehr jeden Tag mit
 * demselben Text, was bisher bis zu drei identische Meldungen pro Artikel
 * bedeutete.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const { id } = await params;
  const itemId = Number(id);

  const item = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.listId, listId), eq(items.status, "active")))
    .get();

  if (!item) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  // Nie in die Vergangenheit zurueckdrehen: bei einem bereits abgelaufenen
  // Artikel wuerde das MHD die Meldung sofort wieder freigeben.
  const now = new Date();
  const until = item.expiryDate > now ? item.expiryDate : now;

  await db.update(items).set({ lastNotifiedAt: until }).where(eq(items.id, itemId));

  return NextResponse.json({ ok: true, snoozedUntil: until.toISOString() });
}
