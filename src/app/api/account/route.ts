import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { readAccountAccess } from "@/lib/account";
import { oidcDisplayName } from "@/lib/oidc";

/**
 * Was das Konto ist und was sich daran aendern laesst.
 *
 * Name und E-Mail kommen frisch aus der Tabelle und nicht aus dem
 * Sitzungsobjekt: optionalSession() liegt hinter "use cache: private", und
 * eine gerade geaenderte Adresse stuende dort unter Umstaenden noch alt drin.
 * Die Sitzung liefert hier nur die Identitaet.
 */
export async function GET() {
  const session = await requireSession();

  const row = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, session.user.id))
    .get();

  if (!row) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }

  const access = await readAccountAccess(session.user.id);

  return NextResponse.json({
    name: row.name,
    email: row.email,
    hasPassword: access.hasPassword,
    providers: access.providers,
    // Nur die Beschriftung der Hinweiszeile fuer SSO-Konten. Zur Laufzeit
    // gelesen, nie als NEXT_PUBLIC_ ins Bundle gebacken -- siehe lib/oidc.ts.
    ssoName: oidcDisplayName(),
  });
}
