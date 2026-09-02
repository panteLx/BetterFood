import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "@/db";

export function migrateDatabase() {
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
}

/**
 * Übernimmt einmalig das Wissen, das bisher implizit in der Artikelhistorie
 * steckte, in die Tabelle product_knowledge.
 *
 * Fehler dürfen den Start nicht verhindern: eine Datenbank, deren Migration
 * noch aussteht, hat die Tabelle schlicht noch nicht -- beim nächsten Start
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
 * Legt die Standardorte für bestehende Listen an, die noch keine haben.
 *
 * Fehler dürfen den Start nicht verhindern -- gleiche Überlegung wie bei
 * backfillProductKnowledge: eine noch nicht migrierte Datenbank hat die
 * Tabelle schlicht noch nicht.
 */
export async function backfillDefaultPlaces() {
  try {
    const { backfillDefaultPlaces: run } = await import("@/lib/data");
    const seeded = await run();
    if (seeded > 0) {
      console.log(`[places] Standardorte für ${seeded} Liste(n) angelegt`);
    }
  } catch (error) {
    console.warn("[places] Anlegen der Standardorte übersprungen:", error);
  }
}

/**
 * Der eingebaute Zeitgeber für die Ablauf-Erinnerungen.
 *
 * Bisher passierte ohne einen von außen eingerichteten Cron gar nichts: die
 * App verschickte nur, wenn jemand POST /api/cron/check-expiry anstieß. Für
 * eine selbst gehostete App im eigenen Haushalt ist das eine Hürde, an der
 * die Erinnerungen -- das eigentliche Versprechen der App -- schlicht
 * ausblieben.
 *
 * Der Lauf hält sich an die pro Nutzer eingestellte Uhrzeit, deshalb zur
 * vollen Stunde. Einmal sofort beim Start, damit ein Neustart um 09:01 die
 * 09:00-Runde nicht für den ganzen Tag verschluckt -- doppelt verschickt
 * wird dabei nichts, dafür sorgen die Merker in item_notifications und der
 * Tagesmerker notification_last_run.
 *
 * Wer den Job lieber selbst plant, setzt INTERNAL_CRON=false und ruft die
 * Route weiter von außen auf.
 */
const HOUR_MS = 60 * 60 * 1000;

export function startExpiryScheduler() {
  // Während `next build` sammelt Next die Routen in eigenen Prozessen ein --
  // dort soll nichts verschickt werden.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (process.env.INTERNAL_CRON === "false") {
    console.log("[erinnerungen] Zeitgeber deaktiviert (INTERNAL_CRON=false)");
    return;
  }

  // Ohne VAPID-Schlüssel kann überhaupt nichts verschickt werden. Lieber
  // einmal beim Start darauf hinweisen als stündlich denselben Fehler
  // protokollieren.
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log("[erinnerungen] Zeitgeber inaktiv: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY fehlen");
    return;
  }

  // In der Entwicklung läuft register() bei jedem Neustart des Servers
  // erneut; ohne Merker laufen danach zwei Zeitgeber nebeneinander.
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
          `[erinnerungen] ${result.sent} Meldung(en) für ${result.itemsNotified} Artikel verschickt`,
        );
      }
    } catch (error) {
      // Ein fehlgeschlagener Lauf darf den nächsten nicht verhindern --
      // fehlende VAPID-Schlüssel etwa würden sonst den Zeitgeber killen.
      console.error("[erinnerungen] Lauf fehlgeschlagen:", error);
    }
  }

  // Eine Zeile beim Start, weil "die Erinnerungen kommen nicht" sonst nur
  // durch Ausprobieren zu beantworten wäre.
  console.log("[erinnerungen] Zeitgeber aktiv – Prüfung zur vollen Stunde");

  const msToNextHour = HOUR_MS - (Date.now() % HOUR_MS);
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), HOUR_MS).unref();
  }, msToNextHour).unref();

  void tick();
}
