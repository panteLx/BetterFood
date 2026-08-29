import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { WELCOME_COOKIE } from "@/lib/welcome";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/welcome",
  "/scan",
  "/confirm",
  "/api/auth",
  "/api/lookup",
];

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
  if (!sessionCookie) {
    // Ziel merken, statt jeden Deep-Link (Push-Benachrichtigung, Lesezeichen,
    // Home-Bildschirm-Shortcut) nach dem Login auf der Startseite enden zu
    // lassen. /login und /register reichen den Parameter weiter durch.
    //
    // Wer die App zum ersten Mal oeffnet, bekommt die Einfuehrung statt eines
    // Anmeldeformulars: ein Passwortfeld beantwortet nicht, wofuer man hier
    // ein Konto anlegen sollte. Danach setzt /welcome das Cookie und dieser
    // Zweig faellt fuer immer auf /login zurueck.
    const seenWelcome = request.cookies.has(WELCOME_COOKIE);
    const destination = new URL(seenWelcome ? "/login" : "/welcome", request.url);
    const target = pathname + request.nextUrl.search;
    if (target !== "/") destination.searchParams.set("redirect", target);
    return NextResponse.redirect(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
