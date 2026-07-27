const BASE_URL = ""; // Uses Vite proxy in dev

interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { method = "GET", body, signal } = options;

  const headers: Record<string, string> = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json.error || json.detail || text;
    } catch {}
    throw new Error(detail || `API error: ${res.status}`);
  }

  return res.json();
}

// Typed helpers
apiFetch.get = <T = unknown>(path: string) => apiFetch<T>(path);
apiFetch.post = <T = unknown>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body });

// ─── Discovery ─────────────────────────────────────────────

export interface DiscoveryStatus {
  lastScanTime: string;
  totalProducts: number;
  fromReddit: number;
  discovered: number;
  configuredSubreddits: string[];
  redditCredentialsSet: boolean;
}

export interface ScanResult {
  success: boolean;
  subredditsScanned: string[];
  postsScanned: number;
  productsFound: number;
  newProducts: number;
  alreadyKnown: number;
  errors: string[];
  durationMs: number;
  lastScanTime: string;
}

export function triggerDiscoveryScan(
  opts?: { subreddits?: string[]; limit?: number; sort?: string; time?: string }
): Promise<ScanResult> {
  return apiFetch.post<ScanResult>("/api/discovery/scan", opts ?? {});
}

export function getDiscoveryStatus(): Promise<DiscoveryStatus> {
  return apiFetch.get<DiscoveryStatus>("/api/discovery/status");
}

// ─── Products ─────────────────────────────────────────────

export interface Product {
  id: string;
  asin: string | null;
  title: string | null;
  price: number | null;
  sales_rank: number | null;
  category: string | null;
  image_url: string | null;
  affiliate_link: string | null;
  source: string | null;
  discovered_at: string | null;
  status: string;
  rejection_reason: string | null;
}

export interface ProductsResponse {
  total: number;
  limit: number;
  offset: number;
  counts: Record<string, number>;
  products: Product[];
}

export interface LookupResult {
  success: boolean;
  lookedUp: number;
  enriched: number;
  approved: number;
  rejected: number;
  apiErrors: string[];
  products: unknown[];
  credentialsConfigured: boolean;
}

export function lookupProducts(
  opts?: { asins?: string[]; processDiscovered?: boolean }
): Promise<LookupResult> {
  return apiFetch.post<LookupResult>("/api/products/lookup", opts ?? { processDiscovered: true });
}

export function getProducts(params?: {
  status?: string;
  minPrice?: number;
  maxRank?: number;
  limit?: number;
  offset?: number;
}): Promise<ProductsResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.minPrice !== undefined) sp.set("minPrice", String(params.minPrice));
  if (params?.maxRank !== undefined) sp.set("maxRank", String(params.maxRank));
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return apiFetch.get<ProductsResponse>(`/api/products${qs ? "?" + qs : ""}`);
}

export function getProduct(id: string): Promise<{ product: Product }> {
  return apiFetch.get<{ product: Product }>(`/api/products/${id}`);
}

// ─── Content ───────────────────────────────────────────────

export interface ContentPost {
  id: string;
  product_id: string;
  product_title: string | null;
  platform: string;
  content: string;
  status: string;
  generated_at: string | null;
  posted_at: string | null;
  tweet_id?: string | null;
}

export interface ContentResponse {
  posts: ContentPost[];
  total: number;
  counts?: Record<string, number>;
}

export interface GenerateResult {
  success: boolean;
  generated: number;
  failed: number;
  errors: string[];
  totalTokensUsed: number;
  estimatedCost?: string;
}

export function generateContent(
  opts?: { productIds?: string[]; batchSize?: number }
): Promise<GenerateResult> {
  return apiFetch.post<GenerateResult>("/api/content/generate", opts ?? {});
}

export function getContent(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ContentResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return apiFetch.get<ContentResponse>(`/api/content${qs ? "?" + qs : ""}`);
}

// ─── Scheduler ─────────────────────────────────────────────

export interface SchedulerStats {
  postsToday: number;
  postsThisMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  minimumIntervalMinutes: number;
  secondsUntilNextPost: number;
  totalPosted: number;
  totalDrafts: number;
  autoPostEnabled: boolean;
}

export interface QueueItem {
  post: ContentPost;
  position: number;
}

export interface QueueResponse {
  queue: QueueItem[];
  totalDrafts: number;
  lastPostTime: string | null;
  nextEligibleTime: string | null;
  rateLimitStatus: {
    postsToday: number;
    postsThisMonth: number;
    dailyLimit: number;
    monthlyLimit: number;
    dailyRemaining: number;
    monthlyRemaining: number;
    minimumIntervalMinutes: number;
    secondsUntilNextPost: number;
  };
}

export interface PostResult {
  success: boolean;
  tweetId?: string;
  text?: string;
  postId?: string;
  error?: string;
}

export interface AutoPostStatus {
  enabled: boolean;
  running: boolean;
  message: string;
  note?: string;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

export function postNow(): Promise<PostResult> {
  return apiFetch.post<PostResult>("/api/scheduler/post-now");
}

export function getQueue(): Promise<QueueResponse> {
  return apiFetch.get<QueueResponse>("/api/scheduler/queue");
}

export function getStats(): Promise<SchedulerStats> {
  return apiFetch.get<SchedulerStats>("/api/scheduler/stats");
}

export function toggleAutoPost(enabled: boolean): Promise<{ success: boolean; autoPostEnabled: boolean; message: string }> {
  return apiFetch.post("/api/scheduler/auto-post/toggle", { enabled });
}

export function getAutoPostStatus(): Promise<AutoPostStatus> {
  return apiFetch.get<AutoPostStatus>("/api/scheduler/auto-post/status");
}

export function verifyCredentials(): Promise<VerifyResult> {
  return apiFetch.get<VerifyResult>("/api/scheduler/verify");
}
