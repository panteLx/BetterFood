import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runExpiryCheck } from "@/lib/expiry-check";

/**
 * Prueft das Bearer-Token gegen das Secret -- in konstanter Zeit.
 *
 * Ein einfaches !== verraet ueber die Antwortzeit, wie viele Zeichen vorne
 * schon stimmen. Bei einem Token, das nur einmal eingerichtet und danach
 * jahrelang benutzt wird, ist das die Muehe wert.
 */
function tokenMatches(header: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;

  const given = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  // timingSafeEqual wirft bei ungleicher Laenge -- die muss vorher raus.
  // Dass die Laenge damit verraten wird, ist bei einem Zufallstoken egal.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Der Ablauf-Check von aussen angestossen -- fuer Aufrufer, die den Zeitgeber
 * der App nicht nutzen (eigener Cron, systemd-Timer, Uptime-Kuma) oder ihn
 * mit INTERNAL_CRON=false abgeschaltet haben.
 *
 * Diese Route liegt in PUBLIC_PREFIXES des Proxys, weil ein Cron von aussen
 * kein Sitzungs-Cookie hat -- sie ist also die einzige Stelle, die ihre
 * Berechtigung vollstaendig selbst pruefen muss.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Ohne Secret ist der Endpunkt zu, nicht offen. Vorher stand hier ein
  // Vergleich gegen `Bearer ${process.env.CRON_SECRET}` -- bei fehlender
  // Variable also gegen den Literalstring "Bearer undefined", und den kann
  // jeder schicken. Die Erinnerungen selbst haengen nicht daran: der
  // eingebaute Zeitgeber laeuft im Prozess und nicht ueber HTTP.
  if (!secret) {
    return NextResponse.json(
      { error: "cron not configured (CRON_SECRET fehlt)" },
      { status: 503 },
    );
  }

  if (!tokenMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runExpiryCheck({
    respectPreferredHour: req.nextUrl.searchParams.get("schedule") === "hourly",
  });

  return NextResponse.json(result);
}
