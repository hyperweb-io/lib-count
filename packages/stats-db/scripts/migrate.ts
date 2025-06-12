import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

const dbPath = path.resolve(__dirname, "../sqlite.db");
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

const migrationsFolder = path.resolve(__dirname, "../drizzle");

try {
  console.log("Running migrations...");
  migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully!");
} catch (error) {
  console.error("Error applying migrations:", error);
  process.exit(1);
} finally {
  sqlite.close();
}
