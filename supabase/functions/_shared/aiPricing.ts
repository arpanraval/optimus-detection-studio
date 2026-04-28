// supabase/functions/_shared/aiPricing.ts — Deno mirror of src/lib/ai/pricing.ts.
// MUST stay in sync; src/lib/ai/__tests__/pricing.test.ts asserts identity.

export interface ModelRate {
  provider: 'google' | 'openai' | 'anthropic';
  inputPerMtoken: number;
  outputPerMtoken: number;
  cachedInputPerMtoken?: number;
  imagePerUnit?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  imageCount?: number;
}

export const MODEL_PRICING: Record<string, ModelRate> = {
  'gemini-3.1-pro-preview':         { provider: 'google',    inputPerMtoken: 1.25,  outputPerMtoken: 5.00,  cachedInputPerMtoken: 0.31 },
  'gemini-3-flash-preview':         { provider: 'google',    inputPerMtoken: 0.075, outputPerMtoken: 0.30,  cachedInputPerMtoken: 0.019 },
  'gemini-3.1-flash-lite-preview':  { provider: 'google',    inputPerMtoken: 0.04,  outputPerMtoken: 0.15,  cachedInputPerMtoken: 0.01 },
  'gemini-3-pro-image-preview':     { provider: 'google',    inputPerMtoken: 0,     outputPerMtoken: 0,     imagePerUnit: 0.04 },
  'gpt-5.4':                        { provider: 'openai',    inputPerMtoken: 5.00,  outputPerMtoken: 20.00, cachedInputPerMtoken: 1.25 },
  'gpt-5.4-mini':                   { provider: 'openai',    inputPerMtoken: 0.30,  outputPerMtoken: 1.20,  cachedInputPerMtoken: 0.075 },
  'gpt-5.4-nano':                   { provider: 'openai',    inputPerMtoken: 0.10,  outputPerMtoken: 0.40,  cachedInputPerMtoken: 0.025 },
  'claude-opus-4-6':                { provider: 'anthropic', inputPerMtoken: 15.00, outputPerMtoken: 75.00, cachedInputPerMtoken: 1.50 },
  'claude-sonnet-4-6':              { provider: 'anthropic', inputPerMtoken: 3.00,  outputPerMtoken: 15.00, cachedInputPerMtoken: 0.30 },
  'claude-haiku-4-5':               { provider: 'anthropic', inputPerMtoken: 0.80,  outputPerMtoken: 4.00,  cachedInputPerMtoken: 0.08 },
  'text-embedding-004':             { provider: 'google',    inputPerMtoken: 0.025, outputPerMtoken: 0 },
};

export function calculateCostUsd(model: string, usage: TokenUsage): number {
  const rate = MODEL_PRICING[model];
  if (!rate) return 0;
  const M = 1_000_000;
  const cached = usage.cachedInputTokens ?? 0;
  return (
    ((usage.inputTokens - cached) * rate.inputPerMtoken) / M +
    (cached * (rate.cachedInputPerMtoken ?? rate.inputPerMtoken)) / M +
    (usage.outputTokens * rate.outputPerMtoken) / M +
    ((usage.imageCount ?? 0) * (rate.imagePerUnit ?? 0))
  );
}
