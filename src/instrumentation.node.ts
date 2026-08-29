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
