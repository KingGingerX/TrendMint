/**
 * Content service — business logic bridging the generator with the database.
 *
 * Responsibilities:
 *   - Fetch products from DB for generation
 *   - Call the tweet generator
 *   - Store generated posts in the `posts` table
 *   - Query generated content
 */

import { Database } from "bun:sqlite";
import { getDb } from "../../db/init";
import { config } from "../../config";
import { generateTweet, generateTweetsBatch, ProductForGeneration } from "./generator";

export interface GenerateRequest {
  productId?: string;
  productIds?: string[];
  batchSize?: number;
}

export interface GenerateResponse {
  success: boolean;
  generated: number;
  failed: number;
  errors: string[];
  totalTokensUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  estimatedCost: number;
}

export interface ContentListItem {
  id: string;
  product_id: string;
  product_title: string;
  platform: string;
  content: string;
  status: string;
  generated_at: string;
  posted_at: string | null;
}

/**
 * Build a ProductForGeneration from a DB row.
 */
function productRowToGeneration(row: Record<string, unknown>): ProductForGeneration {
  return {
    title: (row.title as string) ?? "Unknown Product",
    price: row.price as number | null,
    category: row.category as string | null,
    image_url: row.image_url as string | null,
    affiliate_link: row.affiliate_link as string | null,
    features: undefined, // products table has no features column yet
  };
}

/**
 * Store a generated tweet in the posts table.
 * Returns the new post ID.
 */
function storePost(
  db: Database,
  productId: string,
  productTitle: string,
  tweetText: string,
): string {
  const id = generateId();
  const now = new Date().toISOString();

  db.query(
    `INSERT INTO posts (id, product_id, product_title, platform, content, status, generated_at)
     VALUES (?, ?, ?, 'twitter', ?, 'draft', ?)`,
  ).run(id, productId, productTitle, tweetText, now);

  return id;
}

/**
 * Generate a tweet for a single product by ID.
 */
async function generateForProduct(
  db: Database,
  productId: string,
): Promise<{ success: boolean; error?: string; tokensUsed: number }> {
  const product = db
    .query("SELECT * FROM products WHERE id = ?")
    .get(productId) as Record<string, unknown> | undefined;

  if (!product) {
    return { success: false, error: `Product not found: ${productId}`, tokensUsed: 0 };
  }

  // Skip if already has a draft
  const existingDraft = db
    .query("SELECT id FROM posts WHERE product_id = ? AND status = 'draft'")
    .get(productId);

  if (existingDraft) {
    return {
      success: false,
      error: `Product ${productId} already has a draft post`,
      tokensUsed: 0,
    };
  }

  const genInput = productRowToGeneration(product);
  const result = await generateTweet(genInput);

  if (result.error) {
    return { success: false, error: result.error.error, tokensUsed: 0 };
  }

  if (!result.tweet) {
    return { success: false, error: "No tweet generated", tokensUsed: 0 };
  }

  const postId = storePost(db, productId, product.title as string, result.tweet.text);

  // Replace {{AFFILIATE_LINK}} placeholder with tracked redirect URL
  const redirectUrl = `${config.BASE_URL}/r/${postId}`;
  const finalContent = result.tweet.text.replace(
    /\{\{AFFILIATE_LINK\}\}/gi,
    redirectUrl,
  );

  // Update post with final content containing the redirect URL
  db.query("UPDATE posts SET content = ? WHERE id = ?").run(finalContent, postId);

  return {
    success: true,
    tokensUsed: result.tweet.usage.totalTokens,
  };
}

/**
 * Main entry point — generate content for one or more products.
 */
export async function generateContent(
  request: GenerateRequest,
): Promise<GenerateResponse> {
  const db = getDb();

  // Determine which products to process
  let productIds: string[] = [];

  if (request.productId) {
    productIds = [request.productId];
  } else if (request.productIds && request.productIds.length > 0) {
    productIds = [...new Set(request.productIds)];
  } else {
    // Default: all approved products without drafts
    const batchSize = request.batchSize ?? 10;
    const rows = db
      .query(
        `SELECT p.id FROM products p
         WHERE p.status = 'approved'
           AND p.affiliate_link IS NOT NULL
           AND p.affiliate_link != ''
           AND NOT EXISTS (
             SELECT 1 FROM posts ps
             WHERE ps.product_id = p.id AND ps.status = 'draft'
           )
         ORDER BY p.discovered_at DESC
         LIMIT ?`,
      )
      .all(batchSize) as { id: string }[];

    productIds = rows.map((r) => r.id);
  }

  if (productIds.length === 0) {
    return {
      success: true,
      generated: 0,
      failed: 0,
      errors: ["No products available for generation (need approved products with affiliate links and no existing drafts)"],
      totalTokensUsed: 0,
    };
  }

  // Process sequentially to avoid rate-limiting and DB contention
  let generated = 0;
  let failed = 0;
  const errors: string[] = [];
  let totalTokensUsed = 0;

  for (const productId of productIds) {
    const result = await generateForProduct(db, productId);
    if (result.success) {
      generated++;
    } else {
      failed++;
      if (result.error) errors.push(result.error);
    }
    totalTokensUsed += result.tokensUsed;
  }

  return {
    success: true,
    generated,
    failed,
    errors: errors.length > 0 ? errors : [],
    totalTokensUsed,
  };
}

/**
 * List generated content with optional filtering.
 */
export function listContent(
  status?: string,
  limit: number = 20,
  offset: number = 0,
): { posts: ContentListItem[]; total: number } {
  const db = getDb();

  let query = "SELECT * FROM posts WHERE 1=1";
  const params: unknown[] = [];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  // Count
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
  const totalRow = db.query(countQuery).all(...params) as { total: number }[];
  const total = totalRow[0]?.total ?? 0;

  // Fetch
  query += " ORDER BY generated_at DESC LIMIT ? OFFSET ?";
  params.push(Math.min(limit, 100), offset);

  const rows = db.query(query).all(...params) as ContentListItem[];

  return { posts: rows, total };
}

/**
 * Get a single post by ID.
 */
export function getContentById(
  id: string,
): ContentListItem | undefined {
  const db = getDb();
  return db
    .query("SELECT * FROM posts WHERE id = ?")
    .get(id) as ContentListItem | undefined;
}

// Simple ID generator (no external deps)
function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
