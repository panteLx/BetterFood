import { NextRequest, NextResponse } from "next/server";
import { runExpiryCheck } from "@/lib/expiry-check";

/**
 * Der Ablauf-Check von aussen angestossen -- fuer Aufrufer, die den Zeitgeber
 * der App nicht nutzen (eigener Cron, systemd-Timer, Uptime-Kuma) oder ihn
 * mit INTERNAL_CRON=false abgeschaltet haben.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runExpiryCheck({
    respectPreferredHour: req.nextUrl.searchParams.get("schedule") === "hourly",
  });

  return NextResponse.json(result);
}
