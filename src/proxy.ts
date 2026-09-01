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
//
// /demo ist die einzige Seite ohne requireSession(). Sie darf das, weil sie
// die Datenbank gar nicht anfasst: ihr Vorrat steht fest in demo-data.ts und
// ist fuer jeden Besucher derselbe. Die Regel "jede Route prueft zusaetzlich
// selbst" bleibt damit unangetastet -- hier gibt es nichts zu pruefen, weil
// es nichts Fremdes zu sehen gibt. Die Seite ist ausserdem rein lesend: sie
// setzt keinen einzigen Schreibzugriff ab, und die Origin-Pruefung ueber
// UNSAFE_METHODS bleibt fuer alles unter /api ohnehin unveraendert bestehen.
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/welcome",
  "/demo",
  "/api/auth",
  "/api/cron",
];

// Eine Allowlist echter Asset-Endungen. Vorher stand hier /\.[a-zA-Z0-9]+$/ --
// also "irgendein Punkt im letzten Segment", und damit war jeder Pfad, der so
// aussah, an diesem Gate vorbei. Ausnutzbar war das nicht, weil jede Route und
// jede datentragende Seite zusaetzlich selbst requireSession() aufruft; eine
// Falle fuer die naechste Route, die sich allein auf den Proxy verlaesst, war
// es trotzdem -- und genau das tun die Client-Seiten unter /settings.
const ASSET_EXTENSIONS =
  /\.(?:js|mjs|css|map|json|webmanifest|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|txt|xml)$/i;

// Alles, was Zustand aendert, muss vom eigenen Ursprung kommen. Das
// Sitzungs-Cookie ist SameSite=Lax, faengt einen fremden POST also bereits ab
// -- aber das ist eine einzelne Schicht, und req.json() prueft den
// Content-Type nicht. Hier steht die zweite, an einer Stelle fuer alle Routen,
// auch die, die es noch nicht gibt.
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Kommt diese Anfrage von der eigenen Seite?
 *
 * Verglichen wird der Host, nicht der ganze Origin. Zwei Gruende, beide
 * nachgemessen:
 *
 * - `request.nextUrl.origin` gibt NICHT den Host-Header wieder. Unter
 *   `next start` steht dort die Adresse, an die der Server gebunden ist --
 *   ein Aufruf an 127.0.0.1 wurde damit als fremd abgewiesen, obwohl er es
 *   nicht war. Massgeblich ist, was der Browser adressiert hat, und das steht
 *   im Host-Header (bzw. in x-forwarded-host, wenn ein Proxy ihn umschreibt).
 * - Das Schema faellt bewusst weg: hinter einem TLS-terminierenden Proxy
 *   schickt der Browser https://…, waehrend intern http gesprochen wird. Der
 *   Host traegt die Sicherheitsaussage ohnehin allein -- eine fremde Seite
 *   kann ihn nicht auf den eigenen setzen, ohne die Domain zu besitzen.
 *
 * BETTER_AUTH_URL zaehlt zusaetzlich: es ist die oeffentliche Adresse, die
 * ohnehin stimmen muss, und rettet den Fall eines Proxys, der den Host auf
 * einen internen Namen umschreibt.
 */
function isOwnOrigin(origin: string, request: NextRequest): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Ein unlesbarer Origin (z. B. "null" bei einer sandboxed iframe) ist
    // nichts, dem wir eine Schreiboperation anvertrauen.
    return false;
  }

  const candidates = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  ];

  const configured = process.env.BETTER_AUTH_URL;
  if (configured) {
    try {
      candidates.push(new URL(configured).host);
    } catch {
      // Eine kaputte BETTER_AUTH_URL faellt hier einfach weg -- better-auth
      // beschwert sich darueber an eigener Stelle laut genug.
    }
  }

  return candidates.some((candidate) => candidate === originHost);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (UNSAFE_METHODS.has(request.method) && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    // Kein Origin-Header heisst: kein Browser. Das ist der Cron von aussen,
    // und der weist sich mit seinem eigenen Token aus. Schickt ein Browser
    // einen mit, muss es der eigene sein.
    if (origin && !isOwnOrigin(origin, request)) {
      return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
    }
  }

  // Static/PWA assets (manifest, service worker, icons, hashed workbox
  // bundles) always have a file extension -- let them through unauthenticated
  // so the app shell and offline support keep working while logged out.
  if (ASSET_EXTENSIONS.test(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  // Einfuehrung und Demo-Vorschau sind Antworten auf die Frage "wofuer soll ich
  // hier ein Konto anlegen?". Wer eines hat, hat sie beantwortet: die vier
  // Slides waeren dann eine Werbung fuer etwas, das er bereits besitzt, und der
  // Demo-Vorrat acht erfundene Artikel, die neben seinen echten stehen und sich
  // nicht anfassen lassen. Beides fuehrt zurueck auf die Startseite.
  //
  // Vor der Allowlist und nicht danach, weil /welcome und /demo dort stehen --
  // sonst waere die oeffentliche Ausnahme staerker als diese Regel. /login und
  // /register bleiben bewusst erreichbar: das Konto zu wechseln ist etwas, das
  // ein angemeldeter Nutzer legitim will.
  if (sessionCookie && (pathname.startsWith("/welcome") || pathname.startsWith("/demo"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

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
