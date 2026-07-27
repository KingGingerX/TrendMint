/**
 * Reddit API client — OAuth2 app-only authentication.
 *
 * Rate limit: 60 requests per minute for OAuth2 app-only.
 * We keep a token cache and throttle requests to stay within limits.
 */

import { config } from "../../config";

// Default subreddits for product discovery
export const DEFAULT_SUBREDDITS = [
  "AmazonBudgetFinds",
  "DidntKnowIWantedThat",
  "shutupandtakemymoney",
  "gadgets",
  "NewProductPorn",
  "BuyItForLife",
  "DealsReddit",
];

export interface RedditPost {
  id: string;
  title: string;
  url: string;
  selftext: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  subreddit: string;
  stickied?: boolean;
}

interface RedditListingChild {
  kind: string;
  data: {
    id: string;
    title: string;
    url: string;
    selftext: string;
    score: number;
    num_comments: number;
    created_utc: number;
    permalink: string;
    subreddit: string;
    stickied?: boolean;
  };
}

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  error?: string;
}

interface RedditListingResponse {
  kind: string;
  data: {
    children: RedditListingChild[];
    after: string | null;
  };
}

export class RedditClient {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private lastRequestTime: number = 0;
  private requestCountThisMinute: number = 0;
  private minuteWindowStart: number = 0;

  private readonly MAX_REQUESTS_PER_MINUTE = 55; // stay under the 60 limit
  private readonly MIN_REQUEST_INTERVAL_MS = 1100; // ~1.1s between requests

  /** Check if credentials are configured */
  isConfigured(): boolean {
    return !!(config.REDDIT_CLIENT_ID && config.REDDIT_CLIENT_SECRET);
  }

  /** OAuth2 app-only token */
  private async authenticate(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return; // token still valid (with 1min buffer)
    }

    if (!this.isConfigured()) {
      throw new Error(
        "Reddit API credentials not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET."
      );
    }

    const credentials = btoa(
      `${config.REDDIT_CLIENT_ID}:${config.REDDIT_CLIENT_SECRET}`
    );

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "TrendMint/0.1.0 (by /u/trendmint_bot)",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Reddit authentication failed: ${response.status} — ${body}`
      );
    }

    const tokenData: RedditTokenResponse = await response.json();
    if (tokenData.error) {
      throw new Error(`Reddit auth error: ${tokenData.error}`);
    }

    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
  }

  /** Respect rate limits — waits if needed */
  private async throttle(): Promise<void> {
    const now = Date.now();

    // Reset counter each minute window
    if (now - this.minuteWindowStart > 60000) {
      this.minuteWindowStart = now;
      this.requestCountThisMinute = 0;
    }

    // If at limit, wait for next window
    if (this.requestCountThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitMs = 60000 - (now - this.minuteWindowStart) + 500;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.minuteWindowStart = Date.now();
      this.requestCountThisMinute = 0;
    }

    // Minimum interval between requests
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.MIN_REQUEST_INTERVAL_MS - elapsed)
      );
    }

    this.lastRequestTime = Date.now();
    this.requestCountThisMinute++;
  }

  /** Make an authenticated request to the Reddit API */
  private async request<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    await this.authenticate();
    await this.throttle();

    const url = new URL(path, "https://oauth.reddit.com");
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        url.searchParams.set(key, val);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "User-Agent": "TrendMint/0.1.0 (by /u/trendmint_bot)",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Reddit API error ${response.status} for ${path}: ${body}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch posts from a subreddit's hot or top listing.
   * @param subreddit — subreddit name
   * @param sort — "hot" or "top"
   * @param t — time filter for "top": "day", "week", "month", "year", "all"
   * @param limit — max posts to fetch (1-100, default 25)
   */
  async fetchSubredditPosts(
    subreddit: string,
    sort: "hot" | "top" = "hot",
    t: "hour" | "day" | "week" | "month" | "year" | "all" = "week",
    limit: number = 25
  ): Promise<RedditPost[]> {
    const cleanedSubreddit = subreddit.replace(/^r\//, "");

    const listing = await this.request<RedditListingResponse>(
      `/r/${cleanedSubreddit}/${sort}`,
      {
        t,
        limit: String(Math.min(limit, 100)),
        raw_json: "1",
      }
    );

    if (!listing?.data?.children) {
      return [];
    }

    return listing.data.children
      .filter((c) => c.kind === "t3") // only link posts
      .map((c) => ({
        id: c.data.id,
        title: c.data.title,
        url: c.data.url,
        selftext: c.data.selftext || "",
        score: c.data.score,
        num_comments: c.data.num_comments,
        created_utc: c.data.created_utc,
        permalink: `https://reddit.com${c.data.permalink}`,
        subreddit: c.data.subreddit,
        stickied: c.data.stickied || false,
      }));
  }

  /**
   * Fetch posts across multiple subreddits.
   */
  async fetchAllSubreddits(
    subreddits: string[],
    sort: "hot" | "top" = "hot",
    t: "hour" | "day" | "week" | "month" | "year" | "all" = "week",
    limit: number = 25
  ): Promise<Map<string, RedditPost[]>> {
    const results = new Map<string, RedditPost[]>();

    for (const sub of subreddits) {
      try {
        const posts = await this.fetchSubredditPosts(sub, sort, t, limit);
        results.set(sub, posts);
      } catch (err) {
        console.error(`[discovery] Error fetching r/${sub}:`, err);
        results.set(sub, []);
      }
    }

    return results;
  }
}

/** Singleton-like factory — reuse the same client instance */
let _client: RedditClient | null = null;
export function getRedditClient(): RedditClient {
  if (!_client) {
    _client = new RedditClient();
  }
  return _client;
}
