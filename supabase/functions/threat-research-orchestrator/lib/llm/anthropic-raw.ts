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
  /** Streaming is deliberately opt-in. Production callers use the proven
   *  JSON response shape; 'auto' exists only so the dormant stream parser
   *  can remain covered by mock-endpoint tests. */
  streaming?: 'off' | 'auto';
  /** Sampling temperature [0, 1]. Default Anthropic value is 1.0 which
   *  produces high run-to-run variance — for the orchestrator we want
   *  determinism, so callers pass 0. */
  temperature?: number;
  /** When 'on' (default), the adapter applies cache_control:ephemeral to
   *  the system prompt and the tools array. Tool definitions + system
   *  prompt are >90% repeat content across an agent's iteration loop and
   *  across sibling workers within a session. Threat-research sessions often
   *  exceed five minutes, so the adapter uses Anthropic's one-hour TTL.
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
    | 'retry_abandoned'
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
    out[out.length - 1].cache_control = { type: 'ephemeral', ttl: '1h' };
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

/** Attempts beyond the first, for failures that are actually transient.
 *
 *  Anthropic Tier-1 input TPM is shared across in-flight workers; with
 *  2-concurrent fan-out and 5-10 LLM calls per leaf we hit 429s in normal
 *  operation. 529 `overloaded_error` and 5xx are likewise routine.
 *
 *  The retry count is no longer the binding constraint — `timeoutMs` is an
 *  absolute deadline covering every attempt and every backoff, so the loop
 *  stops as soon as another attempt cannot fit regardless of how many
 *  remain. */
const MAX_TRANSIENT_RETRIES = 4;

/** Cap on a single backoff sleep so one absurd `retry-after` (org-level rate
 *  limits can quote hours) cannot swallow the whole deadline. Exceeding this
 *  is itself a signal the caller should pause the job rather than spin. */
const MAX_RETRY_AFTER_S = 30;

/** Base for exponential backoff on failures that carry no `retry-after`
 *  (5xx, 529, dropped sockets). */
const BASE_BACKOFF_MS = 500;

/** Below this much remaining deadline there is no point starting another
 *  attempt: the request would abort mid-flight and we would have paid the
 *  latency for nothing. */
const MIN_ATTEMPT_MS = 2_000;

/** How a call failed, in terms the caller can act on.
 *
 *  This exists because the orchestrator has to make two different decisions
 *  from one failure, and a string message cannot support either:
 *
 *    - retry here, or exit cleanly and let the queue re-dispatch into a fresh
 *      worker? (`retryable`)
 *    - is this specific to this request, or will every other in-flight worker
 *      hit it too? (`scope`)
 *
 *  The second question is the one production session 793cafab got wrong: five
 *  attack researchers, the planner and two engineers each hit the same
 *  credit-exhaustion 400 within 56 seconds, and because nothing distinguished
 *  "this request is malformed" from "this account cannot make any request",
 *  the pipeline ran to the end and reported success. */
export type AnthropicErrorKind =
  | 'rate_limited'   // 429
  | 'overloaded'     // 529
  | 'server_error'   // other 5xx
  | 'network'        // socket reset, DNS, TLS
  | 'timeout'        // our own deadline
  | 'account'        // credit exhausted, bad key, permission denied
  | 'request';       // malformed request; a bug in our code

export interface AnthropicErrorInfo {
  kind: AnthropicErrorKind;
  status: number | null;
  /** Whether replaying the identical request could succeed. */
  retryable: boolean;
  /** `account` means every concurrent worker is equally affected — the caller
   *  should stop the whole session rather than fail leaves one at a time.
   *  `request` means this call alone is broken. */
  scope: 'account' | 'request';
  /** Anthropic's own `error.type`, when the body parsed. */
  type: string | null;
  message: string;
  /** Server-advertised wait, in seconds, when one was given. */
  retryAfterS: number | null;
}

export class AnthropicError extends Error {
  readonly info: AnthropicErrorInfo;
  constructor(info: AnthropicErrorInfo) {
    super(
      info.status === null
        ? `Anthropic ${info.kind}: ${info.message}`
        : `Anthropic ${info.status} ${info.type ?? info.kind}: ${info.message}`,
    );
    this.name = 'AnthropicError';
    this.info = info;
  }
}

/** Messages that mean "this account cannot make ANY request right now".
 *  Anthropic returns credit exhaustion as a 400 invalid_request_error, which
 *  is otherwise indistinguishable from a genuine request-shape bug — so the
 *  message text is the only available signal and has to be matched. */
const ACCOUNT_SCOPE_PATTERNS: RegExp[] = [
  /credit balance is too low/i,
  /billing/i,
  /insufficient (funds|quota)/i,
];

