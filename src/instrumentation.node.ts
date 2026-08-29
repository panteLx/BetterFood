import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "@/db";

export function migrateDatabase() {
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
}

/**
 * Uebernimmt einmalig das Wissen, das bisher implizit in der Artikelhistorie
 * steckte, in die Tabelle product_knowledge.
 *
 * Fehler duerfen den Start nicht verhindern: eine Datenbank, deren Migration
 * noch aussteht, hat die Tabelle schlicht noch nicht -- beim naechsten Start
 * mit angewandter Migration klappt es dann.
 */
export async function backfillProductKnowledge() {
  try {
    const { backfillProductKnowledge: run } = await import("@/lib/data");
    const written = await run();
    if (written > 0) {
      console.log(`[knowledge] ${written} Produkte aus der Artikelhistorie übernommen`);
    }
  } catch (error) {
    console.warn("[knowledge] Übernahme aus der Artikelhistorie übersprungen:", error);
  }
}

/**
 * Legt die Standardorte fuer bestehende Listen an, die noch keine haben.
 *
 * Fehler duerfen den Start nicht verhindern -- gleiche Ueberlegung wie bei
 * backfillProductKnowledge: eine noch nicht migrierte Datenbank hat die
 * Tabelle schlicht noch nicht.
 */
export async function backfillDefaultPlaces() {
  try {
    const { backfillDefaultPlaces: run } = await import("@/lib/data");
    const seeded = await run();
    if (seeded > 0) {
      console.log(`[places] Standardorte fuer ${seeded} Liste(n) angelegt`);
    }
  } catch (error) {
    console.warn("[places] Anlegen der Standardorte uebersprungen:", error);
  }
}
