/**
 * Affiliate link generator.
 *
 * Generates Amazon affiliate links using the Associates partner tag.
 * Stores the tagged URL in the products table.
 */

import { Database } from "bun:sqlite";
import { config } from "../../config";

// ---------------------------------------------------------------------------
// Link generation
// ---------------------------------------------------------------------------

/**
 * Generate a full Amazon affiliate link for an ASIN.
 *
 * Format: https://www.amazon.com/dp/{ASIN}?tag={PARTNER_TAG}
 *
 * Also returns a shortened amzn.to form that can be optionally resolved
 * via Amazon's own shortening service.  For MVP we store the full tagged
 * URL — it's reliable and doesn't require another API call.
 */
export function generateAffiliateUrl(asin: string): string {
  const tag = config.AMAZON_PARTNER_TAG || "trendmint-20";
  return `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(tag)}`;
}

/**
 * Shortened amzn.to link format.
 *
 * Amazon's official shortener is amzn.to, served through their link
 * shortening API.  For MVP we store the full URL (reliable, no extra
 * API dependency).  This is here for future use.
 *
 * Example: https://amzn.to/3xYzAbC?tag=trendmint-20
 */
export function generateAmznToUrl(_asin: string): string {
  // amzn.to requires calling Amazon's shortening API with an auth token.
  // For MVP, we use the full tagged URL instead.
  throw new Error(
    "amzn.to shortening requires Amazon's link shortening API — " +
      "use generateAffiliateUrl() for MVP"
  );
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

/**
 * Update a product row with its affiliate link.
 * Returns true if the row was updated.
 */
export function updateAffiliateLink(
  db: Database,
  productId: string,
  asin: string
): boolean {
  const url = generateAffiliateUrl(asin);

  const result = db
    .query("UPDATE products SET affiliate_link = ? WHERE id = ?")
    .run(url, productId);

  return result.changes > 0;
}

/**
 * Batch-update affiliate links for all known ASINs that don't have one yet.
 * Returns the count of updated rows.
 */
export function backfillAffiliateLinks(db: Database): number {
  const rows = db
    .query(
      "SELECT id, asin FROM products WHERE asin IS NOT NULL AND (affiliate_link IS NULL OR affiliate_link = '')"
    )
    .all() as { id: string; asin: string }[];

  let count = 0;
  for (const row of rows) {
    if (updateAffiliateLink(db, row.id, row.asin)) {
      count++;
    }
  }

  return count;
}
