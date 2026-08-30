import { NextResponse } from "next/server";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { session as sessionTable } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { dropUnboundPushSubscriptions } from "@/lib/account";
import { describeUserAgent } from "@/lib/user-agent";

// Auf dem eigenen Rechner und hinter manchen Proxys steht in der Spalte die
// unspezifizierte oder die Loopback-Adresse. Als "192.168.1.42 · angemeldet
// vor 3 Stunden" hilft eine IP beim Erkennen eines fremden Zugriffs, als
// "0000:0000:0000:0000:0000:0000:0000:0000" verstopft sie nur die Zeile.
const MEANINGLESS_IPS = new Set(["::", "::1", "0.0.0.0", "127.0.0.1"]);

function displayIp(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const compact = value.includes(":")
    ? value.replace(/\b0+(?=[0-9a-f])/gi, "").replace(/(^|:)(0:)+0?($|:)/, "::")
    : value;
  return MEANINGLESS_IPS.has(compact) ? null : value;
}

/**
 * Die angemeldeten Geraete dieses Kontos.
 *
 * Gelesen wird direkt aus der Tabelle, nicht ueber better-auths
 * /list-sessions. Zwei Gruende, beide handfest:
 *
 * - /list-sessions verlangt eine "frische" Sitzung (Voreinstellung: hoechstens
 *   24 Stunden alt) und antwortet allen anderen mit 403. Ausgerechnet die
 *   Uebersicht der eigenen Geraete waere damit fuer fast jeden gesperrt.
 * - Es gibt dort ausserdem den Klartext-Token jeder Sitzung heraus -- also
 *   genau den Wert, der im Cookie steht. Der hat im Browser nichts zu suchen;
 *   hier geht nur die id nach draussen, und die reicht zum Abmelden.
 *
 * Ausgegeben wird `createdAt`, nicht `updatedAt`: die Sitzung wird nur einmal
 * je updateAge (24 Stunden) angefasst, "zuletzt aktiv" waere also bis zu einen
 * Tag daneben -- auf einem Screen, dessen Zweck das Erkennen einer fremden
 * Anmeldung ist, die schlechtere Auskunft. Wann die Anmeldung stattfand, steht
 * dagegen fest.
 */
export async function GET() {
  const session = await requireSession();

  const rows = await db
    .select()
    .from(sessionTable)
    .where(
      and(
        eq(sessionTable.userId, session.user.id),
        gt(sessionTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessionTable.createdAt));

  return NextResponse.json({
    sessions: rows.map((row) => {
      const description = describeUserAgent(row.userAgent);
      return {
        id: row.id,
        device: description.device,
        browser: description.browser,
        kind: description.kind,
        ipAddress: displayIp(row.ipAddress),
        signedInAt: row.createdAt.toISOString(),
        current: row.id === session.session.id,
      };
    }),
  });
}

/**
 * Alle anderen Geraete abmelden -- das eigene bleibt.
 *
 * Das Loeschen der Zeile genuegt: es gibt keinen zweiten Sitzungsspeicher und
 * keinen Cookie-Cache, better-auth prueft jede Anfrage gegen die Tabelle. Und
 * weil push_subscriptions.session_id mit ON DELETE CASCADE daranhaengt,
 * verstummen die Erinnerungen auf dem abgemeldeten Geraet im selben Zug.
 */
export async function DELETE() {
  const session = await requireSession();

  const removed = await db
    .delete(sessionTable)
    .where(
      and(
        eq(sessionTable.userId, session.user.id),
        ne(sessionTable.id, session.session.id),
      ),
    )
    .returning({ id: sessionTable.id });

  if (removed.length > 0) {
    await dropUnboundPushSubscriptions(session.user.id);
  }

  return NextResponse.json({ revoked: removed.length });
}
