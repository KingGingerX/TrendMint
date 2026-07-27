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
  const productColumns = db
    .query("PRAGMA table_info(products)")
    .all() as { name: string }[];
  const hasRejectionReason = productColumns.some((c) => c.name === "rejection_reason");
  if (!hasRejectionReason) {
    db.run("ALTER TABLE products ADD COLUMN rejection_reason TEXT");
    console.log("🔄 Migration: added rejection_reason column to products");
  }

  // Migration 2: Add product_title and generated_at columns to posts (content generation module)
  const postColumns = db
    .query("PRAGMA table_info(posts)")
    .all() as { name: string }[];
  const hasProductTitle = postColumns.some((c) => c.name === "product_title");
  if (!hasProductTitle) {
    db.run("ALTER TABLE posts ADD COLUMN product_title TEXT");
    console.log("🔄 Migration: added product_title column to posts");
  }
  const hasGeneratedAt = postColumns.some((c) => c.name === "generated_at");
  if (!hasGeneratedAt) {
    db.run("ALTER TABLE posts ADD COLUMN generated_at TEXT");
    console.log("🔄 Migration: added generated_at column to posts");
  }
}

// Run directly: bun run src/db/init.ts
if (import.meta.main) {
  initDb();
}
