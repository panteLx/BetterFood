import { NextResponse } from "next/server";
import { requireSession, requireActiveList } from "@/lib/session";
import { getKnowledgeForList } from "@/lib/data";

export async function GET() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  return NextResponse.json(await getKnowledgeForList(listId));
}
