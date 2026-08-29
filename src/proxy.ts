import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { WELCOME_COOKIE, WELCOME_COOKIE_MAX_AGE } from "@/lib/welcome";

// Alles, was nicht hier steht, verlangt eine Anmeldung. Scannen gehoert
// bewusst nicht mehr dazu: ein Scan, der nirgends landet, ist kein Feature --
// er kostet den Weg zur Kamera und endet in einer Sackgasse.
//
// /api/cron steht hier, weil ein Cron von aussen kein Sitzungs-Cookie hat:
// bisher leitete der Proxy den Aufruf nach /login um, die Route lief nie und
// die Erinnerungen blieben aus. Ungeschuetzt ist sie deshalb nicht -- sie
// prueft ihr eigenes Bearer-Token (CRON_SECRET).
const PUBLIC_PREFIXES = ["/login", "/register", "/welcome", "/api/auth", "/api/cron"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static/PWA assets (manifest, service worker, icons, hashed workbox
  // bundles) always have a file extension -- let them through unauthenticated
  // so the app shell and offline support keep working while logged out.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (sessionCookie) {
    // Ab hier gibt es ein Konto -- die Einfuehrung hat ihren Zweck erfuellt
    // und muss auch nach einem Abmelden nicht noch einmal erscheinen. Genau
    // hier gesetzt und nicht auf /welcome, weil dieser Zweig jeden Weg ins
    // Konto abdeckt: E-Mail, SSO und eine bereits laufende Sitzung.
    const response = NextResponse.next();
    if (!request.cookies.has(WELCOME_COOKIE)) {
      response.cookies.set(WELCOME_COOKIE, "1", {
        path: "/",
        maxAge: WELCOME_COOKIE_MAX_AGE,
        sameSite: "lax",
      });
    }
    return response;
  }

  // Ziel merken, statt jeden Deep-Link (Push-Benachrichtigung, Lesezeichen,
  // Home-Bildschirm-Shortcut) nach dem Login auf der Startseite enden zu
  // lassen. /login und /register reichen den Parameter weiter durch.
  //
  // Wer die App zum ersten Mal oeffnet, bekommt die Einfuehrung statt eines
  // Anmeldeformulars: ein Passwortfeld beantwortet nicht, wofuer man hier
  // ein Konto anlegen sollte. Sie fuehrt am Ende auf /register und
  // wiederholt sich so lange, bis tatsaechlich ein Konto existiert.
  const seenWelcome = request.cookies.has(WELCOME_COOKIE);
  const destination = new URL(seenWelcome ? "/login" : "/welcome", request.url);
  const target = pathname + request.nextUrl.search;
  if (target !== "/") destination.searchParams.set("redirect", target);
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
