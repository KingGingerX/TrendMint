/**
 * Tweet generator — takes a product and creates engaging tweet copy via Anthropic.
 *
 * Validates every output:
 *   - Character count ≤ 280
 *   - Affiliate link is present
 *   - FTC disclosure (#ad) is present
 */

import { getAnthropicClient } from "./anthropic-client";

/** Input product shape (subset of DB columns used for generation). */
export interface ProductForGeneration {
  title: string;
  price: number | null;
  category: string | null;
  image_url: string | null;
  affiliate_link: string | null;
  features?: string; // optional, bullet points / description
}

export interface GeneratedTweet {
  text: string;
  characterCount: number;
  hasAffiliateLink: boolean;
  hasDisclosure: boolean;
  modelUsed: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface GenerationError {
  error: string;
  productTitle: string;
}

// Approximate length reserved for t.co-wrapped URLs
const TCO_LENGTH = 23;

// System prompt sent to the model — instructs varied, engaging, FTC-compliant copy
function buildSystemPrompt(): string {
  return [
    "You are a social media copywriter for an affiliate marketing account.",
    "Your job: write a single tweet (≤280 characters total) promoting a product.",
    "",
    "RULES:",
    "- Write a unique, engaging hook — do NOT copy product-page descriptions.",
    "- Highlight ONE key benefit or feature that makes the product compelling.",
    "- Include the affiliate link placeholder exactly as: {{AFFILIATE_LINK}}",
    "- End with \"#ad\" for FTC compliance.",
    "- Vary your tone each time: casual, excited, problem-solution, curiosity gap, relatable, etc.",
    "- Use emojis sparingly (0-2 max). Never use ALL CAPS for entire sentences.",
    "- Never use spammy patterns: no \"CLICK HERE\", no \"BUY NOW\", no excessive punctuation!!!",
    "- The ENTIRE tweet (including the link and #ad) MUST fit in 280 characters.",
    "",
    "The {{AFFILIATE_LINK}} placeholder will be replaced with a real URL (~23 chars).",
    "Count it as 23 characters in your planning.",
  ].join("\n");
}

function buildUserPrompt(product: ProductForGeneration): string {
  const parts: string[] = [
    `Product: ${product.title}`,
  ];

  if (product.price) {
    parts.push(`Price: $${product.price.toFixed(2)}`);
  }

  if (product.category) {
    parts.push(`Category: ${product.category}`);
  }

  if (product.features) {
    parts.push(`Key features: ${product.features}`);
  }

  parts.push("\nWrite one tweet promoting this product. Include {{AFFILIATE_LINK}} and end with #ad.");

  return parts.join("\n");
}

/**
 * Generate a single tweet for a product.
 * Returns a structured result — never throws.
 */
export async function generateTweet(
  product: ProductForGeneration,
): Promise<{ tweet?: GeneratedTweet; error?: GenerationError }> {
  const client = getAnthropicClient();

  if (!client.isConfigured()) {
    return {
      error: {
        error: "ANTHROPIC_API_KEY is not configured",
        productTitle: product.title,
      },
    };
  }

  if (!product.affiliate_link) {
    return {
      error: {
        error: "Product has no affiliate link — cannot generate tweet",
        productTitle: product.title,
      },
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(product);

  const result = await client.generateChatCompletion(systemPrompt, userPrompt, {
    max_tokens: 200,
  });

  if (result.error || !result.response) {
    return {
      error: {
        error: result.error?.error ?? "Unknown Anthropic error",
        productTitle: product.title,
      },
    };
  }

  const rawContent = result.response.content;

  // Keep {{AFFILIATE_LINK}} placeholder — the service layer will replace it
  // with a tracked redirect URL after obtaining the post ID.
  const tweetText = rawContent;

  // Validation
  const characterCount = tweetText.length;
  const hasAffiliateLink =
    /\{\{AFFILIATE_LINK\}\}/i.test(tweetText) ||
    tweetText.includes(product.affiliate_link!);
  const hasDisclosure = /#ad\b/i.test(tweetText);

  const tweet: GeneratedTweet = {
    text: tweetText,
    characterCount,
    hasAffiliateLink,
    hasDisclosure,
    modelUsed: result.response.model,
    usage: result.response.usage,
  };

  // Non-fatal warnings — return the tweet but note issues
  if (characterCount > 280) {
    console.warn(
      `⚠️ Generated tweet for "${product.title.slice(0, 40)}" is ${characterCount} chars (max 280)`,
    );
  }

  if (!hasAffiliateLink) {
    console.warn(
      `⚠️ Generated tweet for "${product.title.slice(0, 40)}" is missing the affiliate link`,
    );
  }

  if (!hasDisclosure) {
    console.warn(
      `⚠️ Generated tweet for "${product.title.slice(0, 40)}" is missing #ad disclosure`,
    );
  }

  return { tweet };
}

/**
 * Generate tweets for multiple products in parallel.
 * Respects a concurrency limit to avoid rate-limiting Anthropic.
 */
export async function generateTweetsBatch(
  products: ProductForGeneration[],
  concurrency: number = 3,
): Promise<{
  tweets: GeneratedTweet[];
  errors: GenerationError[];
  totalTokensUsed: number;
}> {
  const tweets: GeneratedTweet[] = [];
  const errors: GenerationError[] = [];
  let totalTokensUsed = 0;

  // Process in chunks to limit concurrency
  for (let i = 0; i < products.length; i += concurrency) {
    const chunk = products.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((p) => generateTweet(p)),
    );

    for (const result of results) {
      if (result.tweet) {
        tweets.push(result.tweet);
        totalTokensUsed += result.tweet.usage.totalTokens;
      }
      if (result.error) {
        errors.push(result.error);
      }
    }
  }

  return { tweets, errors, totalTokensUsed };
}
