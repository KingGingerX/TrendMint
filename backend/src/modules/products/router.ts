/**
 * Products router — Amazon PAAPI lookups, filtering, listing.
 *
 * Endpoints:
 *   POST /api/products/lookup  — enrich products from Amazon PAAPI
 *   GET  /api/products          — list products with optional filters
 *   GET  /api/products/:id      — single product detail
 */

import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { getDb } from "../../db/init";
import { getAmazonClient, AmazonProduct } from "./amazon-client";
import { evaluateProducts, FilterConfig, DEFAULT_FILTER_CONFIG } from "./filter";
import { generateAffiliateUrl, backfillAffiliateLinks } from "./affiliate";

export const productsRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /api/products/lookup
// ---------------------------------------------------------------------------

interface LookupRequest {
  asins?: string[];
  processDiscovered?: boolean;
}

productsRouter.post("/lookup", async (c) => {
  const db = getDb();
  const client = getAmazonClient();

  let body: LookupRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { success: false, error: "Invalid JSON body" },
      400
    );
  }

  // Determine which ASINs to look up
  let asins: string[] = [];

  if (body.processDiscovered) {
    // Process all unprocessed discovered products
    const rows = db
      .query(
        `SELECT asin FROM products
         WHERE status = 'discovered'
           AND asin IS NOT NULL
           AND asin != ''
         ORDER BY discovered_at DESC
         LIMIT 100`
      )
      .all() as { asin: string }[];

    asins = [...new Set(rows.map((r) => r.asin))];
  } else if (body.asins && body.asins.length > 0) {
    asins = [...new Set(body.asins)];
  } else {
    return c.json(
      {
        success: false,
        error:
          "Provide either { asins: string[] } or { processDiscovered: true }",
      },
      400
    );
  }

  if (asins.length === 0) {
    return c.json({
      success: true,
      lookedUp: 0,
      enriched: 0,
      approved: 0,
      rejected: 0,
      errors: ["No ASINs to process"],
      products: [],
    });
  }

  // Fetch from Amazon PAAPI
  const result = await client.getItemsBatched(asins);

  // Enrich the database
  let enriched = 0;
  let approved = 0;
  let rejected = 0;

  if (result.products.length > 0) {
    // Evaluate all products against filters
    const evaluations = evaluateProducts(result.products);

    for (const product of result.products) {
      const evalResult = evaluations.get(product.asin);
      if (!evalResult) continue;

      const newStatus = evalResult.passed ? "approved" : "rejected";
      const rejectionReason = evalResult.passed
        ? null
        : evalResult.reason ?? "Failed filter criteria";

      // Update the product row — find by ASIN
      const rows = db
        .query("SELECT id FROM products WHERE asin = ?")
        .all(product.asin) as { id: string }[];

      for (const row of rows) {
        db.query(
          `UPDATE products
           SET title = COALESCE(?, title),
               price = COALESCE(?, price),
               sales_rank = COALESCE(?, sales_rank),
               category = COALESCE(?, category),
               image_url = COALESCE(?, image_url),
               affiliate_link = COALESCE(?, affiliate_link),
               status = ?,
               rejection_reason = ?
           WHERE id = ?`
        ).run(
          product.title,
          product.price,
          product.salesRank,
          product.category,
          product.imageUrl,
          generateAffiliateUrl(product.asin),
          newStatus,
          rejectionReason,
          row.id
        );

        enriched++;
        if (evalResult.passed) approved++;
        else rejected++;
      }
    }
  }

  // Also backfill affiliate links for products that already had one
  backfillAffiliateLinks(db);

  // Build response
  const enrichedProducts = result.products.map((p) => ({
    ...p,
    evaluation: evaluations.get(p.asin),
  }));

  return c.json({
    success: true,
    lookedUp: asins.length,
    enriched,
    approved,
    rejected,
    apiErrors: result.errors,
    requestId: result.requestId,
    products: enrichedProducts.slice(0, 20), // cap response size
    credentialsConfigured: client.isConfigured(),
  });
});

// ---------------------------------------------------------------------------
// GET /api/products
// ---------------------------------------------------------------------------

productsRouter.get("/", (c) => {
  const db = getDb();

  // Parse query filters
  const status = c.req.query("status");
  const minPrice = c.req.query("minPrice")
    ? Number(c.req.query("minPrice"))
    : undefined;
  const maxRank = c.req.query("maxRank")
    ? Number(c.req.query("maxRank"))
    : undefined;
  const limit = Math.min(
    c.req.query("limit") ? Number(c.req.query("limit")) : 50,
    200
  );
  const offset = c.req.query("offset")
    ? Number(c.req.query("offset"))
    : 0;

  // Build query
  let query = "SELECT * FROM products WHERE 1=1";
  const params: any[] = [];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  if (minPrice !== undefined) {
    query += " AND price >= ?";
    params.push(minPrice);
  }

  if (maxRank !== undefined) {
    query += " AND (sales_rank IS NULL OR sales_rank <= ?)";
    params.push(maxRank);
  }

  // Count total
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
  const totalRow = db.query(countQuery).all(...params) as { total: number }[];
  const total = totalRow[0]?.total ?? 0;

  // Fetch page
  query += " ORDER BY discovered_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = db.query(query).all(...params);

  // Also get counts per status
  const statusCounts = db
    .query(
      `SELECT status, COUNT(*) as count FROM products GROUP BY status`
    )
    .all() as { status: string; count: number }[];

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.status] = row.count;
  }

  return c.json({
    total,
    limit,
    offset,
    counts,
    products: rows,
  });
});

// ---------------------------------------------------------------------------
// GET /api/products/:id
// ---------------------------------------------------------------------------

productsRouter.get("/:id", (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const product = db
    .query("SELECT * FROM products WHERE id = ?")
    .get(id);

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json({ product });
});
