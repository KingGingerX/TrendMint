/**
 * Earnings router — manual earnings entry, listing, and summary.
 *
 * Endpoints:
 *   GET  /api/earnings          — list all earnings entries
 *   POST /api/earnings          — add a manual earnings entry
 *   GET  /api/earnings/summary  — total earnings, by source, by month
 */

import { Hono } from "hono";
import { getDb } from "../../db/init";

export const earningsRouter = new Hono();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EarningsEntry {
  id: string;
  amount: number;
  currency: string;
  source: string;
  description: string | null;
  recorded_at: string;
  period_start: string | null;
  period_end: string | null;
}

export interface EarningsSummary {
  total: number;
  thisMonth: number;
  bySource: { source: string; total: number; count: number }[];
  byMonth: { month: string; total: number; count: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ---------------------------------------------------------------------------
// GET /api/earnings — list all entries
// ---------------------------------------------------------------------------

earningsRouter.get("/", (c) => {
  const db = getDb();
  const source = c.req.query("source");
  const limit = c.req.query("limit")
    ? Math.min(Number(c.req.query("limit")), 100)
    : 50;
  const offset = c.req.query("offset")
    ? Number(c.req.query("offset"))
    : 0;

  let query = "SELECT * FROM earnings WHERE 1=1";
  const params: unknown[] = [];

  if (source) {
    query += " AND source = ?";
    params.push(source);
  }

  // Count
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
  const totalRow = db.query(countQuery).all(...params) as { total: number }[];
  const total = totalRow[0]?.total ?? 0;

  // Fetch
  query += " ORDER BY recorded_at DESC LIMIT ? OFFSET ?";
  params.push(Math.min(limit, 100), offset);

  const entries = db.query(query).all(...params) as EarningsEntry[];

  return c.json({ entries, total, limit, offset });
});

// ---------------------------------------------------------------------------
// POST /api/earnings — add a manual earnings entry
// ---------------------------------------------------------------------------

interface AddEarningsBody {
  amount: number;
  currency?: string;
  source: string;
  description?: string;
  recorded_at?: string;
  period_start?: string;
  period_end?: string;
}

earningsRouter.post("/", async (c) => {
  const db = getDb();

  let body: AddEarningsBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!body.amount || typeof body.amount !== "number" || body.amount <= 0) {
    return c.json({ success: false, error: "amount must be a positive number" }, 400);
  }

  if (!body.source || typeof body.source !== "string" || body.source.trim() === "") {
    return c.json({ success: false, error: "source is required (e.g., 'amazon', 'clickbank', 'manual')" }, 400);
  }

  const id = generateId();
  const currency = body.currency || "USD";
  const description = body.description || null;
  const recordedAt = body.recorded_at || new Date().toISOString();
  const periodStart = body.period_start || null;
  const periodEnd = body.period_end || null;

  db.query(
    `INSERT INTO earnings (id, amount, currency, source, description, recorded_at, period_start, period_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, body.amount, currency, body.source.trim(), description, recordedAt, periodStart, periodEnd);

  const entry = db.query("SELECT * FROM earnings WHERE id = ?").get(id) as EarningsEntry;

  return c.json({ success: true, entry }, 201);
});

// ---------------------------------------------------------------------------
// GET /api/earnings/summary — aggregate earnings
// ---------------------------------------------------------------------------

earningsRouter.get("/summary", (c) => {
  const db = getDb();

  // Total earnings
  const totalRow = db
    .query("SELECT COALESCE(SUM(amount), 0) as total FROM earnings")
    .get() as { total: number };
  const total = totalRow.total;

  // This month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const thisMonthRow = db
    .query("SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE recorded_at >= ?")
    .get(monthStart) as { total: number };
  const thisMonth = thisMonthRow.total;

  // By source
  const bySource = db
    .query(
      "SELECT source, COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM earnings GROUP BY source ORDER BY total DESC",
    )
    .all() as { source: string; total: number; count: number }[];

  // By month
  const byMonth = db
    .query(
      `SELECT substr(recorded_at, 1, 7) as month, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM earnings
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`,
    )
    .all() as { month: string; total: number; count: number }[];

  return c.json({
    total,
    thisMonth,
    bySource,
    byMonth,
  } satisfies EarningsSummary);
});
