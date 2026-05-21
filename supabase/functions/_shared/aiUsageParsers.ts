// supabase/functions/_shared/aiUsageParsers.ts
// Pure parsers extracting token usage from each provider's response body.
// Field paths match what supabase/functions/ai-generate/index.ts already parses
// for response text/tool calls — verified during T4 implementation.
// Wired up by withAiTelemetry (see _shared/aiTelemetry.ts) and per-function
// adopters (T6 onwards).
//
// SEMANTIC CONTRACT (post-prompt-caching era):
//   TokenUsage.inputTokens     = uncached input tokens (billed at full rate)
//   TokenUsage.cachedInputTokens = tokens read from cache (billed at cached rate)
//   TokenUsage.cacheCreationInputTokens = tokens written to cache (billed at write rate)
//
// Providers use different conventions in their response shapes — these parsers
// normalize all three buckets so downstream consumers (cost calc, telemetry,
// dashboards) can treat them as disjoint without provider-specific math.

import type { TokenUsage } from './aiPricing.ts';

/**
 * Google Gemini chat/completion response.
 *   data.usageMetadata.promptTokenCount         (TOTAL prompt incl. cached)
 *   data.usageMetadata.candidatesTokenCount     (output)
 *   data.usageMetadata.cachedContentTokenCount  (cache reads, subset of promptTokenCount)
 *
 * Gemini's promptTokenCount includes cached tokens (cached is a subset).
 * Normalize to disjoint buckets so the cost calc doesn't need to subtract.
 */
export function parseGeminiUsage(body: any): TokenUsage {
  const md = body?.usageMetadata ?? {};
  const totalPrompt = Number(md.promptTokenCount ?? 0);
  const cached = Number(md.cachedContentTokenCount ?? 0);
  return {
    inputTokens:        Math.max(0, totalPrompt - cached),
    outputTokens:       Number(md.candidatesTokenCount ?? 0),
    cachedInputTokens:  cached,
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
 *   data.usage.prompt_tokens                          (TOTAL prompt incl. cached)
 *   data.usage.completion_tokens                      (output)
 *   data.usage.prompt_tokens_details.cached_tokens    (cache reads, subset of prompt_tokens)
 *
 * OpenAI's prompt_tokens INCLUDES cached_tokens (cached is a subset). Normalize
 * to disjoint buckets — see SEMANTIC CONTRACT above.
 */
export function parseOpenAIUsage(body: any): TokenUsage {
  const u = body?.usage ?? {};
  const totalPrompt = Number(u.prompt_tokens ?? 0);
  const cached = Number(u.prompt_tokens_details?.cached_tokens ?? 0);
  return {
    inputTokens:        Math.max(0, totalPrompt - cached),
    outputTokens:       Number(u.completion_tokens ?? 0),
    cachedInputTokens:  cached,
  };
}

/**
 * Anthropic messages response.
 *   data.usage.input_tokens                  (uncached input — already disjoint)
 *   data.usage.output_tokens                 (output)
 *   data.usage.cache_read_input_tokens       (cache reads — disjoint)
 *   data.usage.cache_creation_input_tokens   (cache writes — disjoint, new on this call)
 *
 * Anthropic reports the three input buckets as disjoint counts (unlike OpenAI/
 * Gemini). No normalization needed; just rename fields.
 */
export function parseAnthropicUsage(body: any): TokenUsage {
  const u = body?.usage ?? {};
  return {
    inputTokens:               Number(u.input_tokens ?? 0),
    outputTokens:              Number(u.output_tokens ?? 0),
    cachedInputTokens:         Number(u.cache_read_input_tokens ?? 0),
    cacheCreationInputTokens:  Number(u.cache_creation_input_tokens ?? 0),
  };
}
