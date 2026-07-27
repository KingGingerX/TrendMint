/**
 * Product link extractor for Reddit posts.
 * Detects Amazon ASINs, other product URLs, and deduplicates per session.
 */

// Regex patterns for extracting Amazon ASINs from URLs
const AMAZON_PATTERNS: RegExp[] = [
  // amazon.com/dp/ASIN
  /amazon\.com\/dp\/([A-Z0-9]{10})\b/gi,
  // amazon.com/gp/product/ASIN
  /amazon\.com\/gp\/product\/([A-Z0-9]{10})\b/gi,
  // amazon.com/*/dp/ASIN (with optional slug)
  /amazon\.com\/[^/]+\/dp\/([A-Z0-9]{10})\b/gi,
  // amzn.to shortened links (we can't extract ASIN directly from URL, but we can flag them)
  /amzn\.to\/([A-Za-z0-9]+)\b/gi,
  // amazon.com/dp/ASIN/ref=... (with trailing ref)
  /amazon\.com\/dp\/([A-Z0-9]{10})\//gi,
];

// Other product/store domain patterns for future use
const STORE_PATTERNS: { domain: string; regex: RegExp }[] = [
  { domain: "etsy.com", regex: /etsy\.com\/listing\/\d+/gi },
  { domain: "shopify.com", regex: /[a-z0-9-]+\.myshopify\.com\/products\/[a-z0-9-]+/gi },
  { domain: "ebay.com", regex: /ebay\.com\/itm\/\d+/gi },
  { domain: "walmart.com", regex: /walmart\.com\/ip\/[a-z0-9-]+\/\d+/gi },
  { domain: "target.com", regex: /target\.com\/p\/[a-z0-9-]+/gi },
  { domain: "bestbuy.com", regex: /bestbuy\.com\/site\/[a-z0-9-]+\/\d+/gi },
];

/** Standardized Amazon ASIN: 10 uppercase alphanumeric characters */
function normalizeAsin(raw: string): string {
  return raw.toUpperCase().trim();
}

/** Validate that a string looks like a real ASIN */
function isValidAsin(possible: string): boolean {
  // ASINs are 10 characters, alphanumeric
  // Known invalid: all-numeric strings that are too short
  return /^[A-Z0-9]{10}$/.test(possible);
}

export interface ProductLink {
  type: "amazon_asin" | "amzn_short" | "store_url";
  value: string; // ASIN or full URL
  storeDomain?: string; // for store_url type
}

export interface ExtractionResult {
  asins: string[];
  amznShortLinks: string[];
  storeUrls: ProductLink[];
}

/**
 * Extract all product links from a chunk of text (post title + selftext).
 */
export function extractProductLinks(text: string): ExtractionResult {
  const asins = new Set<string>();
  const amznShortLinks = new Set<string>();
  const storeUrls: ProductLink[] = [];
  const seenStoreUrls = new Set<string>();

  // Extract Amazon ASINs
  for (const pattern of AMAZON_PATTERNS) {
    pattern.lastIndex = 0; // reset regex state
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1];
      // amzn.to links are shortlinks, not direct ASINs
      if (pattern.source.startsWith("amzn\\.to")) {
        const shortLink = `https://amzn.to/${raw}`;
        if (!amznShortLinks.has(shortLink)) {
          amznShortLinks.add(shortLink);
        }
      } else {
        const asin = normalizeAsin(raw);
        if (isValidAsin(asin)) {
          asins.add(asin);
        }
      }
    }
  }

  // Extract other store URLs
  for (const { domain, regex } of STORE_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const url = match[0];
      if (!seenStoreUrls.has(url)) {
        seenStoreUrls.add(url);
        storeUrls.push({ type: "store_url", value: url, storeDomain: domain });
      }
    }
  }

  return {
    asins: Array.from(asins),
    amznShortLinks: Array.from(amznShortLinks),
    storeUrls,
  };
}

/**
 * Extract product links from a Reddit post, combining title and selftext.
 */
export function extractFromPost(post: {
  title: string;
  selftext?: string;
  url?: string;
}): ExtractionResult {
  const combinedText = [post.title, post.selftext, post.url].filter(Boolean).join(" ");
  return extractProductLinks(combinedText);
}

/**
 * Session-scoped deduplicator: tracks ASINs seen during a single scan session.
 */
export class ScanDeduplicator {
  private seenAsins = new Set<string>();

  /** Returns only ASINs not yet seen in this scan session */
  filterNew(asins: string[]): string[] {
    const newAsins = asins.filter((a) => !this.seenAsins.has(a));
    for (const a of newAsins) {
      this.seenAsins.add(a);
    }
    return newAsins;
  }

  get seenCount(): number {
    return this.seenAsins.size;
  }
}
