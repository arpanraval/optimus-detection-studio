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

/** A text block may carry cache_control to mark it as the end of a prefix
 *  that should be cached. Anthropic's prompt-cache API uses ephemeral cache
 *  control on the last block of the prefix you want cached; we expose this
 *  through the public adapter so callers can opt skill-pack content + system
 *  prompt into the cache without depending on the auto path. */
export type AnthropicContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }
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
  /** When 'on' (default), the adapter applies cache_control:ephemeral to
   *  the system prompt and the tools array. Tool definitions + system
   *  prompt are >90% repeat content across an agent's iteration loop and
   *  across sibling workers within a session — the 5-minute TTL fits the
   *  orchestrator's per-session wall time and reads cost 1/10th of writes.
   *  Set to 'off' for debugging or for callers with <4k-token prefixes
   *  (cache writes below the model's min-cache-size are silently skipped
   *  by Anthropic but do incur the 25% write surcharge on retries). */
  cache?: 'on' | 'off';
  /** Enable grammar-constrained sampling on tool inputs. Forwarded to every
   *  tool definition as `strict: true`. Eliminates the parse/retry loop for
   *  tool-arg validation; Anthropic guarantees the model emits inputs that
   *  match the schema. Models supporting strict tool use: Opus 4.5+,
   *  Sonnet 4.5+, Haiku 4.5+. Default off so the adapter is back-compatible
   *  with non-strict-supported deployments. */
  strictTools?: boolean;
  /** Per-call timeout override in ms. Default 180_000 (180s). The base
   *  research/engineer calls emit large structured outputs and need
   *  headroom; QA and revision passes are shorter. Callers can pass a
   *  smaller value to fail fast on phases that should be quick. */
  timeoutMs?: number;
  /** Optional lifecycle telemetry hook. Called at HTTP/request boundaries so
   *  the orchestrator can distinguish "stalled before headers" from "stalled
   *  while parsing body" from "returned but failed during post-processing".
   *  The adapter never lets telemetry-hook failures affect the model call. */
  debug?: (event: AnthropicDebugEvent) => void | Promise<void>;
}

export interface AnthropicDebugEvent {
  stage:
    | 'request_prepared'
    | 'fetch_start'
    | 'fetch_headers'
    | 'rate_limited'
    | 'retry_sleep'
    | 'http_error_body_read'
    | 'json_parse_start'
    | 'json_parse_done'
    | 'fetch_error'
    | 'no_data';
  attempt?: number;
  elapsed_ms?: number;
  timeout_ms?: number;
  status?: number;
  ok?: boolean;
  retry_after_s?: number;
  sleep_s?: number;
  error_name?: string;
  error_message?: string;
  content_blocks?: number;
  text_blocks?: number;
  tool_use_blocks?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface AnthropicCallResponse {
  text: string;                       // concatenation of all text blocks
  toolUses: ToolUse[];                // every tool_use block, with its id preserved
  /** Full assistant content blocks (text + tool_use). Push this back into
   *  `messages` as the assistant turn so subsequent calls have the tool_use
   *  ids the model expects to see in matching tool_result blocks. */
  rawAssistantContent: AnthropicContentBlock[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    /** Tokens written to cache on this call. Surfaced for cost attribution
     *  — the cache-write tier is 1.25x the normal input price; cache reads
     *  are 0.1x. The wrapper aiTelemetry consumer reports this alongside
     *  the regular input/output counts. */
    cacheCreationInputTokens: number;
  };
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

function convertSchema(s: GeminiSchema | undefined, strict = false): any {
  if (!s) return { type: 'object', properties: {}, ...(strict ? { additionalProperties: false } : {}) };
  const out: any = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.required) out.required = s.required;
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = convertSchema(v, strict);
  }
  if (s.items) out.items = convertSchema(s.items, strict);
  // Strict tool use requires `additionalProperties: false` on every object
  // node. Set it on the root and on nested object properties; primitive
  // nodes (string/integer/enum) don't need it.
  if (strict && out.type === 'object') {
    out.additionalProperties = false;
  }
  return out;
}

