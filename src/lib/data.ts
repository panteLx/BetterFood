import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { categories, items, listMembers, lists, places, productKnowledge } from "@/db/schema";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { DEFAULT_CATEGORIES, DEFAULT_PLACES } from "@/lib/categories";
import { normalizeProductName } from "@/lib/utils";

export function categoriesTag(listId: number) {
  return `categories:${listId}`;
}

export function placesTag(listId: number) {
  return `places:${listId}`;
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
 * Die Orte einer Liste, in der vom Nutzer festgelegten Reihenfolge.
 *
 * Gecacht wie die Kategorien und aus demselben Grund: sie aendern sich ein
 * paar Mal im Leben einer Liste, werden aber auf jedem Screen gebraucht.
 */
export async function getPlacesForList(listId: number) {
  "use cache";
  cacheTag(placesTag(listId));
  cacheLife("hours");

  return db
    .select()
    .from(places)
    .where(eq(places.listId, listId))
    .orderBy(asc(places.position), asc(places.id));
}

/**
 * Die nicht archivierten Listen eines Nutzers samt Artikel- und
 * Mitgliederzahl -- das, was im Listen-Blatt unter jedem Namen steht.
 *
 * Zwei Gruppierungen statt zweier Joins in einer Abfrage: ein gemeinsamer
 * Join ueber Artikel UND Mitglieder vervielfacht die Zeilen und zaehlt beides
 * falsch.
 */
export async function getListsWithCounts(userId: string) {
  const rows = await db
    .select({ id: lists.id, name: lists.name })
    .from(lists)
    .innerJoin(listMembers, eq(listMembers.listId, lists.id))
    .where(and(eq(listMembers.userId, userId), isNull(lists.archivedAt)))
    .orderBy(asc(lists.createdAt));

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [itemCounts, memberCounts] = await Promise.all([
    db
      .select({ listId: items.listId, total: count() })
      .from(items)
      .where(
        and(inArray(items.listId, ids), eq(items.status, "active"), isNull(items.hiddenAt)),
      )
      .groupBy(items.listId),
    db
      .select({ listId: listMembers.listId, total: count() })
      .from(listMembers)
      .where(inArray(listMembers.listId, ids))
      .groupBy(listMembers.listId),
  ]);

  const itemsByList = new Map(itemCounts.map((row) => [row.listId, row.total]));
  const membersByList = new Map(memberCounts.map((row) => [row.listId, row.total]));

  return rows.map((row) => ({
    ...row,
    itemCount: itemsByList.get(row.id) ?? 0,
    memberCount: membersByList.get(row.id) ?? 1,
  }));
}

/**
 * Die Orte einer Liste samt der Zahl der Artikel, die gerade darin liegen.
 *
 * Bewusst zwei Abfragen und eine Zusammenfuehrung in JavaScript statt einer
 * korrelierten Unterabfrage: die Zahl steht in der Loeschabfrage ("3 Artikel
 * liegen hier") und muss stimmen. Eine Gruppierung ueber items ist dafuer
 * nachvollziehbarer -- und liefert im Gegensatz zur Unterabfrage auch dann
 * das Richtige, wenn der Ort selbst die aeussere Tabelle ist.
 */
export async function getPlacesWithCounts(listId: number) {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(places)
      .where(eq(places.listId, listId))
      .orderBy(asc(places.position), asc(places.id)),
    db
      .select({ placeId: items.placeId, total: count() })
      .from(items)
      .where(
        and(eq(items.listId, listId), eq(items.status, "active"), isNull(items.hiddenAt)),
      )
      .groupBy(items.placeId),
  ]);

  const byPlace = new Map(counts.map((row) => [row.placeId, row.total]));
  return rows.map((place) => ({ ...place, itemCount: byPlace.get(place.id) ?? 0 }));
}

/**
 * Befuellt eine frisch angelegte Liste mit den Standardorten.
 *
 * Ohne das stuende im Erfassungsformular ein leerer Abschnitt "Wo liegt es?",
 * den der Nutzer erst in der Datenbank fuellen muesste, bevor er seinen
 * ersten Artikel sinnvoll einsortieren kann.
 */
