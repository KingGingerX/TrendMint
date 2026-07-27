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

  // Run migrations for schema changes not covered by CREATE IF NOT EXISTS
  runMigrations(db);

  console.log(`📦 Database initialized at ${DB_PATH}`);
  return db;
}

export function getDb(): Database {
  const db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  // Apply any pending migrations on every connection
  runMigrations(db);

  return db;
}

/**
 * Apply schema migrations that can't be expressed in CREATE IF NOT EXISTS.
 * Each migration checks whether it's already been applied before running.
 */
function runMigrations(db: Database): void {
  // Migration 1: Add rejection_reason column (added with Amazon PAAPI module)
  const columns = db
    .query("PRAGMA table_info(products)")
    .all() as { name: string }[];
  const hasRejectionReason = columns.some((c) => c.name === "rejection_reason");
  if (!hasRejectionReason) {
    db.run("ALTER TABLE products ADD COLUMN rejection_reason TEXT");
    console.log("🔄 Migration: added rejection_reason column to products");
  }
}

// Run directly: bun run src/db/init.ts
if (import.meta.main) {
  initDb();
}
