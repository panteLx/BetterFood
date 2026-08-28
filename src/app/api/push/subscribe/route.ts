import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await requireSession();

  const body = await req.json();
  const { endpoint, keys } = body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "ungueltige subscription" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .get();

  if (!existing) {
    await db.insert(pushSubscriptions).values({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      createdAt: new Date(),
      userId: session.user.id,
    });
  } else if (existing.userId !== session.user.id) {
    await db
      .update(pushSubscriptions)
      .set({ userId: session.user.id })
      .where(eq(pushSubscriptions.id, existing.id));
  }

  return NextResponse.json({ ok: true });
}
