import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { session as sessionTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { readAccountAccess } from "@/lib/account";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  clearAttempts,
  isLockedOut,
  LOCKED_OUT_MESSAGE,
  recordFailedAttempt,
} from "@/lib/attempt-limit";
import { oidcDisplayName } from "@/lib/oidc";

// Dieselbe Untergrenze wie better-auths Voreinstellung und wie der Text auf
// der Registrierung -- geprueft wird hier trotzdem, damit die Meldung deutsch
// ist und nicht erst aus der Bibliothek zurueckkommt.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Passwort aendern.
 *
 * Die Arbeit macht better-auth; diese Route liegt aus einem Grund davor, der
 * erst nach dem Umschalten sichtbar wird: mit "auf allen anderen Geraeten
 * abmelden" wirft better-auth **alle** Sitzungen weg, auch die eigene, und
 * legt intern eine neue an -- ohne Request, also ohne User-Agent und ohne IP.
 * In der Geraeteliste stuende danach "Unbekanntes Geraet" fuer genau das
 * Geraet, an dem man gerade sitzt. Also tragen wir beides hier nach.
 *
 * Getroffen wird dabei nur die frisch angelegte Zeile: eine Sitzung ohne
 * User-Agent kann nur so entstanden sein.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  const requestHeaders = await headers();

  const access = await readAccountAccess(session.user.id);
  if (!access.hasPassword) {
    return NextResponse.json(
      { error: `Dein Passwort wird bei ${oidcDisplayName()} verwaltet` },
      { status: 403 },
    );
  }

  const { currentPassword, newPassword, revokeOtherSessions } = (await req
    .json()
    .catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
    revokeOtherSessions?: boolean;
  };

  if (!currentPassword) {
    return NextResponse.json(
      { error: "Bitte das aktuelle Passwort eingeben" },
      { status: 400 },
    );
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen`,
      },
      { status: 400 },
    );
  }

  if (isLockedOut(session.user.id)) {
    return NextResponse.json({ error: LOCKED_OUT_MESSAGE }, { status: 429 });
  }

  let authHeaders: Headers;
  try {
    ({ headers: authHeaders } = await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: Boolean(revokeOtherSessions),
      },
      headers: requestHeaders,
      returnHeaders: true,
    }));
  } catch (error) {
    const code = (error as { body?: { code?: string } }).body?.code;
    // Nur ein falsches aktuelles Passwort zaehlt als Versuch -- ein zu kurzes
    // neues ist ein Vertipper, kein Raten.
    if (code === "INVALID_PASSWORD") recordFailedAttempt(session.user.id);
    return NextResponse.json(
      { error: authErrorMessage({ code }, "Konnte das Passwort nicht ändern") },
      { status: 400 },
    );
  }
  clearAttempts(session.user.id);

  if (revokeOtherSessions) {
    await db
      .update(sessionTable)
      .set({
        userAgent: requestHeaders.get("user-agent"),
        ipAddress: session.session.ipAddress ?? null,
      })
      .where(
        and(
          eq(sessionTable.userId, session.user.id),
          isNull(sessionTable.userAgent),
        ),
      );
  }

  const response = NextResponse.json({ ok: true });
  for (const cookie of authHeaders.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
