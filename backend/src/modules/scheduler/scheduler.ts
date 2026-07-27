/**
 * Post scheduler — manages the queue of draft posts and handles
 * posting to Twitter with rate limiting enforcement.
 */

import { getDb } from "../../db/init";
import { postTweet, verifyCredentials } from "./twitter-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostRecord {
  id: string;
  product_id: string;
  product_title: string | null;
  platform: string;
  content: string;
  tweet_id: string | null;
  posted_at: string | null;
  generated_at: string | null;
  status: string;
}

export interface QueueItem {
  post: PostRecord;
  position: number;
}

export interface QueueResponse {
  queue: QueueItem[];
  totalDrafts: number;
  lastPostTime: string | null;
  nextEligibleTime: string | null;
  rateLimitStatus: RateLimitStatus;
}

export interface RateLimitStatus {
  postsToday: number;
  postsThisMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  minimumIntervalMinutes: number;
  secondsUntilNextPost: number;
}

export interface PostResult {
  success: boolean;
  tweetId?: string;
  text?: string;
  postId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAILY_LIMIT = 50;
const MONTHLY_LIMIT = 1500;
const MIN_POST_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function getSetting(key: string): string | null {
  const db = getDb();
  const row = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const db = getDb();
  db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
    [key, value, value],
  );
}

// ---------------------------------------------------------------------------
// Rate limit tracking
// ---------------------------------------------------------------------------

function getPostsToday(): number {
  const db = getDb();
  const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const storedDate = getSetting("posts_today_date");
  const storedCount = getSetting("posts_today");

  if (storedDate !== todayDate) {
    // New day — reset counter
    setSetting("posts_today_date", todayDate);
    setSetting("posts_today", "0");
    return 0;
  }

  return storedCount ? parseInt(storedCount, 10) : 0;
}

function incrementPostsToday(): void {
  const count = getPostsToday() + 1;
  setSetting("posts_today", String(count));
}

function getPostsThisMonth(): number {
  const db = getDb();
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const storedMonth = getSetting("posts_month");
  const storedCount = getSetting("posts_month_count");

  if (storedMonth !== thisMonth) {
    setSetting("posts_month", thisMonth);
    setSetting("posts_month_count", "0");
    return 0;
  }

  return storedCount ? parseInt(storedCount, 10) : 0;
}

function incrementPostsThisMonth(): void {
  const count = getPostsThisMonth() + 1;
  setSetting("posts_month_count", String(count));
}

function getLastPostTime(): number | null {
  const val = getSetting("last_post_time");
  return val ? parseInt(val, 10) : null;
}

function setLastPostTime(): void {
  setSetting("last_post_time", String(Date.now()));
}

