/**
 * Anthropic Messages API client — lightweight wrapper around fetch.
 * Retries rate-limit and server errors, and returns structured errors.
 */

import { config } from "../../config";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-3-haiku-20240307";
const MAX_RETRIES = 2;

export interface AnthropicResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface AnthropicError {
  error: string;
  status?: number;
  retriesExhausted: boolean;
}

export class AnthropicClient {
  private apiKey: string;
  constructor(apiKey?: string) { this.apiKey = apiKey ?? config.ANTHROPIC_API_KEY; }
  isConfigured(): boolean { return this.apiKey.length > 0; }

  async generateChatCompletion(
    systemPrompt: string,
    userMessage: string,
    options: { max_tokens?: number } = {},
  ): Promise<{ response?: AnthropicResponse; error?: AnthropicError }> {
    if (!this.isConfigured()) {
      return { error: { error: "ANTHROPIC_API_KEY is not set. Add it to your .env file.", retriesExhausted: false } };
    }
    let lastError: AnthropicError | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: options.max_tokens ?? 200,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          }),
        });
        if (res.ok) {
          const data = await res.json() as {
            content?: { type: string; text?: string }[];
            model?: string;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          const promptTokens = data.usage?.input_tokens ?? 0;
          const completionTokens = data.usage?.output_tokens ?? 0;
          return { response: {
            content: data.content?.find((block) => block.type === "text")?.text?.trim() ?? "",
            model: data.model ?? MODEL,
            usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
          } };
        }
        const status = res.status;
        if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
          const delay = 2 ** attempt * 1000;
          console.warn(`Anthropic API returned ${status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }
        return { error: { error: `Anthropic API error (${status}): ${(await res.text()).slice(0, 300)}`, status, retriesExhausted: true } };
      } catch (err) {
        lastError = { error: `Network error: ${String(err).slice(0, 300)}`, retriesExhausted: attempt >= MAX_RETRIES };
        if (attempt < MAX_RETRIES) await sleep(2 ** attempt * 1000);
      }
    }
    return { error: lastError };
  }

  // Compatibility alias for callers using the client's original method shape.
  async chatCompletion(systemPrompt: string, userMessage: string, options?: { max_tokens?: number }) {
    return this.generateChatCompletion(systemPrompt, userMessage, options);
  }
}

let client: AnthropicClient | null = null;
export function getAnthropicClient(): AnthropicClient {
  if (!client) client = new AnthropicClient();
  return client;
}

export function generateChatCompletion(systemPrompt: string, userMessage: string, options?: { max_tokens?: number }) {
  return getAnthropicClient().generateChatCompletion(systemPrompt, userMessage, options);
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
