import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../../../packages/stats-db/src/schema";
import path from "path";

const dbPath = path.resolve(process.cwd(), "../stats-db/sqlite.db");

// Log the path for debugging and ensure the file exists
console.log(`[db.ts] Connecting to SQLite database at: ${dbPath}`);

const sqlite = new Database(dbPath, {
  fileMustExist: true,
  // verbose: console.log,
});
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
