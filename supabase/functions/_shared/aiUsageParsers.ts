// supabase/functions/_shared/aiUsageParsers.ts
// Pure parsers extracting token usage from each provider's response body.
// Field paths match what supabase/functions/ai-generate/index.ts already parses
// for response text/tool calls — verified during T4 implementation.
// Wired up by withAiTelemetry (see _shared/aiTelemetry.ts) and per-function
// adopters (T6 onwards).

import type { TokenUsage } from './aiPricing.ts';

/**
 * Google Gemini chat/completion response.
 *   data.usageMetadata.promptTokenCount
 *   data.usageMetadata.candidatesTokenCount
 *   data.usageMetadata.cachedContentTokenCount  (optional, when prompt caching is used)
 */
export function parseGeminiUsage(body: any): TokenUsage {
  const md = body?.usageMetadata ?? {};
  return {
    inputTokens:        Number(md.promptTokenCount ?? 0),
    outputTokens:       Number(md.candidatesTokenCount ?? 0),
    cachedInputTokens:  Number(md.cachedContentTokenCount ?? 0),
  };
}

/**
 * Google Gemini embedding response (embedContent / batchEmbedContents).
 * Single embed: data.usageMetadata.totalTokenCount
 * Batch embed: same field at the top-level response (when present).
 */
export function parseGeminiEmbeddingUsage(body: any): TokenUsage {
  const md = body?.usageMetadata ?? {};
  const total = Number(md.totalTokenCount ?? body?.totalTokens ?? 0);
  return {
    inputTokens:  total,
    outputTokens: 0,
  };
}

/**
 * OpenAI chat completions response.
 *   data.usage.prompt_tokens
 *   data.usage.completion_tokens
 *   data.usage.prompt_tokens_details.cached_tokens  (optional)
 */
export function parseOpenAIUsage(body: any): TokenUsage {
  const u = body?.usage ?? {};
  return {
    inputTokens:        Number(u.prompt_tokens ?? 0),
    outputTokens:       Number(u.completion_tokens ?? 0),
    cachedInputTokens:  Number(u.prompt_tokens_details?.cached_tokens ?? 0),
  };
}

/**
 * Anthropic messages response.
 *   data.usage.input_tokens
 *   data.usage.output_tokens
 *   data.usage.cache_read_input_tokens   (optional, when prompt caching is used)
 */
export function parseAnthropicUsage(body: any): TokenUsage {
  const u = body?.usage ?? {};
  return {
    inputTokens:        Number(u.input_tokens ?? 0),
    outputTokens:       Number(u.output_tokens ?? 0),
    cachedInputTokens:  Number(u.cache_read_input_tokens ?? 0),
  };
}
