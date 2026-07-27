import { Database } from "bun:sqlite";
import { join } from "path";
import { readFileSync } from "fs";

const DB_PATH = join(import.meta.dir, "..", "..", "trendmint.db");

export function initDb(): Database {
  const db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  const schema = readFileSync(join(import.meta.dir, "schema.sql"), "utf-8");
  db.exec(schema);

  console.log(`📦 Database initialized at ${DB_PATH}`);
  return db;
}

export function getDb(): Database {
  return new Database(DB_PATH);
}

// Run directly: bun run src/db/init.ts
if (import.meta.main) {
  initDb();
}
