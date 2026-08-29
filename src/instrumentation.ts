export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

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
