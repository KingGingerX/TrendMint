/**
 * Twitter/X API client — OAuth 1.0a (user context) + Bearer token fallback.
 *
 * Uses ONLY Bun's built-in crypto (no external OAuth libs).
 * Handles HMAC-SHA1 signature generation for OAuth 1.0a.
 */

import { config } from "../../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Tweet {
  id: string;
  text: string;
  edit_history_tweet_ids?: string[];
}

export interface TwitterError {
  status: number;
  title: string;
  detail: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

function checkCredentials(): { ok: true } | { ok: false; error: string } {
  const missing: string[] = [];
  if (!config.TWITTER_API_KEY) missing.push("TWITTER_API_KEY");
  if (!config.TWITTER_API_SECRET) missing.push("TWITTER_API_SECRET");
  if (!config.TWITTER_ACCESS_TOKEN) missing.push("TWITTER_ACCESS_TOKEN");
  if (!config.TWITTER_ACCESS_SECRET) missing.push("TWITTER_ACCESS_SECRET");

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing Twitter credentials: ${missing.join(", ")}. Set them in .env`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// OAuth 1.0a helpers
// ---------------------------------------------------------------------------

function generateNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 32; i++) {
    result += chars[buf[i] % chars.length];
  }
  return result;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * Build the HMAC-SHA1 OAuth signature.
 *
 * Signature base string: METHOD&encoded_base_url&encoded_params
 * Signing key: consumer_secret&token_secret
 */
async function buildOAuthSignature(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): Promise<string> {
  // 1. Sort params alphabetically, then percent-encode keys and values
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  // 2. Build signature base string
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join("&");

  // 3. Build signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  // 4. HMAC-SHA1
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingKey);
  const messageData = encoder.encode(signatureBase);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const signatureBuf = await crypto.subtle.sign("HMAC", cryptoKey, messageData);

  // Base64 encode
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuf)));
}

/**
 * Build the OAuth 1.0a Authorization header value.
 */
async function buildAuthHeader(
  method: string,
  url: string,
  bodyParams: Record<string, string> = {},
): Promise<string> {
  const creds = checkCredentials();
  if (!creds.ok) throw new Error(creds.error);

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.TWITTER_API_KEY,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: config.TWITTER_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  // All params (oauth + body) participate in signature
  const allParams = { ...oauthParams, ...bodyParams };
  const signature = await buildOAuthSignature(
    method,
    url,
    allParams,
    config.TWITTER_API_SECRET,
    config.TWITTER_ACCESS_SECRET,
  );

  oauthParams["oauth_signature"] = signature;

  // Build header value
  const headerParts = Object.entries(oauthParams).map(
    ([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`,
  );

  return `OAuth ${headerParts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Twitter API client
// ---------------------------------------------------------------------------

const TWITTER_API_BASE = "https://api.x.com";

/**
 * POST a tweet using OAuth 1.0a user-context authentication.
 * Endpoint: POST https://api.x.com/2/tweets
 */
export async function postTweet(
  text: string,
): Promise<{ tweetId: string; text: string }> {
  const creds = checkCredentials();
  if (!creds.ok) {
    throw new Error(creds.error);
  }

  const url = `${TWITTER_API_BASE}/2/tweets`;
  const method = "POST";
  const body = JSON.stringify({ text });
  const bodyParams = { text }; // for OAuth signature

  const authHeader = await buildAuthHeader(method, url, bodyParams);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let detail = errorBody;
    try {
      const parsed = JSON.parse(errorBody) as TwitterError;
      detail = parsed.detail || parsed.title || errorBody;
    } catch {
      // keep raw body
    }

    // Rate limit detection
    if (response.status === 429) {
      const resetTime = response.headers.get("x-rate-limit-reset");
      const resetDate = resetTime
        ? new Date(Number(resetTime) * 1000).toISOString()
        : "unknown";
      throw new Error(
        `Twitter rate limit exceeded. Resets at ${resetDate}. Detail: ${detail}`,
      );
    }

    throw new Error(
      `Twitter API error (${response.status}): ${detail}`,
    );
  }

  const data = (await response.json()) as { data: Tweet };
  return {
    tweetId: data.data.id,
    text: data.data.text,
  };
}

/**
 * GET a tweet by ID to verify it was posted correctly.
 * Uses Bearer token (if available) or OAuth 1.0a.
 */
export async function getTweet(tweetId: string): Promise<Tweet> {
  const url = `${TWITTER_API_BASE}/2/tweets/${tweetId}`;

  // Bearer token is simpler when available
  if (config.TWITTER_BEARER_TOKEN) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.TWITTER_BEARER_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Twitter GET error (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as { data: Tweet };
    return data.data;
  }

  // Fallback to OAuth 1.0a
  const creds = checkCredentials();
  if (!creds.ok) {
    throw new Error(
      `Cannot verify tweet: ${creds.error}. Set TWITTER_BEARER_TOKEN or OAuth 1.0a credentials.`,
    );
  }

  const method = "GET";
  const authHeader = await buildAuthHeader(method, url);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Twitter GET error (${response.status}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as { data: Tweet };
  return data.data;
}

/**
 * Check if Twitter credentials are configured and valid.
 * Makes a lightweight verification call.
 */
export async function verifyCredentials(): Promise<{
  ok: boolean;
  error?: string;
  account?: string;
}> {
  const creds = checkCredentials();
  if (!creds.ok) {
    return { ok: false, error: creds.error };
  }

  try {
    // Use GET /2/users/me with OAuth 1.0a
    const url = `${TWITTER_API_BASE}/2/users/me`;
    const method = "GET";
    const authHeader = await buildAuthHeader(method, url);

    const response = await fetch(url, {
      method,
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { ok: false, error: `Credentials invalid: ${errorBody}` };
    }

    const data = (await response.json()) as {
      data: { id: string; username: string; name: string };
    };
    return {
      ok: true,
      account: `@${data.data.username} (${data.data.name})`,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
