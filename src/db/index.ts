import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const dbPath = path.join(process.cwd(), "data", "food-tracker.db");

const sqlite = new Database(dbPath);
// Wait instead of failing when another connection holds the write lock.
// `next build` collects the routes in parallel processes, each of which opens
// this database at module load and asks for WAL - switching the journal mode
// needs an exclusive lock, so without a timeout the losers of that race abort
// the whole build with SQLITE_BUSY ("Failed to collect page data").
sqlite.pragma("busy_timeout = 10000");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
