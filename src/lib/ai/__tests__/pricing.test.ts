import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODEL_PRICING, calculateCostUsd } from '../pricing';

describe('AI pricing files', () => {
  it('TS and Deno mirror have identical model rates', () => {
    const denoSource = readFileSync(
      resolve(__dirname, '../../../../supabase/functions/_shared/aiPricing.ts'),
      'utf-8'
    );
    const match = denoSource.match(/export const MODEL_PRICING[^=]*=\s*({[\s\S]*?^});/m);
    expect(match, 'Deno file must export MODEL_PRICING object literal').toBeTruthy();
    const denoLiteral = match![1];
    // eslint-disable-next-line no-new-func
    const denoPricing = new Function(`return (${denoLiteral});`)();
    expect(denoPricing).toEqual(MODEL_PRICING);
  });

  it('every entry has provider and rate fields', () => {
    for (const [model, rate] of Object.entries(MODEL_PRICING)) {
      expect(rate.provider, `${model} missing provider`).toMatch(/^(google|openai|anthropic)$/);
      expect(typeof rate.inputPerMtoken).toBe('number');
      expect(typeof rate.outputPerMtoken).toBe('number');
    }
  });

  describe('calculateCostUsd', () => {
    it('zero usage = zero cost', () => {
      expect(calculateCostUsd('gemini-3.1-pro-preview', { inputTokens: 0, outputTokens: 0 })).toBe(0);
    });
    it('charges output tokens at output rate', () => {
      const c = calculateCostUsd('claude-haiku-4-5', { inputTokens: 0, outputTokens: 1_000_000 });
      expect(c).toBeCloseTo(4.00, 6);
    });
    it('cached tokens billed at cached rate, not full input rate', () => {
      const c = calculateCostUsd('claude-opus-4-6', { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 });
      expect(c).toBeCloseTo(1.50, 6);
    });
    it('unknown model returns 0 (does not throw)', () => {
      expect(calculateCostUsd('not-a-model', { inputTokens: 100, outputTokens: 100 })).toBe(0);
    });
    it('image generation: charges per image', () => {
      const c = calculateCostUsd('gemini-3-pro-image-preview', { inputTokens: 0, outputTokens: 0, imageCount: 5 });
      expect(c).toBeCloseTo(0.20, 6);
    });
  });
});