/** Turn an HTTP status plus response body into a decision the caller can use. */
export function classifyAnthropicHttpFailure(status: number, rawBody: string): AnthropicErrorInfo {
  let type: string | null = null;
  let message = rawBody.slice(0, 600);
  try {
    const parsed = JSON.parse(rawBody);
    type = parsed?.error?.type ?? null;
    if (parsed?.error?.message) message = String(parsed.error.message);
  } catch {
    // Non-JSON body; keep the raw text.
  }

  // Authentication and permission are unambiguously account-scoped.
  if (status === 401 || status === 403) {
    return { kind: 'account', status, retryable: false, scope: 'account', type, message, retryAfterS: null };
  }
  // Credit exhaustion arrives as a 400. Distinguishing it from a malformed
  // request is the whole point of this function.
  if (status === 400 && ACCOUNT_SCOPE_PATTERNS.some(re => re.test(message))) {
    return { kind: 'account', status, retryable: false, scope: 'account', type, message, retryAfterS: null };
  }
  if (status === 429) {
    return { kind: 'rate_limited', status, retryable: true, scope: 'request', type, message, retryAfterS: null };
  }
  if (status === 529) {
    return { kind: 'overloaded', status, retryable: true, scope: 'request', type, message, retryAfterS: null };
  }
  if (status >= 500) {
    return { kind: 'server_error', status, retryable: true, scope: 'request', type, message, retryAfterS: null };
  }
  // Any other 4xx is our bug. Retrying it burns budget and cannot succeed.
  return { kind: 'request', status, retryable: false, scope: 'request', type, message, retryAfterS: null };
}

async function debug(params: AnthropicCallParams, event: AnthropicDebugEvent): Promise<void> {
  if (!params.debug) return;
  try {
    await params.debug(event);
  } catch (e) {
    console.warn('[anthropic-raw] debug hook failed:', (e as Error)?.message ?? e);
  }
}

/** Dormant threshold used only when a caller explicitly opts into
 *  `streaming: 'auto'`. Production callers omit that option and therefore
 *  retain the proven JSON response path. The stream parser and its tests stay
 *  available for a separately tested rollout. */
const STREAM_ABOVE_MAX_TOKENS = 16_000;

/** Production defaults to the proven JSON response shape. Keeping this
 *  decision pure and exported gives CI a regression test for the transport
 *  switch that accompanied the failed Dossier rollout. */
export function shouldUseAnthropicStream(
  streaming: AnthropicCallParams['streaming'],
  maxTokens: number,
): boolean {
  return streaming === 'auto' && maxTokens > STREAM_ABOVE_MAX_TOKENS;
}

function safeParseToolInput(json: string): Record<string, unknown> {
  if (!json.trim()) return {};
  try {
    return JSON.parse(json);
  } catch {
    // A tool_use block with unparseable partial JSON is a real model/stream
    // defect, not something to paper over with an empty object silently —
    // but the caller (agent-loop) already handles malformed tool args via
    // its normal validation-retry path, so surfacing {} here (rather than
    // throwing and losing the whole response) keeps that path working.
    return {};
  }
}

/** Consume an Anthropic streaming Messages-API response (SSE) and
 *  reconstruct the same shape callAnthropicRaw returns for a non-streaming
 *  call: content blocks (text concatenated per block, tool_use inputs
 *  assembled from incremental `input_json_delta` chunks) plus usage merged
 *  from `message_start` (input/cache tokens) and the final `message_delta`
 *  (output tokens, cumulative). Event shapes per Anthropic's documented raw
 *  SSE format: message_start -> content_block_start -> content_block_delta*
 *  -> content_block_stop -> message_delta -> message_stop. */
