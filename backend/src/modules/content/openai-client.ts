/**
 * OpenAI Chat Completions API client — lightweight wrapper around fetch.
 *
 * - Uses gpt-4o-mini to keep costs near zero (~$0.00007 per tweet)
 * - Retries on 429 (rate limit) and 5xx errors (max 2 retries)
 * - Never crashes — returns structured error on failure
 * - Auth via OPENAI_API_KEY from environment
 */

import { config } from "../../config";

const OPENAI_BASE = "https://api.openai.com/v1";
const MODEL = "gpt-4o-mini";
const MAX_RETRIES = 2;

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIRequest {
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface OpenAIError {
  error: string;
  status?: number;
  retriesExhausted: boolean;
}

export class OpenAIClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? config.OPENAI_API_KEY;
  }

  /** Check whether the client has usable credentials. */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Send a chat completion request with automatic retries.
   * Returns either a successful response or a structured error — never throws.
   */
  async chatCompletion(
    request: OpenAIRequest,
  ): Promise<{ response?: OpenAIResponse; error?: OpenAIError }> {
    if (!this.isConfigured()) {
      return {
        error: {
          error: "OPENAI_API_KEY is not set. Add it to your .env file.",
          retriesExhausted: false,
        },
      };
    }

    let lastError: OpenAIError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: request.messages,
            temperature: request.temperature ?? 0.9,
            max_tokens: request.max_tokens ?? 150,
          }),
        });

        // Success — parse and return
        if (res.ok) {
          const data = (await res.json()) as {
            choices: { message: { content: string } }[];
            model: string;
            usage: {
              prompt_tokens: number;
              completion_tokens: number;
              total_tokens: number;
            };
          };

          const content = data.choices[0]?.message?.content?.trim() ?? "";

          return {
            response: {
              content,
              model: data.model,
              usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
              },
            },
          };
        }

        // Retryable errors: 429 (rate limit) and 5xx (server errors)
        const status = res.status;
        if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
          const retryDelay = Math.pow(2, attempt) * 1000; // 1s, 2s
          console.warn(
            `⚠️ OpenAI API returned ${status}, retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(retryDelay);
          continue;
        }

        // Non-retryable error
        const errorBody = await res.text();
        return {
          error: {
            error: `OpenAI API error (${status}): ${errorBody.slice(0, 300)}`,
            status,
            retriesExhausted: true,
          },
        };
      } catch (err) {
        lastError = {
          error: `Network error: ${String(err).slice(0, 300)}`,
          retriesExhausted: attempt >= MAX_RETRIES,
        };

        if (attempt < MAX_RETRIES) {
          const retryDelay = Math.pow(2, attempt) * 1000;
          console.warn(
            `⚠️ OpenAI request failed, retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(retryDelay);
        }
      }
    }

    return { error: lastError };
  }
}

/** Singleton — created on first use. */
let _client: OpenAIClient | null = null;

export function getOpenAIClient(): OpenAIClient {
  if (!_client) {
    _client = new OpenAIClient();
  }
  return _client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
