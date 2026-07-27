/**
 * Amazon Product Advertising API 5.0 client.
 *
 * Uses AWS Signature V4 for authentication (no aws-sdk dependency).
 * Rate-limited to 1 request/second with 200ms buffer.
 */

import { config } from "../../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** PAAPI GetItems request resources */
const PAAPI_RESOURCES = [
  "ItemInfo.Title",
  "Offers.Listings.Price",
  "BrowseNodeInfo.BrowseNodes",
  "Images.Primary.Large",
  "ItemInfo.Features",
] as const;

export interface AmazonProduct {
  asin: string;
  title: string;
  price: number | null;
  salesRank: number | null;
  category: string | null;
  imageUrl: string | null;
  features: string[];
}

export interface GetItemsResult {
  products: AmazonProduct[];
  errors: { asin: string; error: string }[];
  requestId: string | null;
}

// ---------------------------------------------------------------------------
// AWS Signature V4
// ---------------------------------------------------------------------------

const PAAPI_REGION = "us-east-1";
const PAAPI_SERVICE = "ProductAdvertisingAPI";
const PAAPI_HOST = "webservices.amazon.com";
const PAAPI_ENDPOINT = `https://${PAAPI_HOST}/paapi5/getitems`;
const PAAPI_TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";

/**
 * Build an AWS Signature V4 Authorization header for a PAAPI request.
 *
 * Ref: https://docs.aws.amazon.com/paapi5/latest/documentation/sending-request.html
 */
async function signRequest(body: string): Promise<{
  headers: Record<string, string>;
  amzDate: string;
}> {
  const accessKey = config.AMAZON_ACCESS_KEY;
  const secretKey = config.AMAZON_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error(
      "Amazon PAAPI credentials not configured. Set AMAZON_ACCESS_KEY and AMAZON_SECRET_KEY."
    );
  }

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = "/paapi5/getitems";
  const canonicalQuerystring = "";
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=UTF-8\n` +
    `host:${PAAPI_HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${PAAPI_TARGET}\n`;
  const signedHeaders =
    "content-encoding;content-type;host;x-amz-date;x-amz-target";

  const payloadHash = await sha256Hex(body);

  const canonicalRequest = [
    "POST",
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${PAAPI_REGION}/${PAAPI_SERVICE}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(
    secretKey,
    dateStamp,
    PAAPI_REGION,
    PAAPI_SERVICE
  );
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization =
    `${algorithm} ` +
    `Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  return {
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Content-Encoding": "amz-1.0",
      Host: PAAPI_HOST,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": PAAPI_TARGET,
      Authorization: authorization,
    },
    amzDate,
  };
}

// ---------------------------------------------------------------------------
// Crypto helpers (using Bun.CryptoHasher where available)
// ---------------------------------------------------------------------------