async function consumeAnthropicStream(res: Response): Promise<{
  content: AnthropicContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}> {
  if (!res.body) throw new Error('Anthropic streaming response had no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  type BlockAcc =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; inputJson: string };
  const blocks: BlockAcc[] = [];

  let inputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let outputTokens = 0;

  const processFrame = (frame: string) => {
    const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
    if (!dataLine) return;
    const jsonStr = dataLine.slice(5).trim();
    if (!jsonStr) return;
    let evt: any;
    try {
      evt = JSON.parse(jsonStr);
    } catch {
      return; // malformed SSE frame — skip rather than abort the whole call
    }
    switch (evt.type) {
      case 'message_start': {
        const u = evt.message?.usage ?? {};
        inputTokens = u.input_tokens ?? 0;
        cacheReadTokens = u.cache_read_input_tokens ?? 0;
        cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
        break;
      }
      case 'content_block_start': {
        const cb = evt.content_block;
        if (cb?.type === 'text') blocks[evt.index] = { type: 'text', text: cb.text ?? '' };
        else if (cb?.type === 'tool_use') {
          blocks[evt.index] = { type: 'tool_use', id: cb.id, name: cb.name, inputJson: '' };
        }
        break;
      }
      case 'content_block_delta': {
        const b = blocks[evt.index];
        if (!b) break;
        if (b.type === 'text' && evt.delta?.type === 'text_delta') b.text += evt.delta.text ?? '';
        else if (b.type === 'tool_use' && evt.delta?.type === 'input_json_delta') {
          b.inputJson += evt.delta.partial_json ?? '';
        }
        break;
      }
      case 'message_delta': {
        if (evt.usage?.output_tokens !== undefined) outputTokens = evt.usage.output_tokens;
        break;
      }
      default:
        break; // content_block_stop / message_stop / ping carry nothing we need
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (frame.trim()) processFrame(frame);
    }
  }
  if (buffer.trim()) processFrame(buffer); // trailing frame with no terminating blank line

  const content: AnthropicContentBlock[] = blocks.map((b) =>
    b.type === 'text'
      ? { type: 'text', text: b.text }
      : { type: 'tool_use', id: b.id, name: b.name, input: safeParseToolInput(b.inputJson) },
  );

  return {
    content,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: cacheReadTokens,
      cache_creation_input_tokens: cacheCreationTokens,
    },
  };
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
  // Streaming remains dormant in production. It was introduced with the
  // failed 32K Dossier rollout and never completed a real hosted call. Tests
  // opt into threshold-based streaming so the parser stays covered.
  const useStream = shouldUseAnthropicStream(
    params.streaming,
    body.max_tokens as number,
  );
  if (useStream) body.stream = true;
  if (params.systemInstruction) {
    // System prompt as content-block array (rather than plain string) so we
    // can attach cache_control. The two-block split puts the long, fully-
    // static prompt body in its own cacheable block — the date-context
    // header (small, changes daily) is in a separate non-cached block so
    // changing the date doesn't invalidate the rest. The agent-loop
    // composes the system prompt with a single newline join, so the
    // boundary is content-only.
    if (cacheEnabled) {
      // One-hour TTL: the split-phase pipeline commonly runs longer than five
      // minutes, so sibling workers otherwise rewrite the same stable prefix.
      body.system = [
        {
          type: 'text',
          text: params.systemInstruction,
          cache_control: { type: 'ephemeral', ttl: '1h' },
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
  if (tools) {
    body.tools = tools;
    // convertTools set the same one-hour marker on the final tool definition.
  }

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
  //
  // `timeoutMs` is an ABSOLUTE DEADLINE spanning every attempt and every
  // backoff — not a per-attempt allowance.
  //
  // It used to be per-attempt: a fresh AbortSignal.timeout(timeoutMs) was
  // built inside the loop, and the backoff sleeps were not counted at all. A
  // call configured for 110s could therefore legally run 5 attempts plus 4
  // backoffs — around 670s — against a Supabase edge worker the platform
  // kills at ~400s. The worker died mid-request, the job row kept claiming to
  // be 'running', and the reaper stamped
  // "reaper: worker exceeded edge-function lifetime" minutes later. That is
  // the mechanism behind the research-phase failures, independent of any
  // max_tokens sizing.
  //
  // Because the agent loop already passes `min(role ceiling, remaining job
  // runway)` as timeoutMs, making this a real deadline means the transport can
  // no longer overrun the worker no matter how many times it retries.
  const deadlineAt = startedAt + timeoutMs;
  const remainingMs = () => deadlineAt - Date.now();

  /** Wait before the next attempt, or report that there is no point.
   *
   *  Returns false when the caller should give up: either the retry budget is
   *  spent, or the wait plus a minimally useful attempt would not fit inside
   *  the remaining deadline. Refusing to sleep past the deadline is the whole
   *  reason this is a function and not an inline `setTimeout` — a server that
   *  answers a 429 with "retry-after: 3600" must fail the call in
   *  milliseconds, not park a worker for an hour it does not have. */
  const sleepBeforeRetry = async (failure: AnthropicErrorInfo, attempt: number): Promise<boolean> => {
    if (attempt >= MAX_TRANSIENT_RETRIES) return false;

    // Prefer the server's own guidance; otherwise back off exponentially.
    const baseMs = failure.retryAfterS !== null
      ? failure.retryAfterS * 1_000
      : BASE_BACKOFF_MS * 2 ** attempt;
    // Full jitter. Sibling workers fail together (they share the account's
    // rate limit), so retrying in lockstep would reproduce the same burst that
    // caused the 429. Spreading them is what actually clears it.
    const jitteredMs = Math.min(baseMs, MAX_RETRY_AFTER_S * 1_000) * (0.5 + Math.random() * 0.5);
    const sleepMs = Math.round(jitteredMs);

    if (sleepMs + MIN_ATTEMPT_MS > remainingMs()) {
      await debug(params, {
        stage: 'retry_abandoned',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        sleep_s: sleepMs / 1_000,
        error_message:
          `backoff ${Math.round(sleepMs / 1000)}s + minimum attempt would exceed the ` +
          `${Math.round(remainingMs() / 1000)}s left of this call's deadline`,
      });
      return false;
    }

    await debug(params, {
      stage: 'retry_sleep',
      attempt,
      elapsed_ms: Date.now() - startedAt,
      sleep_s: sleepMs / 1_000,
    });
    await new Promise(r => setTimeout(r, sleepMs));
    return true;
  };

  let res: Response | null = null;
  let data: unknown = null;
  let lastFailure: AnthropicErrorInfo | null = null;
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    // Each attempt is bounded by what is LEFT of the deadline, so the sum of
    // attempts can never exceed it.
    const signal = AbortSignal.timeout(Math.max(1, remainingMs()));
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

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const failure = classifyAnthropicHttpFailure(res.status, errText);
        if (res.status === 429) {
          const headerValue = parseInt(res.headers.get('retry-after') ?? '', 10);
          failure.retryAfterS = Number.isFinite(headerValue) && headerValue > 0 ? headerValue : null;
        }
        lastFailure = failure;

        await debug(params, {
          stage: failure.kind === 'rate_limited' ? 'rate_limited' : 'http_error_body_read',
          attempt,
          elapsed_ms: Date.now() - startedAt,
          status: res.status,
          error_message: failure.message.slice(0, 300),
          ...(failure.retryAfterS !== null ? { retry_after_s: failure.retryAfterS } : {}),
        });

        // A malformed request or an exhausted account cannot be fixed by
        // trying again — retrying just spends money to fail identically.
        if (!failure.retryable) throw new AnthropicError(failure);

        if (!(await sleepBeforeRetry(failure, attempt))) throw new AnthropicError(failure);
        continue;
      }

      await debug(params, {
        stage: 'json_parse_start',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        timeout_ms: timeoutMs,
        status: res.status,
      });
      // Streaming and non-streaming responses are reassembled into the same
      // { content, usage } shape below so everything past this point
      // (toolUses/text extraction, AnthropicCallResponse construction) is
      // identical either way.
      if (useStream) {
        const streamed = await consumeAnthropicStream(res);
        data = { content: streamed.content, usage: streamed.usage };
      } else {
        data = await res.json();
      }
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
      // A classified failure thrown above is already a decision — don't
      // reclassify it as a network error on the way out.
      if (e instanceof AnthropicError) throw e;

      const name = (e as Error).name;
      const rawMessage = ((e as Error)?.message ?? String(e)).slice(0, 300);
      await debug(params, {
        stage: 'fetch_error',
        attempt,
        elapsed_ms: Date.now() - startedAt,
        timeout_ms: timeoutMs,
        error_name: name,
        error_message: rawMessage,
      });

      // The deadline fired. Retrying is pointless: there is by definition no
      // time left, and the message names the budget so the job trail shows
      // whether the ceiling or the model was the problem.
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AnthropicError({
          kind: 'timeout',
          status: null,
          retryable: false,
          scope: 'request',
          type: name,
          message: `Anthropic call timed out after ${timeoutMs / 1000}s (${name})`,
          retryAfterS: null,
        });
      }

      // Anything else reaching here is a transport fault — a reset socket, a
      // DNS blip, a TLS failure. These are transient and worth another attempt
      // inside the deadline; previously they killed the agent on first sight.
      const failure: AnthropicErrorInfo = {
        kind: 'network',
        status: null,
        retryable: true,
        scope: 'request',
        type: name ?? null,
        message: rawMessage,
        retryAfterS: null,
      };
      lastFailure = failure;
      if (!(await sleepBeforeRetry(failure, attempt))) throw new AnthropicError(failure);
      continue;
    }
  }

  if (data === null) {
    // Reached only if the loop exhausted its attempts without either
    // succeeding or throwing — kept as a belt so a future edit to the loop
    // cannot silently return an empty response.
    await debug(params, {
      stage: 'no_data',
      elapsed_ms: Date.now() - startedAt,
      status: res?.status,
      error_message: lastFailure?.message ?? 'no data returned',
    });
    throw new AnthropicError(lastFailure ?? {
      kind: 'network',
      status: res?.status ?? null,
      retryable: false,
      scope: 'request',
      type: null,
      message: 'no data returned',
      retryAfterS: null,
    });
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
