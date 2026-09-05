/**
 * Lieber beim Start laut als spaeter still.
 *
 * BETTER_AUTH_SECRET prueft better-auth selbst und wirft in Produktion --
 * alles andere fehlte bisher lautlos. Am teuersten war CRON_SECRET: die
 * Cron-Route verglich gegen `Bearer ${undefined}` und liess damit jeden
 * durch. Das ist inzwischen in der Route selbst abgefangen, aber ein Server,
 * der halb konfiguriert startet, soll das sagen, statt es zu verschweigen.
 *
 * Nur in Produktion: in der Entwicklung soll ein leeres .env den Server nicht
 * am Starten hindern.
 */
function assertEnvironment() {
  // Waehrend `next build` sammelt Next die Routen in eigenen Prozessen ein --
  // und der Docker-Build laeuft ohne .env. Wuerde hier geworfen, waere kein
  // Image mehr zu bauen. Geprueft wird beim Start des Servers, wo die Werte
  // tatsaechlich gebraucht werden.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;

  const missing = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    throw new Error(
      `Fehlende Umgebungsvariablen: ${missing.join(", ")} -- siehe .env.example`,
    );
  }

  // Push ist optional. Halb konfiguriert ist aber schlimmer als gar nicht:
  // der Zeitgeber laeuft dann an und scheitert bei jedem Versand.
  const vapid = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  const missingVapid = vapid.filter((key) => !process.env[key]);
  if (missingVapid.length > 0 && missingVapid.length < vapid.length) {
    throw new Error(
      `VAPID ist unvollstaendig -- es fehlt: ${missingVapid.join(", ")}. Entweder alle drei setzen oder keinen.`,
    );
  }

  if (!process.env.CRON_SECRET) {
    console.warn(
      "[start] CRON_SECRET nicht gesetzt -- POST /api/cron/check-expiry antwortet mit 503. Der eingebaute Zeitgeber laeuft davon unabhaengig weiter.",
    );
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      "[start] GEMINI_API_KEY nicht gesetzt -- Rezeptvorschlaege sind aus: die Fussleiste zeigt statt \"Rezepte\" wieder \"Mehr\", POST /api/recipes/generate antwortet mit 503.",
    );
  }
  if (!process.env.TRUSTED_PROXIES) {
    console.warn(
      "[start] TRUSTED_PROXIES nicht gesetzt -- hinter einem Reverse Proxy gilt das Anmelde-Limit dann global statt pro IP und die Geraeteliste zeigt keine Adresse.",
    );
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  assertEnvironment();

  if (process.env.RUN_MIGRATIONS === "true") {
    const { migrateDatabase } = await import("./instrumentation.node");
    migrateDatabase();
  }

  // Nach den Migrationen, weil die Tabelle erst dort entsteht -- und bewusst
  // ausserhalb des RUN_MIGRATIONS-Zweigs, damit auch eine lokal von Hand
  // migrierte Datenbank ihr bisheriges Wissen uebernimmt. Die Uebernahme
  // laeuft nur, solange die Tabelle leer ist; danach ist es ein einzelnes
  // SELECT pro Start.
  const { backfillProductKnowledge, backfillDefaultPlaces, startExpiryScheduler } =
    await import("./instrumentation.node");
  await backfillProductKnowledge();

  // Ebenfalls einmalig und aus demselben Grund: Listen aus der Zeit vor den
  // Orten haetten sonst dauerhaft ein leeres Fach-Angebot.
  await backfillDefaultPlaces();

  // Zum Schluss, damit der erste Lauf eine fertig migrierte Datenbank sieht.
  startExpiryScheduler();
}
