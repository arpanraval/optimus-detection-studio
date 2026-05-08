// Direct Anthropic Messages API caller — pure HTTP, no telemetry, no imports
// from _shared so the Layer 2 mock-endpoint tests can load this in Bun
// without dragging the whole supabase-js + cost-center chain.
//
// Production callers go through `anthropic-direct.ts::callAnthropic` which
// wraps this with `withAiTelemetry` for AI Cost Center attribution.

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
  /** Gemini-format declarations; converted to Anthropic shape internally.
   *  Accepts readonly arrays so the agent-loop's `cfg.toolDeclarations`
   *  (typed `readonly any[]`) flows through without needing a cast. */
  tools?: readonly any[];
  messages: AnthropicMessage[];
  maxTokens?: number;
  /** Sampling temperature [0, 1]. Default Anthropic value is 1.0 which
   *  produces high run-to-run variance — for the orchestrator we want
   *  determinism, so callers pass 0. */
  temperature?: number;
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

function convertTools(geminiTools: readonly any[] | undefined): any[] | undefined {
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

/** Default to the real Anthropic endpoint. Overrideable via env so the
 *  Layer 2 mock-endpoint tests can point at a local server without
 *  burning real tokens. */
const ANTHROPIC_URL =
  (typeof Deno !== 'undefined'
    ? Deno.env.get('ANTHROPIC_URL_OVERRIDE')
    : (globalThis as any).process?.env?.ANTHROPIC_URL_OVERRIDE)
  ?? 'https://api.anthropic.com/v1/messages';

/** Per-call timeout. Native AbortSignal.timeout — Rust-runtime-enforced so
 *  it survives Deno isolate hibernation.
 *
 *  180s ceiling because the walk-every-tactic Research Agent emits subject +
 *  14 tactic_summary entries + N behaviours in one response, and Haiku at
 *  ~80-150 tps takes 90-180s to generate that volume. With the queue
 *  architecture each LLM call gets its own fresh edge worker so this longer
 *  ceiling doesn't compound across phases. */
const ANTHROPIC_CALL_TIMEOUT_MS = 90_000;

/** Retries on 429. Anthropic Tier-1 input TPM is shared across in-flight
 *  workers; with 2-concurrent fan-out and 5-10 LLM calls per leaf we will
 *  hit 429s in normal operation. 4 retries × up to 30s backoff = ~2min
 *  worst-case wait — comfortable now that each job runs in its own fresh
 *  edge invocation via the queue (no shared wall budget). */
const MAX_RATE_LIMIT_RETRIES = 4;

/** Cap on a single 429 retry-after sleep so a misbehaving server can't burn
 *  the whole worker on one wait. */
const MAX_RETRY_AFTER_S = 30;

export async function callAnthropicRaw(
  apiKey: string,
  params: AnthropicCallParams,
): Promise<AnthropicCallResponse> {
  const body: Record<string, unknown> = {
    model: params.model,
    // 16384 (was 8192) because the walk-every-tactic Research Agent needs
    // to emit subject + 14 tactic_summary entries + N behaviours all in
    // one response. We observed truncation mid-output at 8192. Anthropic
    // charges only for tokens actually generated, so the higher ceiling
    // is cost-free unless the model actually uses it.
    max_tokens: params.maxTokens ?? 16384,
    messages: params.messages,
  };
  if (params.systemInstruction) body.system = params.systemInstruction;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  const tools = convertTools(params.tools);
  if (tools) body.tools = tools;

  // The timeout MUST cover BOTH the fetch (header receipt) AND the body
  // parse (`res.json()`). `fetch()` resolves as soon as response headers
  // arrive — if Anthropic returns 200 OK and then stalls the body stream
  // (which we've observed), an unprotected `await res.json()` will hang
  // forever.
  //
  // We use `AbortSignal.timeout()` rather than a manual setTimeout +
  // AbortController for a critical reason: in a Deno Deploy / Supabase
  // Edge isolate, when the worker is fully blocked on network I/O the
  // hypervisor hibernates the JS event loop. JS-level setTimeout never
  // fires while paused, so nothing wakes the worker. AbortSignal.timeout
  // is enforced by the Rust networking layer — when it fires it severs
  // the socket, which produces a network error that wakes the isolate
  // and rejects the await.
  let res: Response | null = null;
  let data: unknown = null;
  let lastErr = '';
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const signal = AbortSignal.timeout(ANTHROPIC_CALL_TIMEOUT_MS);
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (res.status === 429) {
        const retryAfterRaw = res.headers.get('retry-after') ?? '';
        const retryAfter = parseInt(retryAfterRaw) || (attempt + 1) * 5;
        lastErr = `Anthropic 429 (retry-after ${retryAfter}s)`;
        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          await new Promise(r => setTimeout(r, Math.min(retryAfter, MAX_RETRY_AFTER_S) * 1000));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 600)}`);
      }

      data = await res.json();
      break;
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error(`Anthropic call timed out after ${ANTHROPIC_CALL_TIMEOUT_MS / 1000}s (${name})`);
      }
      throw e;
    }
  }

  if (data === null) {
    throw new Error(`Anthropic ${res?.status ?? 'no-response'}: ${lastErr || 'no data returned'}`);
  }
  const parsed = data as {
    content?: AnthropicContentBlock[];
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
  };
  const rawAssistantContent: AnthropicContentBlock[] = parsed.content ?? [];

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
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
      cachedInputTokens: parsed.usage?.cache_read_input_tokens ?? 0,
    },
  };
}
