import { describe, expect, it } from 'vitest';
import {
  assertAnthropicResponseComplete,
  configureAnthropicResponse,
  supportsAnthropicStructuredOutput,
  type JsonSchemaDefinition,
} from '../anthropic-response';

const responseSchema: JsonSchemaDefinition = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    explanation: { type: 'string' },
  },
  required: ['query', 'explanation'],
  additionalProperties: false,
};

describe('configureAnthropicResponse', () => {
  it('uses output_config.format for schema-backed JSON', () => {
    const payload: Record<string, unknown> = {};

    configureAnthropicResponse(payload, {
      model: 'claude-sonnet-5',
      responseFormat: 'json',
      responseSchema,
      systemInstruction: 'Generate a detection query.',
    });

    expect(payload).toEqual({
      output_config: {
        format: {
          type: 'json_schema',
          schema: responseSchema,
        },
      },
      system: 'Generate a detection query.',
    });
  });

  it('keeps the prompt-only fallback when no schema is supplied', () => {
    const payload: Record<string, unknown> = {};

    configureAnthropicResponse(payload, {
      model: 'claude-sonnet-5',
      responseFormat: 'json',
      systemInstruction: 'Generate a detection query.',
    });

    expect(payload.output_config).toBeUndefined();
    expect(payload.system).toContain('Your entire response must be parseable by JSON.parse().');
    expect(payload.system).toContain('Generate a detection query.');
  });

  it('leaves text responses unconstrained', () => {
    const payload: Record<string, unknown> = {};

    configureAnthropicResponse(payload, {
      model: 'claude-sonnet-5',
      responseFormat: 'text',
      systemInstruction: 'Answer concisely.',
    });

    expect(payload).toEqual({ system: 'Answer concisely.' });
  });

  it('uses the prompt-only fallback for Claude models without structured-output support', () => {
    const payload: Record<string, unknown> = {};

    configureAnthropicResponse(payload, {
      model: 'claude-3-opus-20240229',
      responseFormat: 'json',
      responseSchema,
    });

    expect(payload.output_config).toBeUndefined();
    expect(payload.system).toContain('Your entire response must be parseable by JSON.parse().');
  });
});

describe('supportsAnthropicStructuredOutput', () => {
  it.each([
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-5',
    'claude-sonnet-5',
  ])('accepts supported model %s', (model) => {
    expect(supportsAnthropicStructuredOutput(model)).toBe(true);
  });

  it.each(['claude-3-opus-20240229', 'claude-sonnet-4-4', 'not-a-claude-model'])(
    'rejects unsupported model %s',
    (model) => {
      expect(supportsAnthropicStructuredOutput(model)).toBe(false);
    },
  );
});

describe('assertAnthropicResponseComplete', () => {
  it.each([undefined, null, 'end_turn', 'tool_use'])('accepts stop reason %s', (stopReason) => {
    expect(() => assertAnthropicResponseComplete({ stop_reason: stopReason })).not.toThrow();
  });

  it('rejects output-token truncation', () => {
    expect(() => assertAnthropicResponseComplete({ stop_reason: 'max_tokens' }))
      .toThrow('output token limit');
  });

  it('rejects context-window truncation', () => {
    expect(() => assertAnthropicResponseComplete({ stop_reason: 'model_context_window_exceeded' }))
      .toThrow('model context window');
  });

  it('surfaces refusal categories', () => {
    expect(() => assertAnthropicResponseComplete({
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
    })).toThrow('Anthropic refused the request (cyber)');
  });
});
