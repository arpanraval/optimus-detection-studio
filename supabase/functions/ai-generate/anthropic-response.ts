export type JsonSchemaDefinition = Record<string, unknown>;
export type AnthropicEffort = 'low' | 'medium' | 'high';

interface ConfigureAnthropicResponseOptions {
  model: string;
  responseFormat: 'json' | 'text';
  responseSchema?: JsonSchemaDefinition;
  systemInstruction?: string;
  effort?: AnthropicEffort;
}

const JSON_ONLY_DIRECTIVE =
  'Respond with a single valid JSON object only. Do not include prose, explanations, markdown, or code fences ' +
  'before or after the JSON. Your entire response must be parseable by JSON.parse().';

const COMPACT_RETRY_DIRECTIVE =
  'The previous response exhausted the output-token budget before completing. Return a compact complete answer now. ' +
  'Do not include research notes, reasoning, alternatives, or a long narrative. Preserve the executable detection logic, ' +
  'use only essential inline comments, and keep the explanation to 2-3 sentences.';

interface ClaudeModelVersion {
  family: string;
  major: number;
  minor: number;
}

function parseClaudeModelVersion(model: string): ClaudeModelVersion | null {
  const version = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-|$)/);
  if (!version) return null;

  return {
    family: version[1],
    major: Number(version[2]),
    minor: Number(version[3] ?? 0),
  };
}

export function supportsAnthropicStructuredOutput(model: string): boolean {
  const version = parseClaudeModelVersion(model);
  if (!version) return false;

  return version.major > 4 || (version.major === 4 && version.minor >= 5);
}

export function supportsAnthropicEffort(model: string): boolean {
  const version = parseClaudeModelVersion(model);
  if (!version) return false;
  if (version.major >= 5) return true;

  return version.major === 4
    && ((version.family === 'opus' && version.minor >= 5)
      || (version.family === 'sonnet' && version.minor >= 6));
}

/**
 * Configures Anthropic response formatting.
 *
 * Claude structured outputs use constrained decoding and are the reliable path
 * for schema-backed JSON. The prompt-only directive remains for callers that
 * request JSON without supplying a schema.
 */
export function configureAnthropicResponse(
  payload: Record<string, unknown>,
  options: ConfigureAnthropicResponseOptions,
): void {
  const { model, responseFormat, responseSchema, systemInstruction, effort } = options;
  const usesStructuredOutput = responseFormat === 'json'
    && responseSchema !== undefined
    && supportsAnthropicStructuredOutput(model);
  const outputConfig: Record<string, unknown> = {};

  if (usesStructuredOutput) {
    outputConfig.format = {
      type: 'json_schema',
      schema: responseSchema,
    };
  }

  if (effort && supportsAnthropicEffort(model)) {
    outputConfig.effort = effort;
  }

  if (Object.keys(outputConfig).length > 0) {
    payload.output_config = outputConfig;
  }

  const jsonDirective = responseFormat === 'json' && !usesStructuredOutput
    ? JSON_ONLY_DIRECTIVE
    : undefined;

  if (systemInstruction && jsonDirective) {
    payload.system = `${jsonDirective}\n\n${systemInstruction}`;
  } else if (jsonDirective) {
    payload.system = jsonDirective;
  } else if (systemInstruction) {
    payload.system = systemInstruction;
  }
}

export interface AnthropicStopResponse {
  stop_reason?: string | null;
  stop_details?: {
    category?: string;
  } | null;
}

export function shouldRetryAnthropicCompactly(
  data: AnthropicStopResponse,
  compactOnTruncation: boolean,
): boolean {
  return compactOnTruncation && data.stop_reason === 'max_tokens';
}

export function createCompactAnthropicRetryPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const outputConfig = typeof payload.output_config === 'object' && payload.output_config !== null
    ? { ...(payload.output_config as Record<string, unknown>), effort: 'low' }
    : { effort: 'low' };
  const systemInstruction = typeof payload.system === 'string' && payload.system.length > 0
    ? `${payload.system}\n\n${COMPACT_RETRY_DIRECTIVE}`
    : COMPACT_RETRY_DIRECTIVE;

  return {
    ...payload,
    output_config: outputConfig,
    system: systemInstruction,
  };
}

/**
 * Anthropic returns truncations and refusals as successful HTTP responses.
 * Surface them before the client attempts to parse incomplete/non-schema text.
 */
export function assertAnthropicResponseComplete(data: AnthropicStopResponse): void {
  switch (data.stop_reason) {
    case 'max_tokens':
      throw new Error('Anthropic response was truncated after reaching the output token limit');
    case 'model_context_window_exceeded':
      throw new Error('Anthropic response was truncated after reaching the model context window');
    case 'refusal': {
      const category = data.stop_details?.category;
      throw new Error(`Anthropic refused the request${category ? ` (${category})` : ''}`);
    }
  }
}
