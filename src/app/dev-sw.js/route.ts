import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Liefert den Service Worker im Entwicklungsmodus aus.
 *
 * Im Produktions-Build baut `@ducanh2912/next-pwa` aus `src/worker/index.js`
 * den Worker und registriert ihn selbst. Im Dev passiert davon nichts:
 * `next dev` läuft in Next 16 mit Turbopack, next-pwa ist ein
 * Webpack-Plugin und damit wirkungslos (`disable` in `next.config.ts` ändert
 * daran nichts). Ohne registrierten Service Worker gibt es keine
 * PushManager-Subscription -- die Berechtigung liess sich lokal zwar
 * erteilen, danach blieb `navigator.serviceWorker.ready` aber fuer immer
 * offen, und die Testbenachrichtigung scheiterte mit 404, weil serverseitig
 * nie eine Subscription ankam.
 *
 * Bewusst eine Route statt einer Kopie in `public/`: so bleibt
 * `src/worker/index.js` die einzige Quelle und Dev- und Produktions-Worker
 * können nicht auseinanderlaufen. Ohne Workbox-Precaching -- im Dev waere
 * Caching nur im Weg.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not Found", { status: 404 });
  }

  const source = await readFile(
    path.join(process.cwd(), "src", "worker", "index.js"),
    "utf8",
  );

  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
    },
  });
}
