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

  // Migration 3: Add click tracking columns (click-earnings feature)
  const hasClickCount = postColumns.some((c) => c.name === "click_count");
  if (!hasClickCount) {
    db.run("ALTER TABLE posts ADD COLUMN click_count INTEGER DEFAULT 0");
    console.log("🔄 Migration: added click_count column to posts");
  }
  const hasLastClickedAt = postColumns.some((c) => c.name === "last_clicked_at");
  if (!hasLastClickedAt) {
    db.run("ALTER TABLE posts ADD COLUMN last_clicked_at TEXT");
    console.log("🔄 Migration: added last_clicked_at column to posts");
  }

  // Migration 4: Backfill existing drafts with redirect URLs
  // Runs once — replaces raw amazon.com/dp/ links with /r/:postId redirect URLs
  const backfillDone = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("backfill_redirect_urls_v1") as { value: string } | undefined;

  if (!backfillDone) {
    // Dynamic import for config (ESM-compatible)
    // We inline the BASE_URL config reading since this runs at module load time
    const baseUrl = process.env.BASE_URL || "http://localhost:3001";

    // Find drafts that contain raw Amazon affiliate links
    const drafts = db
      .query(
        `SELECT p.id, p.content, pr.affiliate_link
         FROM posts p
         JOIN products pr ON pr.id = p.product_id
         WHERE p.status = 'draft'
           AND p.content LIKE '%amazon.com/dp/%'`,
      )
      .all() as { id: string; content: string; affiliate_link: string }[];

    let backfilled = 0;
    for (const draft of drafts) {
      // Replace the raw affiliate link with the redirect URL
      const redirectUrl = `${baseUrl}/r/${draft.id}`;
      // Escape special regex chars in the affiliate link for safe replacement
      const escapedLink = draft.affiliate_link.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const newContent = draft.content.replace(
        new RegExp(escapedLink, "g"),
        redirectUrl,
      );

      if (newContent !== draft.content) {
        db.query("UPDATE posts SET content = ? WHERE id = ?").run(
          newContent,
          draft.id,
        );
        backfilled++;
      }
    }

    db.run(
      "INSERT INTO settings (key, value) VALUES ('backfill_redirect_urls_v1', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
      ["done", "done"],
    );
    if (backfilled > 0) {
      console.log(
        `🔄 Migration: backfilled ${backfilled} draft(s) with redirect URLs`,
      );
    }
  }
}

// Run directly: bun run src/db/init.ts
if (import.meta.main) {
  initDb();
}