function getSecondsUntilNextPost(): number {
  const lastTime = getLastPostTime();
  if (!lastTime) return 0; // never posted — eligible now

  const elapsed = Date.now() - lastTime;
  const remaining = MIN_POST_INTERVAL_MS - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateTweetContent(content: string): { valid: true } | { valid: false; error: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: "Tweet content is empty" };
  }

  if (content.length > 280) {
    return {
      valid: false,
      error: `Tweet too long: ${content.length} characters (max 280)`,
    };
  }

  // Check for a URL/link
  const hasLink = /https?:\/\/\S+/i.test(content);
  if (!hasLink) {
    return { valid: false, error: "Tweet must contain at least one link (affiliate URL)" };
  }

  // Check for #ad disclosure
  const hasAd = /#ad/i.test(content);
  if (!hasAd) {
    return { valid: false, error: "Tweet must contain #ad disclosure" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------

/**
 * Get the current posting queue — all drafts ordered oldest-first.
 */
export function getQueue(): QueueResponse {
  const db = getDb();
  const drafts = db
    .query(
      `SELECT * FROM posts
       WHERE status = 'draft'
       ORDER BY generated_at ASC, id ASC`,
    )
    .all() as PostRecord[];

  const queue: QueueItem[] = drafts.map((post, idx) => ({
    post,
    position: idx + 1,
  }));

  const lastPostTime = getLastPostTime();
  const secondsUntilNext = getSecondsUntilNextPost();

  const postsToday = getPostsToday();
  const postsThisMonth = getPostsThisMonth();

  return {
    queue,
    totalDrafts: drafts.length,
    lastPostTime: lastPostTime ? new Date(lastPostTime).toISOString() : null,
    nextEligibleTime:
      secondsUntilNext > 0
        ? new Date(Date.now() + secondsUntilNext * 1000).toISOString()
        : null,
    rateLimitStatus: {
      postsToday,
      postsThisMonth,
      dailyLimit: DAILY_LIMIT,
      monthlyLimit: MONTHLY_LIMIT,
      dailyRemaining: Math.max(0, DAILY_LIMIT - postsToday),
      monthlyRemaining: Math.max(0, MONTHLY_LIMIT - postsThisMonth),
      minimumIntervalMinutes: MIN_POST_INTERVAL_MS / 60_000,
      secondsUntilNextPost: secondsUntilNext,
    },
  };
}

/**
 * Get posting statistics.
 */
export function getStats(): {
  postsToday: number;
  postsThisMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  minimumIntervalMinutes: number;
  secondsUntilNextPost: number;
  totalPosted: number;
  totalDrafts: number;
  autoPostEnabled: boolean;
} {
  const db = getDb();
  const postsToday = getPostsToday();
  const postsThisMonth = getPostsThisMonth();

  const totalPosted = (
    db
      .query("SELECT COUNT(*) as count FROM posts WHERE status = 'posted'")
      .get() as { count: number }
  ).count;

  const totalDrafts = (
    db
      .query("SELECT COUNT(*) as count FROM posts WHERE status = 'draft'")
      .get() as { count: number }
  ).count;

  const autoPostEnabled = getSetting("auto_post_enabled") === "true";

  return {
    postsToday,
    postsThisMonth,
    dailyLimit: DAILY_LIMIT,
    monthlyLimit: MONTHLY_LIMIT,
    dailyRemaining: Math.max(0, DAILY_LIMIT - postsToday),
    monthlyRemaining: Math.max(0, MONTHLY_LIMIT - postsThisMonth),
    minimumIntervalMinutes: MIN_POST_INTERVAL_MS / 60_000,
    secondsUntilNextPost: getSecondsUntilNextPost(),
    totalPosted,
    totalDrafts,
    autoPostEnabled,
  };
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

/**
 * Post the next draft in the queue (oldest first).
 * Returns the result with tweet ID on success.
 */
export async function postNextDraft(): Promise<PostResult> {
  // 1. Check Twitter credentials
  const credCheck = await verifyCredentials();
  if (!credCheck.ok) {
    return {
      success: false,
      error: `Twitter credentials not configured: ${credCheck.error}`,
    };
  }

  // 2. Check rate limits
  const postsToday = getPostsToday();
  if (postsToday >= DAILY_LIMIT) {
    return {
      success: false,
      error: `Daily post limit reached: ${postsToday}/${DAILY_LIMIT}. Try again tomorrow.`,
    };
  }

  const postsThisMonth = getPostsThisMonth();
  if (postsThisMonth >= MONTHLY_LIMIT) {
    return {
      success: false,
      error: `Monthly post limit reached: ${postsThisMonth}/${MONTHLY_LIMIT}.`,
    };
  }

  // 3. Check minimum interval
  const secondsUntilNext = getSecondsUntilNextPost();
  if (secondsUntilNext > 0) {
    const minutes = Math.ceil(secondsUntilNext / 60);
    return {
      success: false,
      error: `Minimum interval not met. Next post eligible in ${minutes} minute(s).`,
    };
  }

  // 4. Get next draft
  const db = getDb();
  const draft = db
    .query(
      `SELECT * FROM posts
       WHERE status = 'draft'
       ORDER BY generated_at ASC, id ASC
       LIMIT 1`,
    )
    .get() as PostRecord | undefined;

  if (!draft) {
    return {
      success: false,
      error: "No drafts in queue. Generate content first.",
    };
  }

  // 5. Validate content
  const validation = validateTweetContent(draft.content);
  if (!validation.valid) {
    // Mark as failed — invalid content
    db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [draft.id]);
    return {
      success: false,
      error: `Content validation failed for post ${draft.id}: ${validation.error}`,
      postId: draft.id,
    };
  }

  // 6. Post to Twitter
  let tweetResult: { tweetId: string; text: string };
  try {
    tweetResult = await postTweet(draft.content);
  } catch (err) {
    const errMsg = String(err);
    // Don't mark as failed on rate limit — leave as draft for retry
    if (errMsg.includes("rate limit")) {
      return {
        success: false,
        error: errMsg,
        postId: draft.id,
      };
    }
    // Mark as failed on other errors
    db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [draft.id]);
    return {
      success: false,
      error: `Twitter post failed: ${errMsg}`,
      postId: draft.id,
    };
  }

  // 7. Update post record
  const now = new Date().toISOString();
  db.run(
    `UPDATE posts
     SET status = 'posted', tweet_id = ?, posted_at = ?
     WHERE id = ?`,
    [tweetResult.tweetId, now, draft.id],
  );

  // 8. Update rate limit counters
  setLastPostTime();
  incrementPostsToday();
  incrementPostsThisMonth();

  console.log(
    `📤 Posted tweet ${tweetResult.tweetId} for post ${draft.id}: "${draft.content.slice(0, 60)}..."`,
  );

  return {
    success: true,
    tweetId: tweetResult.tweetId,
    text: tweetResult.text,
    postId: draft.id,
  };
}

// ---------------------------------------------------------------------------
// Auto-post toggle
// ---------------------------------------------------------------------------

export function isAutoPostEnabled(): boolean {
  return getSetting("auto_post_enabled") === "true";
}

export function setAutoPostEnabled(enabled: boolean): void {
  setSetting("auto_post_enabled", String(enabled));
}

// ---------------------------------------------------------------------------
// Checks (used by auto-poster)
// ---------------------------------------------------------------------------

/**
 * Check if conditions are right for posting: has drafts, rate limits ok, interval passed.
 */
export function canPostNow(): { canPost: boolean; reason?: string } {
  const postsToday = getPostsToday();
  if (postsToday >= DAILY_LIMIT) {
    return { canPost: false, reason: `Daily limit reached (${postsToday}/${DAILY_LIMIT})` };
  }

  const postsThisMonth = getPostsThisMonth();
  if (postsThisMonth >= MONTHLY_LIMIT) {
    return { canPost: false, reason: `Monthly limit reached (${postsThisMonth}/${MONTHLY_LIMIT})` };
  }

  const secondsUntilNext = getSecondsUntilNextPost();
  if (secondsUntilNext > 0) {
    return {
      canPost: false,
      reason: `Interval not met (${Math.ceil(secondsUntilNext / 60)}m remaining)`,
    };
  }

  const db = getDb();
  const draftCount = (
    db
      .query("SELECT COUNT(*) as count FROM posts WHERE status = 'draft'")
      .get() as { count: number }
  ).count;

  if (draftCount === 0) {
    return { canPost: false, reason: "No drafts in queue" };
  }

  return { canPost: true };
}
