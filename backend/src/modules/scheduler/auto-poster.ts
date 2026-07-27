/**
 * Auto-poster — background interval checker that posts drafts
 * automatically when conditions are met.
 *
 * Runs every 5 minutes. Posts the next draft if:
 * - Auto-post is enabled
 * - Twitter credentials are valid
 * - Rate limits allow (daily/monthly caps)
 * - Minimum interval between posts has passed
 * - Drafts exist in the queue
 */

import {
  canPostNow,
  postNextDraft,
  isAutoPostEnabled,
  setAutoPostEnabled,
} from "./scheduler";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

async function checkAndPost(): Promise<void> {
  // Respect the toggle
  if (!isAutoPostEnabled()) {
    console.log("🤖 Auto-post: disabled, skipping check");
    return;
  }

  const status = canPostNow();
  if (!status.canPost) {
    console.log(`🤖 Auto-post: skipped — ${status.reason}`);
    return;
  }

  console.log("🤖 Auto-post: conditions met, posting next draft...");
  const result = await postNextDraft();

  if (result.success) {
    console.log(
      `🤖 Auto-post: ✅ Posted tweet ${result.tweetId} (post ${result.postId})`,
    );
  } else {
    console.log(`🤖 Auto-post: ❌ Failed — ${result.error}`);
  }
}

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------

/**
 * Start the auto-poster interval. Safe to call multiple times — does nothing
 * if already running.
 */
export function startAutoPoster(): void {
  if (isRunning) {
    console.log("🤖 Auto-post: already running");
    return;
  }

  // Check environment override
  if (process.env.AUTO_POST_ENABLED === "true") {
    setAutoPostEnabled(true);
    console.log("🤖 Auto-post: enabled via AUTO_POST_ENABLED env var");
  }

  if (process.env.AUTO_POST_ENABLED === "false") {
    setAutoPostEnabled(false);
    console.log("🤖 Auto-post: disabled via AUTO_POST_ENABLED env var");
  }

  isRunning = true;

  console.log(
    `🤖 Auto-post: starting — checks every ${CHECK_INTERVAL_MS / 60_000} minutes`,
  );

  // Run once immediately on start
  checkAndPost().catch((err) => {
    console.error("🤖 Auto-post: initial check error:", err);
  });

  // Then on interval
  intervalId = setInterval(() => {
    checkAndPost().catch((err) => {
      console.error("🤖 Auto-post: interval error:", err);
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the auto-poster interval.
 */
export function stopAutoPoster(): void {
  if (!isRunning || intervalId === null) {
    return;
  }

  clearInterval(intervalId);
  intervalId = null;
  isRunning = false;
  console.log("🤖 Auto-post: stopped");
}

/**
 * Check if the auto-poster is currently running.
 */
export function isAutoPosterRunning(): boolean {
  return isRunning;
}
