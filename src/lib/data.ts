import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export function categoriesTag(listId: number) {
  return `categories:${listId}`;
}

// Categories change rarely (a handful of edits per list, ever) compared to
// items, so they're worth caching -- invalidated explicitly via
// revalidateTag(categoriesTag(listId)) from the category mutation routes.
export async function getCategoriesForList(listId: number) {
  "use cache";
  cacheTag(categoriesTag(listId));
  cacheLife("hours");

  return db.select().from(categories).where(eq(categories.listId, listId)).orderBy(asc(categories.label));
}
