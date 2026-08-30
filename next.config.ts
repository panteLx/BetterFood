import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  customWorkerSrc: "src/worker",
});

const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV === "development";

/**
 * Die Content-Security-Policy.
 *
 * 'unsafe-inline' bei style-src und script-src ist keine Nachlaessigkeit,
 * sondern das, was Next 16 braucht: der Framework-Code schreibt Inline-Skripte
 * fuer das Streaming der Seite und Inline-Styles fuer die eingebetteten
 * Schriften. 'unsafe-eval' kommt nur im Dev dazu (React Refresh).
 *
 * connect-src bleibt bei 'self': Open Food Facts wird serverseitig abgefragt
 * (lib/off.ts), nie aus dem Browser. Wer das aendert, muss hier nachziehen.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // blob: fuer den Kamera-Stream auf /scan, data: fuer die Icons.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  // Der eigentliche Punkt: ohne das laesst sich jede Seite in einen fremden
  // Iframe haengen, und weil das Sitzungs-Cookie SameSite=Lax ist, geht es
  // dabei mit. Clickjacking auf "Liste loeschen" waere damit praktikabel.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // Dasselbe wie frame-ancestors, fuer Browser die die CSP nicht auswerten.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Kein Referrer nach draussen: sonst steht beim Klick auf einen externen
  // Link die interne Adresse (/item/42) im Log der fremden Seite.
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    // Die Kamera braucht /scan -- alles andere braucht diese App nicht.
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  serverExternalPackages: ["better-sqlite3"],
  // Der Docker-Runner bekommt nur `.next/standalone`: Next spurt beim Build
  // nach, welche Dateien die Routen tatsaechlich laden, und legt genau die
  // plus einen minimalen `server.js` dort ab. Vorher wanderte das komplette
  // Arbeitsverzeichnis ins Image -- inklusive devDependencies (sharp,
  // TypeScript, ESLint) und `.next/cache`, die zur Laufzeit niemand anfasst.
  //
  // `public/` und `.next/static` kopiert Next dabei bewusst nicht mit (sie
  // gehoeren normalerweise vor ein CDN); das Dockerfile holt sie nach, sonst
  // fehlen Service Worker, Manifest und alle Client-Bundles.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: isDev
          ? securityHeaders
          : [
              ...securityHeaders,
              // Nur in Produktion: lokal laeuft die App ueber http, und ein
              // einmal gesetztes HSTS auf localhost sperrt jedes andere
              // http-Projekt auf demselben Host mit aus.
              {
                key: "Strict-Transport-Security",
                value: "max-age=31536000; includeSubDomains",
              },
            ],
      },
    ];
  },
};

export default withPWA(nextConfig);
