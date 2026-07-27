/**
 * Scheduler router — posting queue, manual post triggers, auto-post control.
 *
 * Endpoints:
 *   POST /api/scheduler/post-now     — Immediately post next draft
 *   POST /api/scheduler/post-next    — Alias for post-now
 *   GET  /api/scheduler/queue        — View pending drafts + rate limit status
 *   GET  /api/scheduler/stats        — Posting statistics
 *   POST /api/scheduler/auto-post/toggle   — Enable/disable auto-posting
 *   GET  /api/scheduler/auto-post/status   — Current auto-post state
 */

import { Hono } from "hono";
import {
  getQueue,
  getStats,
  postNextDraft,
  isAutoPostEnabled,
  setAutoPostEnabled,
} from "./scheduler";
import { verifyCredentials } from "./twitter-client";
import { isAutoPosterRunning } from "./auto-poster";

export const schedulerRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /api/scheduler/post-now — post the next draft immediately
// ---------------------------------------------------------------------------

schedulerRouter.post("/post-now", async (c) => {
  try {
    const result = await postNextDraft();
    const statusCode = result.success ? 200 : 429;
    return c.json(result, statusCode);
  } catch (err) {
    return c.json(
      {
        success: false,
        error: "Post failed unexpectedly",
        detail: String(err),
      },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/scheduler/post-next — alias for post-now
// ---------------------------------------------------------------------------

schedulerRouter.post("/post-next", async (c) => {
  try {
    const result = await postNextDraft();
    const statusCode = result.success ? 200 : 429;
    return c.json(result, statusCode);
  } catch (err) {
    return c.json(
      {
        success: false,
        error: "Post failed unexpectedly",
        detail: String(err),
      },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/scheduler/queue — view pending drafts
// ---------------------------------------------------------------------------

schedulerRouter.get("/queue", (c) => {
  try {
    const queue = getQueue();
    return c.json(queue);
  } catch (err) {
    return c.json(
      { error: "Failed to get queue", detail: String(err) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/scheduler/stats — posting statistics
// ---------------------------------------------------------------------------

schedulerRouter.get("/stats", (c) => {
  try {
    const stats = getStats();
    return c.json(stats);
  } catch (err) {
    return c.json(
      { error: "Failed to get stats", detail: String(err) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/scheduler/auto-post/toggle — enable/disable auto-posting
// ---------------------------------------------------------------------------

schedulerRouter.post("/auto-post/toggle", async (c) => {
  let body: { enabled?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (typeof body.enabled !== "boolean") {
    return c.json(
      {
        success: false,
        error: "Body must include 'enabled' as a boolean",
      },
      400,
    );
  }

  setAutoPostEnabled(body.enabled);

  return c.json({
    success: true,
    autoPostEnabled: body.enabled,
    message: body.enabled
      ? "Auto-posting enabled. Posts will fire automatically when conditions are met."
      : "Auto-posting disabled.",
  });
});

// ---------------------------------------------------------------------------
// GET /api/scheduler/auto-post/status — current auto-post state
// ---------------------------------------------------------------------------

schedulerRouter.get("/auto-post/status", (c) => {
  const enabled = isAutoPostEnabled();
  const running = isAutoPosterRunning();

  return c.json({
    enabled,
    running,
    message: enabled
      ? "Auto-posting is enabled"
      : "Auto-posting is disabled",
    note: !running
      ? "Auto-poster interval is not running (server may have started without AUTO_POST_ENABLED=true)"
      : undefined,
  });
});

// ---------------------------------------------------------------------------
// GET /api/scheduler/verify — check Twitter credentials
// ---------------------------------------------------------------------------

schedulerRouter.get("/verify", async (c) => {
  try {
    const result = await verifyCredentials();
    return c.json(result, result.ok ? 200 : 401);
  } catch (err) {
    return c.json(
      { ok: false, error: String(err) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/scheduler — module info
// ---------------------------------------------------------------------------

schedulerRouter.get("/", (c) => {
  return c.json({
    module: "scheduler",
    description: "Twitter/X posting module — queue management and auto-posting",
    endpoints: [
      "GET  /api/scheduler",
      "POST /api/scheduler/post-now",
      "POST /api/scheduler/post-next",
      "GET  /api/scheduler/queue",
      "GET  /api/scheduler/stats",
      "POST /api/scheduler/auto-post/toggle",
      "GET  /api/scheduler/auto-post/status",
      "GET  /api/scheduler/verify",
    ],
  });
});
