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

/**
 * Der eingebaute Zeitgeber fuer die Ablauf-Erinnerungen.
 *
 * Bisher passierte ohne einen von aussen eingerichteten Cron gar nichts: die
 * App verschickte nur, wenn jemand POST /api/cron/check-expiry anstiess. Fuer
 * eine selbst gehostete App im eigenen Haushalt ist das eine Huerde, an der
 * die Erinnerungen -- das eigentliche Versprechen der App -- schlicht
 * ausblieben.
 *
 * Der Lauf haelt sich an die pro Nutzer eingestellte Uhrzeit, deshalb zur
 * vollen Stunde. Einmal sofort beim Start, damit ein Neustart um 09:01 die
 * 09:00-Runde nicht fuer den ganzen Tag verschluckt -- doppelt verschickt
 * wird dabei nichts, dafuer sorgt lastNotifiedAt am Artikel.
 *
 * Wer den Job lieber selbst plant, setzt INTERNAL_CRON=false und ruft die
 * Route weiter von aussen auf.
 */
const HOUR_MS = 60 * 60 * 1000;

export function startExpiryScheduler() {
  // Waehrend `next build` sammelt Next die Routen in eigenen Prozessen ein --
  // dort soll nichts verschickt werden.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (process.env.INTERNAL_CRON === "false") {
    console.log("[erinnerungen] Zeitgeber deaktiviert (INTERNAL_CRON=false)");
    return;
  }

  // Ohne VAPID-Schluessel kann ueberhaupt nichts verschickt werden. Lieber
  // einmal beim Start darauf hinweisen als stuendlich denselben Fehler
  // protokollieren.
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log("[erinnerungen] Zeitgeber inaktiv: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY fehlen");
    return;
  }

  // In der Entwicklung laeuft register() bei jedem Neustart des Servers
  // erneut; ohne Merker lauefen danach zwei Zeitgeber nebeneinander.
  const flag = Symbol.for("betterfood.expiry-scheduler");
  const globals = globalThis as unknown as Record<symbol, boolean>;
  if (globals[flag]) return;
  globals[flag] = true;

  async function tick() {
    try {
      const { runExpiryCheck } = await import("@/lib/expiry-check");
      const result = await runExpiryCheck({ respectPreferredHour: true });
      if (result.sent > 0) {
        console.log(
          `[erinnerungen] ${result.sent} Meldung(en) fuer ${result.itemsNotified} Artikel verschickt`,
        );
      }
    } catch (error) {
      // Ein fehlgeschlagener Lauf darf den naechsten nicht verhindern --
      // fehlende VAPID-Schluessel etwa wuerden sonst den Zeitgeber killen.
      console.error("[erinnerungen] Lauf fehlgeschlagen:", error);
    }
  }

  // Eine Zeile beim Start, weil "die Erinnerungen kommen nicht" sonst nur
  // durch Ausprobieren zu beantworten waere.
  console.log("[erinnerungen] Zeitgeber aktiv – Prüfung zur vollen Stunde");

  const msToNextHour = HOUR_MS - (Date.now() % HOUR_MS);
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), HOUR_MS).unref();
  }, msToNextHour).unref();

  void tick();
}
