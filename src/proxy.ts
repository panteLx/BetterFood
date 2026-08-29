import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PREFIXES = ["/login", "/register", "/scan", "/confirm", "/api/auth", "/api/lookup"];

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
    const login = new URL("/login", request.url);
    const target = pathname + request.nextUrl.search;
    if (target !== "/") login.searchParams.set("redirect", target);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
