export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (process.env.RUN_MIGRATIONS === "true") {
    const { migrateDatabase } = await import("./instrumentation.node");
    migrateDatabase();
  }
}
