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
});
