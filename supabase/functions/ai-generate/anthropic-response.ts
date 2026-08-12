export type JsonSchemaDefinition = Record<string, unknown>;

interface ConfigureAnthropicResponseOptions {
  model: string;
  responseFormat: 'json' | 'text';
  responseSchema?: JsonSchemaDefinition;
  systemInstruction?: string;
}

const JSON_ONLY_DIRECTIVE =
  'Respond with a single valid JSON object only. Do not include prose, explanations, markdown, or code fences ' +
  'before or after the JSON. Your entire response must be parseable by JSON.parse().';

export function supportsAnthropicStructuredOutput(model: string): boolean {
  const version = model.match(/^claude-[a-z]+-(\d+)(?:-(\d+))?(?:-|$)/);
  if (!version) return false;

  const major = Number(version[1]);
  const minor = Number(version[2] ?? 0);
  return major > 4 || (major === 4 && minor >= 5);
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
  const { model, responseFormat, responseSchema, systemInstruction } = options;
  const usesStructuredOutput = responseFormat === 'json'
    && responseSchema !== undefined
    && supportsAnthropicStructuredOutput(model);

  if (usesStructuredOutput) {
    payload.output_config = {
      format: {
        type: 'json_schema',
        schema: responseSchema,
      },
    };
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

interface AnthropicStopResponse {
  stop_reason?: string | null;
  stop_details?: {
    category?: string;
  } | null;
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
