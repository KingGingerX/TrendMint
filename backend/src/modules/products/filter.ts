/**
 * Product filter/validator.
 *
 * Evaluates Amazon products against configurable thresholds:
 *   - Price ≥ $30
 *   - Sales rank ≤ category-specific threshold
 *
 * Categories differ widely in what a "good" rank means:
 *   5,000 in Books is average; 5,000 in Electronics is poor.
 * We use reasonable defaults that err on the side of quality.
 */

import type { AmazonProduct } from "./amazon-client";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FilterConfig {
  /** Minimum price in USD (inclusive) */
  minPrice: number;

  /** Default max sales rank when no category-specific threshold applies */
  defaultMaxRank: number;

  /** Per-category overrides: higher = more permissive */
  categoryThresholds: Record<string, number>;
}

/**
 * Default filter thresholds.
 *
 * These are intentionally conservative — we want products that are
 * actually selling, not just listed.  The category thresholds are
 * derived from typical Amazon sales rank distributions.
 *
 * Key reference points (approximate):
 *   - Top 1% of Amazon products: rank < 5,000
 *   - Books #5,000 ≈ 5-10 sales/day — low bar
 *   - Electronics #5,000 ≈ 50+ sales/day — a solid winner
 *   - Clothing #5,000 ≈ 10-20 sales/day
 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minPrice: 30,
  defaultMaxRank: 5000,

  categoryThresholds: {
    // High-velocity categories — stricter
    Electronics: 3000,
    "Cell Phones & Accessories": 3000,
    "Computers & Accessories": 3000,
    "Video Games": 2000,

    // Moderate categories — default (5,000)
    "Home & Kitchen": 5000,
    "Sports & Outdoors": 5000,
    "Tools & Home Improvement": 5000,
    "Health & Household": 5000,
    "Beauty & Personal Care": 5000,
    "Pet Supplies": 5000,
    "Toys & Games": 5000,
    "Office Products": 5000,
    "Grocery & Gourmet Food": 5000,
    Automotive: 5000,
    "Baby Products": 5000,

    // Slower categories — more permissive
    Books: 15000,
    "Kindle Store": 15000,
    "Clothing, Shoes & Jewelry": 8000,
    "Arts, Crafts & Sewing": 10000,
    "Musical Instruments": 10000,
    "Industrial & Scientific": 10000,
  },
};

// ---------------------------------------------------------------------------
// Filter result
// ---------------------------------------------------------------------------

export interface FilterEvaluation {
  passed: boolean;
  reason?: string;
  pricePassed: boolean;
  rankPassed: boolean;
  effectiveMaxRank: number;
}

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

/**
 * Evaluate a single Amazon product against filter criteria.
 */
export function evaluateProduct(
  product: AmazonProduct,
  config: FilterConfig = DEFAULT_FILTER_CONFIG
): FilterEvaluation {
  const reasons: string[] = [];

  // --- Price check ---
  const pricePassed =
    product.price != null && product.price >= config.minPrice;

  if (!pricePassed) {
    if (product.price == null) {
      reasons.push(`No price data available (need ≥ $${config.minPrice})`);
    } else {
      reasons.push(
        `Price $${product.price.toFixed(2)} is below minimum $${config.minPrice}`
      );
    }
  }

  // --- Sales rank check ---
  // Determine effective max rank for this product's category
  let effectiveMaxRank = config.defaultMaxRank;

  if (product.category) {
    // Try exact match first
    if (config.categoryThresholds[product.category] !== undefined) {
      effectiveMaxRank = config.categoryThresholds[product.category];
    } else {
      // Try substring / prefix matching
      for (const [catKey, threshold] of Object.entries(
        config.categoryThresholds
      )) {
        if (
          product.category.toLowerCase().includes(catKey.toLowerCase()) ||
          catKey.toLowerCase().includes(product.category.toLowerCase())
        ) {
          effectiveMaxRank = threshold;
          break;
        }
      }
    }
  }

  const rankPassed =
    product.salesRank != null && product.salesRank <= effectiveMaxRank;

  if (!rankPassed) {
    if (product.salesRank == null) {
      reasons.push(
        `No sales rank data available (need ≤ ${effectiveMaxRank.toLocaleString()})`
      );
    } else {
      reasons.push(
        `Sales rank #${product.salesRank.toLocaleString()} exceeds max #${effectiveMaxRank.toLocaleString()} (category: ${product.category || "unknown"})`
      );
    }
  }

  const passed = pricePassed && rankPassed;

  return {
    passed,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    pricePassed,
    rankPassed,
    effectiveMaxRank,
  };
}

/**
 * Batch-evaluate multiple products.
 */
export function evaluateProducts(
  products: AmazonProduct[],
  config: FilterConfig = DEFAULT_FILTER_CONFIG
): Map<string, FilterEvaluation> {
  const results = new Map<string, FilterEvaluation>();
  for (const p of products) {
    results.set(p.asin, evaluateProduct(p, config));
  }
  return results;
}
