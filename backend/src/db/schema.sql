-- TrendMint Database Schema (SQLite)
-- Run with: bun run db:init

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  asin TEXT,
  title TEXT,
  price REAL,
  sales_rank INTEGER,
  category TEXT,
  image_url TEXT,
  affiliate_link TEXT,
  source TEXT,          -- 'reddit', 'clickbank', etc.
  discovered_at TEXT,
  status TEXT DEFAULT 'discovered', -- discovered, approved, posted, rejected
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id),
  platform TEXT DEFAULT 'twitter',
  content TEXT,
  tweet_id TEXT,
  posted_at TEXT,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