function convertTools(
  geminiTools: readonly any[] | undefined,
  opts: { strict: boolean; cacheLastTool: boolean },
): any[] | undefined {
  if (!geminiTools || geminiTools.length === 0) return undefined;
  const out: any[] = [];
  for (const tool of geminiTools) {
    if (!tool?.functionDeclarations) continue;
    for (const fn of tool.functionDeclarations) {
      const toolDef: any = {
        name: fn.name,
        description: fn.description,
        input_schema: convertSchema(fn.parameters, opts.strict),
      };
      if (opts.strict) toolDef.strict = true;
      out.push(toolDef);
    }
  }
  if (out.length === 0) return undefined;
  // Cache the tools array as one prefix. Anthropic caches everything up to
  // and including the last block with cache_control set, so a single
  // breakpoint on the final tool definition caches all of them together
  // with the system prompt that precedes them.
  if (opts.cacheLastTool) {
    out[out.length - 1].cache_control = { type: 'ephemeral' };
  }
  return out;
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

/** Models that REJECT the `temperature` parameter with a 400
 *  invalid_request_error. As of 2026-05-19 Anthropic deprecated temperature
 *  for claude-opus-4-7 — sending it returns 400 and the call never executes.
 *  Sonnet 4.6 and Haiku 4.5 still accept temperature.
 *
 *  When we can't pin temperature to 0, determinism comes from:
 *    1. Strict tool use (grammar-constrained sampling on tool inputs)
 *    2. Prompt caching (identical prefix → identical first-token logits)
 *    3. The validator-feedback retry loop catching outlier outputs
 *  Run-to-run variance increases slightly for Opus but doesn't break
 *  correctness — same inputs still converge on the same TTP coverage. */
const MODELS_WITHOUT_TEMPERATURE: ReadonlySet<string> = new Set([
  'claude-opus-4-7',
]);

/** Default per-call timeout. Native AbortSignal.timeout — Rust-runtime-
 *  enforced so it survives Deno isolate hibernation.
 *
 *  180s ceiling because: (a) the walk-every-tactic Research Agent emits
 *  subject + 14 tactic_summary entries + N behaviours in one response, and
 *  (b) Opus 4.7 reasoning over the full skill pack + actor-critic context
 *  can spend 60-120s in a single call. With the queue architecture each
 *  LLM call gets its own fresh edge worker so this longer ceiling doesn't
 *  compound across phases. Callers can override via params.timeoutMs.
 *
 *  Was 90s; raised to 180s on the model-routing upgrade (Sonnet/Opus for
 *  reasoning agents). Opus 4.7 at ~40 tps emitting 12K tokens takes ~5
 *  minutes worst case — that's still bounded by the per-job worker
 *  lifetime, not this timeout. */
const ANTHROPIC_CALL_TIMEOUT_DEFAULT_MS = 180_000;

/** Retries on 429. Anthropic Tier-1 input TPM is shared across in-flight
 *  workers; with 2-concurrent fan-out and 5-10 LLM calls per leaf we will
 *  hit 429s in normal operation. 4 retries × up to 30s backoff = ~2min
 *  worst-case wait — comfortable now that each job runs in its own fresh
 *  edge invocation via the queue (no shared wall budget). */
const MAX_RATE_LIMIT_RETRIES = 4;

/** Cap on a single 429 retry-after sleep so a misbehaving server can't burn
 *  the whole worker on one wait. */
const MAX_RETRY_AFTER_S = 30;

async function debug(params: AnthropicCallParams, event: AnthropicDebugEvent): Promise<void> {
  if (!params.debug) return;
  try {
    await params.debug(event);
  } catch (e) {
    console.warn('[anthropic-raw] debug hook failed:', (e as Error)?.message ?? e);
  }
}

export async function callAnthropicRaw(
  apiKey: string,
  params: AnthropicCallParams,
): Promise<AnthropicCallResponse> {
  const startedAt = Date.now();
  const cacheEnabled = params.cache !== 'off';

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
  if (params.systemInstruction) {
    // System prompt as content-block array (rather than plain string) so we
    // can attach cache_control. The two-block split puts the long, fully-
    // static prompt body in its own cacheable block — the date-context
    // header (small, changes daily) is in a separate non-cached block so
    // changing the date doesn't invalidate the rest. The agent-loop
    // composes the system prompt with a single newline join, so the
    // boundary is content-only.
    if (cacheEnabled) {
      body.system = [
        {
          type: 'text',
          text: params.systemInstruction,
          cache_control: { type: 'ephemeral' },
        },
      ];
    } else {
      body.system = params.systemInstruction;
    }
  }
  if (params.temperature !== undefined && !MODELS_WITHOUT_TEMPERATURE.has(params.model)) {
    body.temperature = params.temperature;
  }
  const tools = convertTools(params.tools, {
    strict: params.strictTools === true,
    cacheLastTool: cacheEnabled && Boolean(params.tools && params.tools.length > 0),
  });
  if (tools) body.tools = tools;

  const timeoutMs = params.timeoutMs ?? ANTHROPIC_CALL_TIMEOUT_DEFAULT_MS;

  await debug(params, {
    stage: 'request_prepared',
    elapsed_ms: Date.now() - startedAt,
    timeout_ms: timeoutMs,
  });

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
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      await debug(params, {
        stage: 'fetch_start',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        timeout_ms: timeoutMs,
      });
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
      await debug(params, {
        stage: 'fetch_headers',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        timeout_ms: timeoutMs,
        status: res.status,
        ok: res.ok,
      });

      if (res.status === 429) {
        const retryAfterRaw = res.headers.get('retry-after') ?? '';
        const retryAfter = parseInt(retryAfterRaw) || (attempt + 1) * 5;
        lastErr = `Anthropic 429 (retry-after ${retryAfter}s)`;
        await debug(params, {
          stage: 'rate_limited',
          attempt,
          elapsed_ms: Date.now() - startedAt,
          status: res.status,
          retry_after_s: retryAfter,
        });
        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          const sleepS = Math.min(retryAfter, MAX_RETRY_AFTER_S);
          await debug(params, {
            stage: 'retry_sleep',
            attempt,
            elapsed_ms: Date.now() - startedAt,
            sleep_s: sleepS,
          });
          await new Promise(r => setTimeout(r, sleepS * 1000));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        await debug(params, {
          stage: 'http_error_body_read',
          attempt,
          elapsed_ms: Date.now() - startedAt,
          status: res.status,
          error_message: errText.slice(0, 300),
        });
        throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 600)}`);
      }

      await debug(params, {
        stage: 'json_parse_start',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        timeout_ms: timeoutMs,
        status: res.status,
      });
      data = await res.json();
      const parsedForDebug = data as {
        content?: AnthropicContentBlock[];
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      const contentForDebug = parsedForDebug.content ?? [];
      await debug(params, {
        stage: 'json_parse_done',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        status: res.status,
        content_blocks: contentForDebug.length,
        text_blocks: contentForDebug.filter(b => b.type === 'text').length,
        tool_use_blocks: contentForDebug.filter(b => b.type === 'tool_use').length,
        input_tokens: parsedForDebug.usage?.input_tokens ?? 0,
        output_tokens: parsedForDebug.usage?.output_tokens ?? 0,
        cached_input_tokens: parsedForDebug.usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: parsedForDebug.usage?.cache_creation_input_tokens ?? 0,
      });
      break;
    } catch (e) {
      const name = (e as Error).name;
      await debug(params, {
        stage: 'fetch_error',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        timeout_ms: timeoutMs,
        error_name: name,
        error_message: ((e as Error)?.message ?? String(e)).slice(0, 300),
      });
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error(`Anthropic call timed out after ${timeoutMs / 1000}s (${name})`);
      }
      throw e;
    }
  }

  if (data === null) {
    await debug(params, {
      stage: 'no_data',
      elapsed_ms: Date.now() - startedAt,
      status: res?.status,
      error_message: lastErr || 'no data returned',
    });
    throw new Error(`Anthropic ${res?.status ?? 'no-response'}: ${lastErr || 'no data returned'}`);
  }
  const parsed = data as {
    content?: AnthropicContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
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
      cacheCreationInputTokens: parsed.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}
