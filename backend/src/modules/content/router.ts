/**
 * Content router — OpenAI-powered tweet generation endpoints.
 *
 * Endpoints:
 *   POST /api/content/generate  — generate tweet(s) for product(s)
 *   GET  /api/content            — list generated content
 *   GET  /api/content/:id        — single generated post detail
 */

import { Hono } from "hono";
import { getDb } from "../../db/init";
import { generateContent, listContent, getContentById } from "./service";

export const contentRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /api/content/generate
// ---------------------------------------------------------------------------

interface GenerateBody {
  productId?: string;
  productIds?: string[];
  batchSize?: number;
}

contentRouter.post("/generate", async (c) => {
  let body: GenerateBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (body.batchSize !== undefined && (body.batchSize < 1 || body.batchSize > 50)) {
    return c.json(
      { success: false, error: "batchSize must be between 1 and 50" },
      400,
    );
  }

  try {
    const result = await generateContent({
      productId: body.productId,
      productIds: body.productIds,
      batchSize: body.batchSize,
    });

    const statusCode = result.failed > 0 && result.generated === 0 ? 500 : 200;

    return c.json(
      {
        ...result,
        estimatedCost: `$${(result.totalTokensUsed * 0.00000007).toFixed(6)}`,
      },
      statusCode,
    );
  } catch (err) {
    return c.json(
      {
        success: false,
        error: "Generation failed",
        detail: String(err),
      },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/content
// ---------------------------------------------------------------------------

contentRouter.get("/", (c) => {
  const status = c.req.query("status");
  const limit = c.req.query("limit")
    ? Math.min(Number(c.req.query("limit")), 100)
    : 20;
  const offset = c.req.query("offset")
    ? Number(c.req.query("offset"))
    : 0;

  try {
    const result = listContent(status, limit, offset);

    // Get status counts from DB
    const db = getDb();
    const statusCounts = db
      .query("SELECT status, COUNT(*) as count FROM posts GROUP BY status")
      .all() as { status: string; count: number }[];

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = row.count;
    }

    return c.json({
      ...result,
      counts,
    });
  } catch (err) {
    return c.json(
      { error: "Failed to list content", detail: String(err) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/content/:id
// ---------------------------------------------------------------------------

contentRouter.get("/:id", (c) => {
  const id = c.req.param("id");

  try {
    const post = getContentById(id);

    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    return c.json({ post });
  } catch (err) {
    return c.json(
      { error: "Failed to fetch post", detail: String(err) },
      500,
    );
  }
});
