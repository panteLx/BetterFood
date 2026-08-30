import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
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

// Grob genug, um Tippfehler abzufangen, und nicht strenger: eine vollstaendige
// Adresspruefung im regulaeren Ausdruck lehnt am Ende gueltige Adressen ab.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * E-Mail-Adresse aendern -- mit dem aktuellen Passwort als Nachweis.
 *
 * Warum eine eigene Route und nicht direkt authClient.changeEmail:
 *
 * 1. better-auth kennt kein Passwortfeld an dieser Stelle. Ohne eines waere
 *    ein kurz unbeaufsichtigtes, entsperrtes Telefon genug, um den Zugang zum
 *    Konto zu uebernehmen.
 * 2. Ist die Wunschadresse schon vergeben, antwortet better-auth aus
 *    Enumerations-Schutz mit einem Erfolg, ohne etwas zu aendern. Als Antwort
 *    auf ein bewusstes "aendere meine Adresse" waere das schlicht gelogen --
 *    also fragen wir vorher selbst nach und sagen es.
 *
 * Geschrieben wird die Aenderung trotzdem von better-auth: sie erneuert dabei
 * das Sitzungs-Cookie, und dessen Set-Cookie reichen wir weiter.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  const requestHeaders = await headers();

  const access = await readAccountAccess(session.user.id);
  if (!access.hasPassword) {
    return NextResponse.json(
      {
        error: `Deine E-Mail-Adresse wird bei ${oidcDisplayName()} verwaltet`,
      },
      { status: 403 },
    );
  }

  const { newEmail, currentPassword } = (await req.json().catch(() => ({}))) as {
    newEmail?: string;
    currentPassword?: string;
  };

  const email = newEmail?.trim().toLowerCase() ?? "";
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "Bitte eine gültige E-Mail-Adresse eingeben" },
      { status: 400 },
    );
  }
  if (!currentPassword) {
    return NextResponse.json(
      { error: "Bitte das aktuelle Passwort eingeben" },
      { status: 400 },
    );
  }
  if (email === session.user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Das ist bereits deine Adresse" },
      { status: 400 },
    );
  }

  if (isLockedOut(session.user.id)) {
    return NextResponse.json({ error: LOCKED_OUT_MESSAGE }, { status: 429 });
  }

  try {
    await auth.api.verifyPassword({
      body: { password: currentPassword },
      headers: requestHeaders,
    });
  } catch {
    recordFailedAttempt(session.user.id);
    return NextResponse.json(
      { error: "Das aktuelle Passwort ist nicht korrekt" },
      { status: 400 },
    );
  }
  clearAttempts(session.user.id);

  const taken = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .get();
  if (taken) {
    return NextResponse.json(
      { error: "Diese E-Mail-Adresse ist bereits vergeben" },
      { status: 409 },
    );
  }

  let authHeaders: Headers;
  try {
    // Kein blindes Durchreichen: der Pfad ohne Verifikation gilt nur solange
    // emailVerified false ist. Wer sich einmal ueber SSO mit derselben Adresse
    // angemeldet hat, kann verifiziert sein -- dann wirft better-auth hier,
    // und ohne diesen Zweig kaeme statt eines deutschen Satzes eine 500.
    ({ headers: authHeaders } = await auth.api.changeEmail({
      body: { newEmail: email },
      headers: requestHeaders,
      returnHeaders: true,
    }));
  } catch (error) {
    const code = (error as { body?: { code?: string } }).body?.code;
    return NextResponse.json(
      {
        error: authErrorMessage(
          { code },
          "Die E-Mail-Adresse lässt sich hier nicht ändern",
        ),
      },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ email });
  for (const cookie of authHeaders.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
