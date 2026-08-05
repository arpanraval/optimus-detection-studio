import { describe, expect, it } from 'vitest';
import { ROLE_CONFIG } from '../llm/model-routing';
import { shouldUseAnthropicStream } from '../llm/anthropic-raw';

describe('threat-research runtime regression guards', () => {
  it('keeps research breadth and per-behaviour depth in separate bounded roles', () => {
    expect(ROLE_CONFIG).not.toHaveProperty('DOSSIER');
    expect(ROLE_CONFIG.RESEARCH).toMatchObject({
      timeoutMs: 110_000,
      maxTokens: 6_144,
    });
    expect(ROLE_CONFIG.ATTACK).toMatchObject({
      timeoutMs: 180_000,
      maxTokens: 8_192,
    });
  });

  it('keeps streaming off unless a caller explicitly opts into auto mode', () => {
    expect(shouldUseAnthropicStream(undefined, 16_384)).toBe(false);
    expect(shouldUseAnthropicStream('off', 32_768)).toBe(false);
    expect(shouldUseAnthropicStream('auto', 16_000)).toBe(false);
    expect(shouldUseAnthropicStream('auto', 16_384)).toBe(true);
  });
});