export async function seedDefaultPlaces(listId: number) {
  const now = new Date();
  await db.insert(places).values(
    DEFAULT_PLACES.map((name, index) => ({
      name,
      position: index,
      createdAt: now,
      listId,
    })),
  );
}

/** True, wenn die Liste (noch) keinen einzigen Ort hat. */
export async function listHasPlaces(listId: number) {
  const existing = await db
    .select({ id: places.id })
    .from(places)
    .where(eq(places.listId, listId))
    .get();
  return Boolean(existing);
}

/**
 * Legt die Standardorte fuer jede Liste an, die noch keine hat.
 *
 * Laeuft beim Start (siehe instrumentation): Listen, die vor den Orten
 * existierten, haetten sonst dauerhaft einen leeren Ort-Abschnitt -- und
 * niemand kommt von selbst auf die Idee, in der Datenbank drei Faecher
 * anzulegen, bevor die App wieder vollstaendig ist.
 */
export async function backfillDefaultPlaces() {
  const allLists = await db.select({ id: lists.id }).from(lists);
  let seeded = 0;

  for (const list of allLists) {
    if (await listHasPlaces(list.id)) continue;
    await seedDefaultPlaces(list.id);
    seeded += 1;
  }

  return seeded;
}

/**
 * Was die Liste ueber dieses Produkt weiss -- ueber den Barcode oder, wenn
 * keiner vorliegt, ueber den Namen.
 *
 * Das ist die einzige Quelle fuer die Vorauswahl der Kategorie. Vorher wurde
 * aus den Open-Food-Facts-Kategorien geraten, was bei einem grossen Teil der
 * Produkte danebenlag -- und was bei selbst angelegten Kategorien gar nicht
 * funktionieren kann. Ein Produkt, das dieser Haushalt noch nie erfasst hat,
 * bekommt bewusst keine Vorauswahl: die eine Entscheidung beim ersten Mal
 * ist billiger als das Korrigieren einer falschen Vorgabe bei jedem weiteren.
 */
export async function lookupKnownProduct(
  listId: number,
  lookup: { barcode?: string; name?: string },
) {
  if (lookup.barcode) {
    const byBarcode = await db
      .select({ category: productKnowledge.category, name: productKnowledge.name })
      .from(productKnowledge)
      .where(and(eq(productKnowledge.listId, listId), eq(productKnowledge.barcode, lookup.barcode)))
      .get();
    if (byBarcode) return byBarcode;
  }

  if (lookup.name?.trim()) {
    // Auch Eintraege MIT Barcode zaehlen: wer denselben Artikel einmal
    // gescannt und einmal von Hand eingetippt hat, meint dasselbe Produkt.
    const byName = await db
      .select({ category: productKnowledge.category, name: productKnowledge.name })
      .from(productKnowledge)
      .where(
        and(
          eq(productKnowledge.listId, listId),
          eq(productKnowledge.nameKey, normalizeProductName(lookup.name)),
        ),
      )
      .orderBy(desc(productKnowledge.updatedAt))
      .get();
    if (byName) return byName;
  }

  return null;
}

/**
 * Haelt fest, wie dieser Haushalt ein Produkt einsortiert -- aufgerufen bei
 * jedem Speichern eines Artikels.
 *
 * Die zuletzt getroffene Entscheidung gewinnt: wer einen Artikel oeffnet und
 * die Kategorie korrigiert, korrigiert damit zugleich die Vorauswahl fuer das
 * naechste Mal. Genau dieser Weg ist der Normalfall -- die Wissensdatenbank
 * unter /knowledge ist fuer die Faelle da, in denen der Artikel selbst
 * laengst weg ist.
 */