async function sha256Hex(data: string): Promise<string> {
  // Bun has native crypto.subtle
  const enc = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(key: ArrayBuffer | Uint8Array, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key instanceof ArrayBuffer ? new Uint8Array(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const enc = new TextEncoder().encode(data);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<Uint8Array> {
  const kSecret = new TextEncoder().encode(`AWS4${secretKey}`);

  const kDate = await hmacRaw(kSecret, dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  const kSigning = await hmacRaw(kService, "aws4_request");

  return kSigning;
}

async function hmacRaw(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const enc = new TextEncoder().encode(data);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc);
  return new Uint8Array(sig);
}

// ---------------------------------------------------------------------------
// Amazon PAAPI Client
// ---------------------------------------------------------------------------

export class AmazonPaapiClient {
  private lastRequestTime: number = 0;

  /** Check if credentials are configured */
  isConfigured(): boolean {
    return !!(config.AMAZON_ACCESS_KEY && config.AMAZON_SECRET_KEY);
  }

  /**
   * Respect rate limits: max 1 request/second + 200ms buffer.
   * Returns when it's safe to send the next request.
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const minInterval = 1200; // 1 request/second + 200ms buffer

    if (elapsed < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - elapsed)
      );
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch product details for up to 10 ASINs via GetItems.
   *
   * Returns partial results: individual ASIN failures are captured in
   * the `errors` array rather than throwing.
   */
  async getItems(asins: string[]): Promise<GetItemsResult> {
    if (!this.isConfigured()) {
      return {
        products: [],
        errors: [
          {
            asin: "all",
            error:
              "Amazon PAAPI credentials not configured. " +
              "Set AMAZON_ACCESS_KEY and AMAZON_SECRET_KEY.",
          },
        ],
        requestId: null,
      };
    }

    if (asins.length === 0) {
      return { products: [], errors: [], requestId: null };
    }

    // PAAPI accepts at most 10 ASINs per call
    if (asins.length > 10) {
      return {
        products: [],
        errors: [
          { asin: "all", error: "Maximum 10 ASINs per GetItems call" },
        ],
        requestId: null,
      };
    }

    await this.throttle();

    const body = JSON.stringify({
      ItemIds: asins,
      Resources: PAAPI_RESOURCES,
      PartnerTag: config.AMAZON_PARTNER_TAG || "trendmint-20",
      PartnerType: "Associates",
      Marketplace: "www.amazon.com",
    });

    try {
      const { headers } = await signRequest(body);

      const response = await fetch(PAAPI_ENDPOINT, {
        method: "POST",
        headers,
        body,
      });

      const responseBody = await response.text();

      if (!response.ok) {
        return {
          products: [],
          errors: [
            {
              asin: "all",
              error: `PAAPI HTTP ${response.status}: ${responseBody.slice(0, 300)}`,
            },
          ],
          requestId: null,
        };
      }

      return this.parseResponse(asins, responseBody);
    } catch (err) {
      // Network errors, signature failures, etc.
      return {
        products: [],
        errors: [
          { asin: "all", error: `PAAPI request failed: ${String(err)}` },
        ],
        requestId: null,
      };
    }
  }

  /**
   * Parse the PAAPI GetItems JSON response.
   *
   * PAAPI returns an ItemsResult with an Items array and
   * (for errors) an Errors array keyed by ASIN.
   */
  private parseResponse(asins: string[], raw: string): GetItemsResult {
    const products: AmazonProduct[] = [];
    const errors: { asin: string; error: string }[] = [];

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      errors.push({ asin: "all", error: "Failed to parse PAAPI response" });
      return { products, errors, requestId: null };
    }

    const requestId = data?.ItemsResult?.RequestId ?? null;

    // Check for top-level errors
    if (data?.__type) {
      errors.push({
        asin: "all",
        error: `PAAPI error: ${data.__type} — ${data.Message || "no message"}`,
      });
      return { products, errors, requestId };
    }

    // Check for per-ASIN errors
    const itemErrors = data?.ItemsResult?.Items?.[0]?.Errors;
    if (Array.isArray(itemErrors)) {
      for (const e of itemErrors) {
        // PAAPI error objects typically have Code + Message
        errors.push({
          asin: (e as any).ItemId ?? "unknown",
          error: `${(e as any).Code ?? "Unknown"}: ${(e as any).Message ?? "no detail"}`,
        });
      }
    }

    // Parse successful items
    const items = data?.ItemsResult?.Items;
    if (Array.isArray(items)) {
      for (const item of items) {
        const asin = item.ASIN;
        if (!asin) continue;

        // Title
        const title =
          item?.ItemInfo?.Title?.DisplayValue ?? null;

        // Price from Offers.Listings
        const priceRaw =
          item?.Offers?.Listings?.[0]?.Price?.Amount;
        const price = priceRaw != null ? Number(priceRaw) : null;

        // Sales rank — take the lowest (best) rank from BrowseNodes
        const browseNodes = item?.BrowseNodeInfo?.BrowseNodes;
        const salesRank = extractBestSalesRank(browseNodes);

        // Category — top-level BrowseNode display name
        const category = extractTopCategory(browseNodes);

        // Image
        const imageUrl =
          item?.Images?.Primary?.Large?.URL ?? null;

        // Features (bullet points)
        const features: string[] =
          item?.ItemInfo?.Features?.DisplayValues ?? [];

        products.push({
          asin,
          title,
          price,
          salesRank,
          category,
          imageUrl,
          features,
        });
      }
    }

    // Check for missing ASINs that didn't produce errors
    const foundAsins = new Set(products.map((p) => p.asin));
    const errorAsins = new Set(errors.map((e) => e.asin));
    for (const asin of asins) {
      if (!foundAsins.has(asin) && !errorAsins.has(asin)) {
        errors.push({
          asin,
          error: "No data returned for this ASIN",
        });
      }
    }

    return { products, errors, requestId };
  }

  /**
   * Fetch products across multiple batches (handles >10 ASINs).
   */
  async getItemsBatched(
    asins: string[],
    batchSize: number = 10
  ): Promise<GetItemsResult> {
    const allProducts: AmazonProduct[] = [];
    const allErrors: { asin: string; error: string }[] = [];
    let firstRequestId: string | null = null;

    const cappedSize = Math.min(batchSize, 10);

    for (let i = 0; i < asins.length; i += cappedSize) {
      const batch = asins.slice(i, i + cappedSize);
      const result = await this.getItems(batch);

      allProducts.push(...result.products);
      allErrors.push(...result.errors);
      if (!firstRequestId) firstRequestId = result.requestId;
    }

    return {
      products: allProducts,
      errors: allErrors,
      requestId: firstRequestId,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the best (lowest) sales rank from BrowseNodeInfo.
 * PAAPI nests BrowseNodes — we flatten and take the minimum rank.
 */
function extractBestSalesRank(browseNodes: any): number | null {
  if (!browseNodes || !Array.isArray(browseNodes)) return null;

  let bestRank: number | null = null;

  const visit = (nodes: any[]) => {
    for (const node of nodes) {
      const rank = node?.SalesRank;
      if (typeof rank === "number" && rank > 0) {
        if (bestRank === null || rank < bestRank) {
          bestRank = rank;
        }
      }
      // Recurse into ancestor nodes
      if (node?.Ancestor) {
        visit([node.Ancestor]);
      }
    }
  };

  visit(browseNodes);
  return bestRank;
}

/**
 * Extract the most specific category display name from BrowseNodes.
 */
function extractTopCategory(browseNodes: any): string | null {
  if (!browseNodes || !Array.isArray(browseNodes) || browseNodes.length === 0) {
    return null;
  }
  // Return the first (most specific) BrowseNode's DisplayName
  return browseNodes[0]?.DisplayName ?? null;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _client: AmazonPaapiClient | null = null;
export function getAmazonClient(): AmazonPaapiClient {
  if (!_client) {
    _client = new AmazonPaapiClient();
  }
  return _client;
}
