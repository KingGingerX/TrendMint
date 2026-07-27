/**
 * Discovery service — orchestrates scanning Reddit for product links
 * and storing discovered products in the database.
 */

import { Database } from "bun:sqlite";
import { getDb } from "../../db/init";
import { RedditClient, getRedditClient, DEFAULT_SUBREDDITS } from "./reddit-client";
import { extractFromPost, ScanDeduplicator } from "./extractor";

export interface ScanRequest {
  subreddits?: string[];
  limit?: number;
  sort?: "hot" | "top";
  time?: "hour" | "day" | "week" | "month" | "year" | "all";
}

export interface ScanResult {
  success: boolean;
  subredditsScanned: string[];
  postsScanned: number;
  productsFound: number;
  newProducts: number;
  alreadyKnown: number;
  errors: string[];
  durationMs: number;
  lastScanTime: string;
}

export class DiscoveryService {
  private client: RedditClient;
  private db: Database;

  constructor(client?: RedditClient, db?: Database) {
    this.client = client || getRedditClient();
    this.db = db || getDb();
  }

  /**
   * Store a discovered product in the database.
   * Uses INSERT OR IGNORE to avoid duplicate ASINs.
   * Returns true if it was a new insertion, false if already known.
   */
  private storeProduct(
    asin: string,
    source: string,
    title?: string,
    url?: string
  ): boolean {
    const existing = this.db
      .query("SELECT id FROM products WHERE asin = ?")
      .get(asin);

    if (existing) {
      return false; // already known
    }

    const id = `reddit-${asin}-${Date.now()}`;
    const now = new Date().toISOString();

    this.db
      .query(
        `INSERT OR IGNORE INTO products (id, asin, title, source, discovered_at, status, affiliate_link)
         VALUES (?, ?, ?, ?, ?, 'discovered', ?)`
      )
      .run(id, asin, title || null, source, now, url || null);

    // Check if it was actually inserted (not ignored)
    const inserted = this.db
      .query("SELECT id FROM products WHERE asin = ? AND discovered_at = ?")
      .get(asin, now);

    return !!inserted;
  }

  /** Get the last scan time from the database */
  private getLastScanTime(): string | null {
    const row = this.db
      .query("SELECT value FROM settings WHERE key = 'last_discovery_scan'")
      .get() as { value: string } | null;
    return row?.value || null;
  }

  /** Update the last scan time */
  private setLastScanTime(time: string): void {
    this.db
      .query(
        `INSERT INTO settings (key, value) VALUES ('last_discovery_scan', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(time);
  }

  /**
   * Run a scan across configured subreddits.
   */
  async scan(request: ScanRequest = {}): Promise<ScanResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    if (!this.client.isConfigured()) {
      return {
        success: false,
        subredditsScanned: [],
        postsScanned: 0,
        productsFound: 0,
        newProducts: 0,
        alreadyKnown: 0,
        errors: [
          "Reddit API credentials not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.",
        ],
        durationMs: 0,
        lastScanTime: this.getLastScanTime() || "never",
      };
    }

    const subreddits = request.subreddits || DEFAULT_SUBREDDITS;
    const limit = Math.min(request.limit || 25, 100);
    const sort = request.sort || "hot";
    const time = request.time || "week";

    // Fetch posts from all subreddits
    let postsBySubreddit: Map<string, import("./reddit-client").RedditPost[]>;
    try {
      postsBySubreddit = await this.client.fetchAllSubreddits(
        subreddits,
        sort,
        time,
        limit
      );
    } catch (err) {
      errors.push(`Failed to fetch from Reddit: ${err}`);
      return {
        success: false,
        subredditsScanned: [],
        postsScanned: 0,
        productsFound: 0,
        newProducts: 0,
        alreadyKnown: 0,
        errors,
        durationMs: Date.now() - startTime,
        lastScanTime: this.getLastScanTime() || "never",
      };
    }

    // Process each subreddit
    const deduper = new ScanDeduplicator();
    let totalPosts = 0;
    let totalProductsFound = 0;
    let newProducts = 0;
    let alreadyKnown = 0;

    for (const [subreddit, posts] of postsBySubreddit) {
      totalPosts += posts.length;

      for (const post of posts) {
        if (post.stickied) continue;

        const extraction = extractFromPost(post);
        const uniqueAsins = deduper.filterNew(extraction.asins);

        for (const asin of uniqueAsins) {
          totalProductsFound++;
          const isNew = this.storeProduct(
            asin,
            `reddit:r/${post.subreddit}`,
            post.title,
            post.url
          );
          if (isNew) {
            newProducts++;
          } else {
            alreadyKnown++;
          }
        }
      }
    }

    const now = new Date().toISOString();
    this.setLastScanTime(now);

    return {
      success: true,
      subredditsScanned: subreddits,
      postsScanned: totalPosts,
      productsFound: totalProductsFound,
      newProducts,
      alreadyKnown,
      errors,
      durationMs: Date.now() - startTime,
      lastScanTime: now,
    };
  }

  /**
   * Get current discovery status.
   */
  getStatus() {
    const lastScan = this.getLastScanTime();

    const counts = this.db
      .query(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN source LIKE 'reddit:%' THEN 1 ELSE 0 END) as fromReddit,
           SUM(CASE WHEN status = 'discovered' THEN 1 ELSE 0 END) as discovered
         FROM products`
      )
      .get() as { total: number; fromReddit: number; discovered: number } | null;

    return {
      lastScanTime: lastScan || "never",
      totalProducts: counts?.total || 0,
      fromReddit: counts?.fromReddit || 0,
      discovered: counts?.discovered || 0,
      configuredSubreddits: DEFAULT_SUBREDDITS,
      redditCredentialsSet: this.client.isConfigured(),
    };
  }
}

let _service: DiscoveryService | null = null;
export function getDiscoveryService(): DiscoveryService {
  if (!_service) {
    _service = new DiscoveryService();
  }
  return _service;
}