export async function rememberProduct(
  listId: number,
  product: { barcode?: string | null; name: string; category: string },
) {
  const nameKey = normalizeProductName(product.name);
  if (!nameKey) return;

  const barcode = product.barcode?.trim() || null;
  const now = new Date();

  const existing = await db
    .select({ id: productKnowledge.id })
    .from(productKnowledge)
    .where(
      barcode
        ? and(eq(productKnowledge.listId, listId), eq(productKnowledge.barcode, barcode))
        : and(
            eq(productKnowledge.listId, listId),
            isNull(productKnowledge.barcode),
            eq(productKnowledge.nameKey, nameKey),
          ),
    )
    .get();

  if (existing) {
    await db
      .update(productKnowledge)
      .set({ name: product.name, nameKey, category: product.category, updatedAt: now })
      .where(eq(productKnowledge.id, existing.id));
    return;
  }

  await db.insert(productKnowledge).values({
    listId,
    barcode,
    nameKey,
    name: product.name,
    category: product.category,
    createdAt: now,
    updatedAt: now,
  });
}

/** Alle gelernten Produkte einer Liste, alphabetisch. */
export async function getKnowledgeForList(listId: number) {
  return db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.listId, listId))
    .orderBy(asc(productKnowledge.nameKey));
}

/**
 * Wird eine Kategorie geloescht, verlieren die darauf zeigenden Eintraege
 * ihren Sinn -- sonst stuenden in der Wissensdatenbank Produkte mit einer
 * Kategorie, die es nicht mehr gibt.
 */
export async function forgetProductsInCategory(listId: number, categoryKey: string) {
  await db
    .delete(productKnowledge)
    .where(and(eq(productKnowledge.listId, listId), eq(productKnowledge.category, categoryKey)));
}

/**
 * Uebernimmt das Wissen, das bisher implizit in der Artikelhistorie steckte,
 * einmalig in die eigene Tabelle.
 *
 * Vor dieser Tabelle beantwortete die Frage "kennen wir das Produkt schon?"
 * ein Blick auf den zuletzt erfassten Artikel mit demselben Barcode bzw.
 * Namen. Ohne diese Uebernahme wuerde jede bestehende Liste ihre gesamte
 * bisherige Einordnung verlieren und muesste bei null anfangen.
 *
 * Laeuft nur, solange die Tabelle komplett leer ist: sobald ein einziger
 * Eintrag existiert, ist die Uebernahme erledigt und darf sich nicht
 * wiederholen -- sonst kaemen von Hand geloeschte Eintraege beim naechsten
 * Start zurueck.
 */
export async function backfillProductKnowledge() {
  const anyRow = await db.select({ id: productKnowledge.id }).from(productKnowledge).get();
  if (anyRow) return 0;

  const allLists = await db.select({ id: lists.id }).from(lists);
  let written = 0;

  for (const list of allLists) {
    const known = await db
      .select({ key: categories.key })
      .from(categories)
      .where(eq(categories.listId, list.id));
    const validKeys = new Set(known.map((c) => c.key));
    if (validKeys.size === 0) continue;

    // Aufsteigend nach Zeitpunkt: spaetere Eintraege ueberschreiben fruehere,
    // am Ende steht pro Produkt die zuletzt getroffene Entscheidung.
    const history = await db
      .select({
        name: items.name,
        barcode: items.barcode,
        category: items.category,
        addedAt: items.addedAt,
      })
      .from(items)
      .where(eq(items.listId, list.id))
      .orderBy(asc(items.addedAt));

    const entries = new Map<
      string,
      { barcode: string | null; nameKey: string; name: string; category: string; at: Date }
    >();

    for (const item of history) {
      if (!validKeys.has(item.category)) continue;
      const nameKey = normalizeProductName(item.name);
      if (!nameKey) continue;
      const dedupeKey = item.barcode ? `b:${item.barcode}` : `n:${nameKey}`;
      entries.set(dedupeKey, {
        barcode: item.barcode,
        nameKey,
        name: item.name,
        category: item.category,
        at: item.addedAt,
      });
    }

    if (entries.size === 0) continue;

    await db.insert(productKnowledge).values(
      [...entries.values()].map((entry) => ({
        listId: list.id,
        barcode: entry.barcode,
        nameKey: entry.nameKey,
        name: entry.name,
        category: entry.category,
        createdAt: entry.at,
        updatedAt: entry.at,
      })),
    );
    written += entries.size;
  }

  return written;
}
