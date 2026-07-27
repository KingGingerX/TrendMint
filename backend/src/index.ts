import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { getDb } from "./db/init";
import { discoveryRouter } from "./modules/discovery/router";
import { productsRouter } from "./modules/products/router";
import { contentRouter } from "./modules/content/router";
import { schedulerRouter } from "./modules/scheduler/router";
import { earningsRouter } from "./modules/earnings/router";
import { startAutoPoster } from "./modules/scheduler/auto-poster";

const app = new Hono();

// Middleware
app.use("*", cors());

// Health check
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Click tracking redirect ──────────────────────────────────
// GET /r/:postId — logs a click then 302 redirects to affiliate link
app.get("/r/:postId", (c) => {
  const postId = c.req.param("postId");
  const db = getDb();

  // Look up the post
  const post = db
    .query("SELECT id, product_id FROM posts WHERE id = ?")
    .get(postId) as { id: string; product_id: string } | undefined;

  if (!post) {
    return c.text("Not found", 404);
  }

  // Look up the product's affiliate link
  const product = db
    .query("SELECT affiliate_link FROM products WHERE id = ?")
    .get(post.product_id) as { affiliate_link: string | null } | undefined;

  if (!product?.affiliate_link) {
    return c.text("No affiliate link", 404);
  }

  // Log the click
  const now = new Date().toISOString();
  db.query(
    "UPDATE posts SET click_count = COALESCE(click_count, 0) + 1, last_clicked_at = ? WHERE id = ?",
  ).run(now, postId);

  // 302 redirect
  return c.redirect(product.affiliate_link, 302);
});

// ── Stats endpoints ──────────────────────────────────────────

// GET /api/stats/clicks — click statistics
app.get("/api/stats/clicks", (c) => {
  const db = getDb();

  // Total clicks
  const totalRow = db
    .query("SELECT COALESCE(SUM(click_count), 0) as total FROM posts")
    .get() as { total: number };
  const clicksTotal = totalRow.total;

  // Clicks today
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = db
    .query(
      "SELECT COALESCE(SUM(click_count), 0) as total FROM posts WHERE last_clicked_at >= ?",
    )
    .get(today) as { total: number };
  const clicksToday = todayRow.total;

  // Per-post clicks
  const perPost = db
    .query(
      `SELECT id as post_id, product_title, COALESCE(click_count, 0) as click_count, last_clicked_at
       FROM posts
       WHERE COALESCE(click_count, 0) > 0
       ORDER BY click_count DESC
       LIMIT 50`,
    )
    .all() as { post_id: string; product_title: string; click_count: number; last_clicked_at: string | null }[];

  return c.json({
    clicks_total: clicksTotal,
    clicks_today: clicksToday,
    clicks_per_post: perPost,
  });
});

// GET /api/stats — combined overview
app.get("/api/stats", (c) => {
  const db = getDb();

  // Product counts
  const productCounts = db
    .query("SELECT status, COUNT(*) as count FROM products GROUP BY status")
    .all() as { status: string; count: number }[];
  const counts: Record<string, number> = {};
  for (const row of productCounts) {
    counts[row.status] = row.count;
  }

  // Post counts
  const draftsReady = (
    db.query("SELECT COUNT(*) as count FROM posts WHERE status = 'draft'").get() as { count: number }
  ).count;
  const postsTotal = (
    db.query("SELECT COUNT(*) as count FROM posts WHERE status = 'posted'").get() as { count: number }
  ).count;

  const today = new Date().toISOString().slice(0, 10);
  const postsToday = (
    db.query("SELECT COUNT(*) as count FROM posts WHERE status = 'posted' AND posted_at >= ?").get(today) as { count: number }
  ).count;

  // Click stats
  const clicksTotal = (
    db.query("SELECT COALESCE(SUM(click_count), 0) as total FROM posts").get() as { total: number }
  ).total;
  const clicksToday = (
    db.query("SELECT COALESCE(SUM(click_count), 0) as total FROM posts WHERE last_clicked_at >= ?").get(today) as { total: number }
  ).total;

  // Earnings
  const earningsTotal = (
    db.query("SELECT COALESCE(SUM(amount), 0) as total FROM earnings").get() as { total: number }
  ).total;
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const earningsThisMonth = (
    db.query("SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE recorded_at >= ?").get(monthStart) as { total: number }
  ).total;

  return c.json({
    products_discovered: counts["discovered"] ?? 0,
    products_approved: counts["approved"] ?? 0,
    drafts_ready: draftsReady,
    posts_today: postsToday,
    posts_total: postsTotal,
    clicks_today: clicksToday,
    clicks_total: clicksTotal,
    earnings_total: Math.round(earningsTotal * 100) / 100,
    earnings_this_month: Math.round(earningsThisMonth * 100) / 100,
  });
});

// Module routes
app.route("/api/discovery", discoveryRouter);
app.route("/api/products", productsRouter);
app.route("/api/content", contentRouter);
app.route("/api/scheduler", schedulerRouter);
app.route("/api/earnings", earningsRouter);

// Start server — explicitly use 3001, ignoring any system PORT
const port = 3001;

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`🚀 TrendMint backend running on http://localhost:${server.port}`);

// Start auto-poster if enabled
startAutoPoster();
