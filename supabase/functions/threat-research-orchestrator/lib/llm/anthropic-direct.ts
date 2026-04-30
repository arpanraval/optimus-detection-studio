// supabase/functions/threat-research-orchestrator/lib/llm/anthropic-direct.ts
//
// Direct Anthropic Messages API caller for the Threat Research orchestrator.
//
// Why direct (not via ai-generate)?
// `ai-generate`'s Anthropic path strips `tool_use.id` when normalising into its
// generic `functionCalls` shape, so the round-trip (assistant tool_use ▶ client
// runs tool ▶ user tool_result with matching tool_use_id) is structurally
// broken for callers that go through it. Anthropic returns 400 with
// "tool_use ids were found without tool_result blocks immediately after".
//
// We don't modify ai-generate (spec hard non-goal). Instead this adapter calls
// Anthropic directly, preserving every tool_use id end-to-end. It still feeds
// the AI Cost Center via `withAiTelemetry` — same telemetry rows, same budget
// enforcement, same Cost Center grouping.
//
// Tool declarations are accepted in Gemini format (matching the rest of the
// codebase's tool-declaration style) and converted to Anthropic shape here.

import { withAiTelemetry } from "../../../_shared/aiTelemetry.ts";

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export interface ToolUse {
  id: string;                                     // toolu_…
  name: string;
  args: Record<string, unknown>;
}

/** Anthropic Messages-API message shape. Content can be a plain string OR
 *  an array of content blocks (required when carrying tool_use / tool_result). */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface AnthropicCallParams {
  model: string;
  systemInstruction?: string;
  /** Gemini-format declarations; converted to Anthropic shape internally. */
  tools?: any[];
  messages: AnthropicMessage[];
  maxTokens?: number;
}

export interface AnthropicCallResponse {
  text: string;                       // concatenation of all text blocks
  toolUses: ToolUse[];                // every tool_use block, with its id preserved
  /** Full assistant content blocks (text + tool_use). Push this back into
   *  `messages` as the assistant turn so subsequent calls have the tool_use
   *  ids the model expects to see in matching tool_result blocks. */
  rawAssistantContent: AnthropicContentBlock[];
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
}

// ────────────────────────────────────────────────────────────────────────────
// Tool-declaration conversion (Gemini → Anthropic)
// ────────────────────────────────────────────────────────────────────────────

interface GeminiSchema {
  type?: string;
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  enum?: string[];
  description?: string;
  required?: string[];
}

function convertSchema(s: GeminiSchema | undefined): any {
  if (!s) return { type: 'object', properties: {} };
  const out: any = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.required) out.required = s.required;
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = convertSchema(v);
  }
  if (s.items) out.items = convertSchema(s.items);
  return out;
}

function convertTools(geminiTools: any[] | undefined): any[] | undefined {
  if (!geminiTools || geminiTools.length === 0) return undefined;
  const out: any[] = [];
  for (const tool of geminiTools) {
    if (!tool?.functionDeclarations) continue;
    for (const fn of tool.functionDeclarations) {
      out.push({
        name: fn.name,
        description: fn.description,
        input_schema: convertSchema(fn.parameters),
      });
    }
  }
  return out.length ? out : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Direct call
// ────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
/** Per-call timeout. Long enough for Opus + tool-result-heavy contexts, short
 *  enough that one hung call doesn't burn the whole orchestrator wall budget. */
const ANTHROPIC_CALL_TIMEOUT_MS = 90_000;

async function callAnthropicRaw(
  apiKey: string,
  params: AnthropicCallParams,
): Promise<AnthropicCallResponse> {
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens ?? 8192,
    messages: params.messages,
  };
  if (params.systemInstruction) body.system = params.systemInstruction;
  const tools = convertTools(params.tools);
  if (tools) body.tools = tools;

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), ANTHROPIC_CALL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error(`Anthropic call timed out after ${ANTHROPIC_CALL_TIMEOUT_MS / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 600)}`);
  }

  const data = await res.json();
  const rawAssistantContent: AnthropicContentBlock[] = data.content ?? [];

  let text = '';
  const toolUses: ToolUse[] = [];
  for (const block of rawAssistantContent) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolUses.push({
        id: block.id,
        name: block.name,
        args: (block.input as Record<string, unknown>) ?? {},
      });
    }
  }

  return {
    text,
    toolUses,
    rawAssistantContent,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cachedInputTokens: data.usage?.cache_read_input_tokens ?? 0,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Wrapped in cost-center telemetry
// ────────────────────────────────────────────────────────────────────────────

export async function callAnthropic(
  ctx: { userId: string; feature: string; model: string },
  params: AnthropicCallParams,
): Promise<AnthropicCallResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  return await withAiTelemetry(
    {
      userId: ctx.userId,
      feature: ctx.feature,
      model: ctx.model,
      provider: 'anthropic',
      category: 'llm',
    },
    async () => {
      const out = await callAnthropicRaw(apiKey, params);
      return { result: out, usage: out.usage };
    },
  );
}
