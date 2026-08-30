import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { session as sessionTable } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { dropUnboundPushSubscriptions } from "@/lib/account";

/**
 * Ein einzelnes Geraet abmelden.
 *
 * Die eigene Sitzung ist ausgenommen: ein Rauswurf, der einen selbst trifft,
 * ist kein Rauswurf, sondern ein Abmelden -- und das laeuft ueber den Knopf
 * darunter, weil dort vorher noch die Push-Anmeldung dieses Geraets geloescht
 * wird, solange die Sitzung den Aufruf noch autorisiert.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;

  if (id === session.session.id) {
    return NextResponse.json(
      { error: "Dieses Gerät meldest du über „Abmelden“ ab" },
      { status: 400 },
    );
  }

  const removed = await db
    .delete(sessionTable)
    .where(and(eq(sessionTable.id, id), eq(sessionTable.userId, session.user.id)))
    .returning({ id: sessionTable.id });

  if (removed.length === 0) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  await dropUnboundPushSubscriptions(session.user.id);

  return NextResponse.json({ ok: true });
}
