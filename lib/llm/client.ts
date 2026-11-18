/**
 * Minimal JSON-mode client for any OpenAI-compatible chat completions API.
 *
 * Defaults to DeepSeek (the provider the workers already use), so existing
 * `DEEPSEEK_*` env vars keep working. `LLM_BASE_URL` / `LLM_MODEL` /
 * `LLM_API_KEY` override them for any other compatible provider.
 * Uses plain fetch — no SDK dependency.
 */

import { fetchJson, type FetchJsonOptions } from "@/lib/evidence/http";
import { asString, isRecord } from "@/lib/evidence/text";

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

export type LlmConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function llmConfig(): LlmConfig | null {
  const apiKey = env("LLM_API_KEY") ?? env("DEEPSEEK_API_KEY");
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (
      env("LLM_BASE_URL") ??
      env("DEEPSEEK_BASE_URL") ??
      "https://api.deepseek.com/v1"
    ).replace(/\/$/, ""),
    model: env("LLM_MODEL") ?? env("DEEPSEEK_MODEL") ?? "deepseek-chat",
  };
}

export function isLlmConfigured(): boolean {
  return llmConfig() !== null;
}

export type ChatJsonRequest = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
};

/** A function that answers a chat request with parsed JSON. Injectable. */
export type ChatJson = (request: ChatJsonRequest) => Promise<unknown>;

/** Parse model output as JSON, tolerating a ```json fence around it. */
export function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    throw new LlmError("Model did not return valid JSON");
  }
}

/** Pull `choices[0].message.content` out of a chat completions body. */
export function completionContent(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    throw new LlmError("Unexpected response shape from the model API");
  }
  const [first] = body.choices;
  const content =
    isRecord(first) && isRecord(first.message)
      ? asString(first.message.content)
      : null;
  if (!content) throw new LlmError("The model returned an empty answer");
  return content;
}

export function createChatJson(
  config: LlmConfig,
  options: Pick<FetchJsonOptions, "fetchImpl" | "sleep"> = {},
): ChatJson {
  return async ({ system, user, maxTokens = 2_000, temperature = 0.2 }) => {
    const body = await fetchJson(`${config.baseUrl}/chat/completions`, {
      ...options,
      method: "POST",
      timeoutMs: 120_000,
      retries: 2,
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: {
        model: config.model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
    });
    return parseModelJson(completionContent(body));
  };
}

/** The configured client, or a clear error when no API key is set. */
export function defaultChatJson(): ChatJson {
  const config = llmConfig();
  if (!config) {
    throw new LlmError(
      "No LLM configured: set DEEPSEEK_API_KEY (or LLM_API_KEY + LLM_BASE_URL + LLM_MODEL).",
    );
  }
  return createChatJson(config);
}
