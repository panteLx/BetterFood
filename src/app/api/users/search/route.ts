import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { and, ne, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/session";

/**
 * Nutzersuche fuers Einladen in eine Liste.
 *
 * Zwei Regeln halten die Nutzertabelle hier zusammen, denn diese Route sucht
 * ueber ALLE Konten der Instanz -- nicht nur ueber die, mit denen man schon
 * eine Liste teilt:
 *
 * 1. Der Name wird unscharf gesucht, die E-Mail-Adresse nur exakt. Aus einem
 *    Namen laesst sich kein Kontakt bauen; eine Adresse dagegen ist genau das,
 *    und mit einer Teiltreffer-Suche liesse sich die Tabelle in ein paar
 *    Dutzend Anfragen leerraeumen. Wer die Adresse ganz kennt, erfaehrt hier
 *    nichts, was er nicht schon wusste.
 * 2. Die Adresse geht nicht mit hinaus. Zum Einladen genuegt die id.
 *
 * Und: die Eingabe wird escaped, bevor sie ins LIKE-Muster wandert. Ohne das
 * ist "%%" ein Muster, das jeden trifft.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession();

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  // % und _ sind LIKE-Platzhalter, \ ist das Escape-Zeichen selbst.
  const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(
      and(
        ne(user.id, session.user.id),
        or(
          sql`${user.name} LIKE ${pattern} ESCAPE '\\'`,
          // lower() auf beiden Seiten: SQLites LIKE ist von sich aus
          // unempfindlich gegen Gross- und Kleinschreibung, = ist es nicht.
          sql`lower(${user.email}) = ${q.toLowerCase()}`,
        ),
      ),
    )
    .limit(8);

  return NextResponse.json({ users: rows });
}
