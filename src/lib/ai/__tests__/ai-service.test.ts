import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

vi.mock('../../logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { generateAIJSON, type AIJsonSchema } from '../../aiService';

describe('generateAIJSON', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('forwards a response schema to the ai-generate Edge Function', async () => {
    const responseSchema: AIJsonSchema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        explanation: { type: 'string' },
      },
      required: ['query', 'explanation'],
      additionalProperties: false,
    };
    invokeMock.mockResolvedValue({
      data: { text: '{"query":"search *","explanation":"test"}' },
      error: null,
    });

    const result = await generateAIJSON<{ query: string; explanation: string }>({
      prompt: 'Generate a detection.',
      model: 'claude-sonnet-5',
      responseSchema,
      feature: 'ai-query-gen',
    });

    expect(result).toEqual({ query: 'search *', explanation: 'test' });
    expect(invokeMock).toHaveBeenCalledWith('ai-generate', {
      body: {
        prompt: 'Generate a detection.',
        model: 'claude-sonnet-5',
        responseFormat: 'json',
        responseSchema,
        feature: 'ai-query-gen',
      },
    });
  });

  it('forwards Query Generator recovery controls and cancellation', async () => {
    const controller = new AbortController();
    invokeMock.mockResolvedValue({
      data: { text: JSON.stringify({ query: 'search *', explanation: 'test' }) },
      error: null,
    });

    await generateAIJSON<{ query: string; explanation: string }>({
      prompt: 'Generate a compact detection.',
      model: 'claude-opus-5',
      effort: 'medium',
      compactOnTruncation: true,
      signal: controller.signal,
      maxAttempts: 1,
      timeoutMs: 180_000,
      feature: 'ai-query-gen',
    });

    expect(invokeMock).toHaveBeenCalledWith('ai-generate', {
      body: {
        prompt: 'Generate a compact detection.',
        model: 'claude-opus-5',
        responseFormat: 'json',
        responseSchema: undefined,
        feature: 'ai-query-gen',
        effort: 'medium',
        compactOnTruncation: true,
      },
      signal: controller.signal,
    });
  });

  it('does not repeat a server-recovered request when maxAttempts is one', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error('Edge Function returned a non-2xx status code'),
    });

    await expect(generateAIJSON({
      prompt: 'Generate a compact detection.',
      model: 'claude-opus-5',
      compactOnTruncation: true,
      maxAttempts: 1,
      feature: 'ai-query-gen',
    })).rejects.toThrow('non-2xx');

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
