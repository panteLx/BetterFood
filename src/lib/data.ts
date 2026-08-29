import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { normalizeProductName } from "@/lib/utils";

export function categoriesTag(listId: number) {
  return `categories:${listId}`;
}

// Categories change rarely (a handful of edits per list, ever) compared to
// items, so they're worth caching -- invalidated explicitly via
// revalidateTag(categoriesTag(listId), { expire: 0 }) from the category
// mutation routes. Das { expire: 0 } ist wichtig: mit dem sonst empfohlenen
// "max"-Profil wird der naechste Request bewusst noch mit dem alten Stand
// beantwortet (stale-while-revalidate), und die Startseite zeigte direkt nach
// dem Anlegen einer Kategorie deren Roh-Key statt des Labels.
export async function getCategoriesForList(listId: number) {
  "use cache";
  cacheTag(categoriesTag(listId));
  cacheLife("hours");

  return db.select().from(categories).where(eq(categories.listId, listId)).orderBy(asc(categories.label));
}

/**
 * Befuellt eine frisch angelegte Liste mit den Standardkategorien.
 *
 * Ohne das startet jede neue Liste -- und damit auch jeder neue Nutzer -- ohne
 * eine einzige Kategorie, und der erste Artikel laesst sich erst speichern,
 * nachdem sich der Nutzer selbst eine Kategorie samt Haltbarkeit in Tagen
 * ausgedacht hat. Beim Scannen fuehrte das sogar in eine Sackgasse ("Bitte
 * eine Kategorie waehlen") mit bereits ausgefuelltem Produktnamen.
 *
 * Kein revalidateTag noetig: fuer eine gerade erst angelegte listId existiert
 * noch kein Cache-Eintrag, der stale sein koennte.
 */
export async function seedDefaultCategories(listId: number) {
  const now = new Date();
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      shelfLifeDays: category.shelfLifeDays,
      createdAt: now,
      listId,
    })),
  );
}

/** True, wenn die Liste (noch) keine einzige Kategorie hat. */
export async function listHasCategories(listId: number) {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.listId, listId))
    .get();
  return Boolean(existing);
}

/**
 * Wie dieselbe Liste dieses Produkt zuletzt eingeordnet hat -- ueber den
 * Barcode oder, wenn keiner vorliegt, ueber den Namen. Abgehakte und
 * ausgeblendete Artikel zaehlen mit.
 *
 * Das ist die einzige Quelle fuer die Vorauswahl der Kategorie. Vorher wurde
 * aus den Open-Food-Facts-Kategorien geraten, was bei einem grossen Teil der
 * Produkte danebenlag -- und was bei selbst angelegten Kategorien gar nicht
 * funktionieren kann. Ein Produkt, das dieser Haushalt noch nie erfasst hat,
 * bekommt jetzt bewusst keine Vorauswahl: die eine Entscheidung beim ersten
 * Mal ist billiger als das Korrigieren einer falschen Vorgabe bei jedem
 * weiteren Mal.
 */
export async function lookupKnownProduct(
  listId: number,
  lookup: { barcode?: string; name?: string },
) {
  if (lookup.barcode) {
    const byBarcode = await db
      .select({ category: items.category, name: items.name })
      .from(items)
      .where(and(eq(items.listId, listId), eq(items.barcode, lookup.barcode)))
      .orderBy(desc(items.addedAt))
      .get();
    if (byBarcode) return byBarcode;
  }

  if (lookup.name?.trim()) {
    const wanted = normalizeProductName(lookup.name);
    // Der Vergleich laeuft in JS statt in SQL: SQLites LIKE ignoriert nur bei
    // ASCII die Gross-/Kleinschreibung, "Hähnchen" und "hähnchen" waeren dort
    // also verschiedene Namen.
    const recent = await db
      .select({ category: items.category, name: items.name })
      .from(items)
      .where(eq(items.listId, listId))
      .orderBy(desc(items.addedAt))
      .limit(500);
    const byName = recent.find((item) => normalizeProductName(item.name) === wanted);
    if (byName) return byName;
  }

  return null;
}
