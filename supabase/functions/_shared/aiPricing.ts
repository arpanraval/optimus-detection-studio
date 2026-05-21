// supabase/functions/_shared/aiPricing.ts
// Server-side pricing table for GenAI Cost Center cost calculation.
// Hardcoded per project decision (see docs/plans/2026-04-28-genai-cost-center-design.md §8).
// Update on provider rate changes; verify rates against provider docs at edit time.

export interface ModelRate {
  provider: 'google' | 'openai' | 'anthropic';
  inputPerMtoken: number;
  outputPerMtoken: number;
  cachedInputPerMtoken?: number;
  /** Per-MTok cost for tokens written to the prompt cache. Anthropic charges
   *  1.25x the normal input rate for 5-minute TTL cache writes (2x for the
   *  1-hour tier — not used here). When omitted, calculateCostUsd defaults
   *  to 1.25 × inputPerMtoken on a provider-by-provider basis below. */
  cacheCreationPerMtoken?: number;
  imagePerUnit?: number;
}

export interface TokenUsage {
  /** Uncached input tokens billed at the normal rate. Anthropic's API
   *  reports this as `input_tokens`; cache hits and writes are reported
   *  separately and are NOT included here (unlike the pre-cache era where
   *  `inputTokens` was the full input). */
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from the prompt cache. Billed at cachedInputPerMtoken
   *  (Anthropic: 0.1x normal). Absent when cache is off or this is the
   *  first call in a TTL window. */
  cachedInputTokens?: number;
  /** Tokens written to the prompt cache on THIS call. Billed at
   *  cacheCreationPerMtoken (Anthropic: 1.25x normal for 5m TTL). Absent
   *  on subsequent calls in the TTL window (the prefix is already cached;
   *  Anthropic returns 0 here and counts the same tokens as cached). */
  cacheCreationInputTokens?: number;
  imageCount?: number;
}

export const MODEL_PRICING: Record<string, ModelRate> = {
  // Google Gemini (LLM)
  'gemini-3.1-pro-preview':         { provider: 'google',    inputPerMtoken: 1.25,  outputPerMtoken: 5.00,  cachedInputPerMtoken: 0.31 },
  'gemini-3-flash-preview':         { provider: 'google',    inputPerMtoken: 0.075, outputPerMtoken: 0.30,  cachedInputPerMtoken: 0.019 },
  'gemini-3.1-flash-lite-preview':  { provider: 'google',    inputPerMtoken: 0.04,  outputPerMtoken: 0.15,  cachedInputPerMtoken: 0.01 },
  'gemini-3-pro-image-preview':     { provider: 'google',    inputPerMtoken: 0,     outputPerMtoken: 0,     imagePerUnit: 0.04 },
  'gemini-2.0-flash':               { provider: 'google',    inputPerMtoken: 0.10,  outputPerMtoken: 0.40 },
  // OpenAI
  'gpt-5.4':                        { provider: 'openai',    inputPerMtoken: 5.00,  outputPerMtoken: 20.00, cachedInputPerMtoken: 1.25 },
  'gpt-5.4-mini':                   { provider: 'openai',    inputPerMtoken: 0.30,  outputPerMtoken: 1.20,  cachedInputPerMtoken: 0.075 },
  'gpt-5.4-nano':                   { provider: 'openai',    inputPerMtoken: 0.10,  outputPerMtoken: 0.40,  cachedInputPerMtoken: 0.025 },
  // Anthropic — current generation (per https://platform.claude.com/docs/en/about-claude/models/overview)
  // Cache write at 1.25x input (5m TTL); read at 0.1x input.
  'claude-opus-4-7':                { provider: 'anthropic', inputPerMtoken: 5.00,  outputPerMtoken: 25.00, cachedInputPerMtoken: 0.50, cacheCreationPerMtoken: 6.25 },
  'claude-sonnet-4-6':              { provider: 'anthropic', inputPerMtoken: 3.00,  outputPerMtoken: 15.00, cachedInputPerMtoken: 0.30, cacheCreationPerMtoken: 3.75 },
  'claude-haiku-4-5':               { provider: 'anthropic', inputPerMtoken: 1.00,  outputPerMtoken: 5.00,  cachedInputPerMtoken: 0.10, cacheCreationPerMtoken: 1.25 },
  // Aliased dated IDs (Anthropic resolves these to the same model — surface
  // them in the table so telemetry attribution works whichever ID a caller used).
  'claude-haiku-4-5-20251001':      { provider: 'anthropic', inputPerMtoken: 1.00,  outputPerMtoken: 5.00,  cachedInputPerMtoken: 0.10, cacheCreationPerMtoken: 1.25 },
  // Legacy / deprecated; kept for back-compat with existing telemetry rows.
  'claude-opus-4-6':                { provider: 'anthropic', inputPerMtoken: 15.00, outputPerMtoken: 75.00, cachedInputPerMtoken: 1.50, cacheCreationPerMtoken: 18.75 },
  // Embeddings (Google)
  'text-embedding-004':             { provider: 'google',    inputPerMtoken: 0.025, outputPerMtoken: 0 },
  'gemini-embedding-001':           { provider: 'google',    inputPerMtoken: 0.025, outputPerMtoken: 0 },
};

/**
 * Cost in USD for a single AI call.
 *
 * Token bucket accounting:
 *   - `inputTokens` from the provider response is UNCACHED input (after the
 *     prompt-cache split, both cache reads and cache writes are reported
 *     separately and NOT included in `input_tokens` for Anthropic).
 *   - Cache reads (`cachedInputTokens`) billed at cachedInputPerMtoken
 *     (~0.1x normal for Anthropic).
 *   - Cache writes (`cacheCreationInputTokens`) billed at cacheCreationPerMtoken
 *     (~1.25x normal for Anthropic 5m TTL). When the rate is missing, default
 *     to 1.25 × inputPerMtoken — matches Anthropic; will over-estimate for
 *     providers with different cache-write multipliers (none in the table today).
 *   - Output tokens billed at output rate. Image generation billed per image.
 *
 * Unknown models return 0 (caller logs a warning at call site).
 */
export function calculateCostUsd(model: string, usage: TokenUsage): number {
  const rate = MODEL_PRICING[model];
  if (!rate) return 0;
  const M = 1_000_000;
  const cached = usage.cachedInputTokens ?? 0;
  const cacheWrite = usage.cacheCreationInputTokens ?? 0;
  const cacheWriteRate = rate.cacheCreationPerMtoken ?? rate.inputPerMtoken * 1.25;
  return (
    (usage.inputTokens * rate.inputPerMtoken) / M +
    (cached * (rate.cachedInputPerMtoken ?? rate.inputPerMtoken)) / M +
    (cacheWrite * cacheWriteRate) / M +
    (usage.outputTokens * rate.outputPerMtoken) / M +
    ((usage.imageCount ?? 0) * (rate.imagePerUnit ?? 0))
  );
}
