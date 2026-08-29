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
  const { backfillProductKnowledge } = await import("./instrumentation.node");
  await backfillProductKnowledge();
}
