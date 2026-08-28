import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { and, like, ne, or } from "drizzle-orm";
import { requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await requireSession();

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const pattern = `%${q}%`;
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      and(ne(user.id, session.user.id), or(like(user.name, pattern), like(user.email, pattern))),
    )
    .limit(8);

  return NextResponse.json({ users: rows });
}
