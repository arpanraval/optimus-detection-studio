// Layer 2: Anthropic adapter — mock-endpoint tests.
//
// Run with:
//   bun run supabase/tests/anthropic-adapter.test.ts
//
// Spins up a local HTTP mock (node:http), points the adapter at it via
// ANTHROPIC_URL_OVERRIDE, asserts:
//   T2. 429 retry-after honoured then succeeds
//   T3. retry cap stops at MAX_RATE_LIMIT_RETRIES (4 retries → 5 attempts)
//   T4. temperature plumbing — present when caller passes 0; absent otherwise
//
// Self-contained: writes pass/fail to stdout and process.exit(0|1).
// Zero LLM cost — never reaches real api.anthropic.com.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = 8787;
const MOCK_URL = `http://localhost:${PORT}/v1/messages`;

process.env.ANTHROPIC_URL_OVERRIDE = MOCK_URL;
process.env.ANTHROPIC_API_KEY = "test-key-not-real";

// The adapter calls Deno.env.get(). Bun doesn't shim Deno globally, so install
// a minimal Deno.env shim that reads from process.env. This is the only Deno
// surface the adapter touches.
// @ts-expect-error — installing the shim
globalThis.Deno = { env: { get: (k: string) => process.env[k] } };

const { callAnthropicRaw } = await import(
  "../functions/threat-research-orchestrator/lib/llm/anthropic-raw.ts"
);

// ─── mock server state ─────────────────────────────────────────────────────
type Response =
  | { kind: "ok"; body?: object }
  | { kind: "rate-limit"; retryAfter?: number }
  | { kind: "raw-sse"; frames: string };

interface MockState {
  responses: Response[];
  capturedBodies: Array<Record<string, unknown>>;
  callIndex: number;
}

const state: MockState = { responses: [], capturedBodies: [], callIndex: 0 };

function reset(rs: Response[]) {
  state.responses = rs;
  state.capturedBodies = [];
  state.callIndex = 0;
}

function defaultOk() {
  return { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } };
}

/** Serialize a non-streaming-shaped mock response ({content, usage}) into
 *  the SSE event sequence the real Anthropic streaming API emits, so the
 *  same `{ kind: "ok", body }` fixtures exercise both the non-streaming and
 *  streaming paths in callAnthropicRaw. One delta per content block (a
 *  single text_delta / input_json_delta covering the whole block) — the
 *  adapter's incremental-accumulation code is exercised in T5 below with
 *  multiple delta chunks per block. */
function toSseFrames(body: { content?: any[]; usage?: any }): string {
  const content = body.content ?? [];
  const usage = body.usage ?? {};
  const frames: string[] = [];
  frames.push(`event: message_start\ndata: ${JSON.stringify({
    type: "message_start",
    message: {
      id: "msg_mock", type: "message", role: "assistant", content: [],
      model: "claude-haiku-4-5", stop_reason: null, stop_sequence: null,
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        output_tokens: 0,
      },
    },
  })}\n\n`);
  content.forEach((block: any, index: number) => {
    if (block.type === "text") {
      frames.push(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: { type: "text", text: "" } })}\n\n`);
      frames.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text ?? "" } })}\n\n`);
    } else if (block.type === "tool_use") {
      frames.push(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } })}\n\n`);
      frames.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input ?? {}) } })}\n\n`);
    }
    frames.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`);
  });
  frames.push(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: usage.output_tokens ?? 0 } })}\n\n`);
  frames.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
  return frames.join("");
}

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* malformed body; leave as {} */ }
    state.capturedBodies.push(body);
    const next = state.responses[state.callIndex++] ?? { kind: "ok" };
    if (next.kind === "raw-sse") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/event-stream");
      res.end(next.frames);
      return;
    }
    if (next.kind === "ok") {
      const okBody = (next.body ?? defaultOk()) as { content?: any[]; usage?: any };
      res.statusCode = 200;
      if (body.stream === true) {
        res.setHeader("content-type", "text/event-stream");
        res.end(toSseFrames(okBody));
      } else {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(okBody));
      }
      return;
    }
    res.statusCode = 429;
    res.setHeader("retry-after", String(next.retryAfter ?? 1));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "rate limited" }));
  });
}

const server = createServer(handler);
await new Promise<void>((r) => server.listen(PORT, () => r()));

// ─── tiny assertion helper ─────────────────────────────────────────────────
const failures: string[] = [];
function assert(cond: unknown, label: string) {
  if (!cond) { failures.push(`✗ ${label}`); console.log(`✗ ${label}`); }
  else { console.log(`✓ ${label}`); }
}

const baseParams = {
  model: "claude-haiku-4-5",
  messages: [{ role: "user" as const, content: "hi" }],
  // Production leaves this unset. Tests opt in so the dormant stream parser
  // remains covered without changing the hosted request shape.
  streaming: "auto" as const,
};

try {
  // T4 ─────────────────────────────────────────────────────────────────────
  reset([{ kind: "ok" }]);
  await callAnthropicRaw("test-key-not-real", { ...baseParams, temperature: 0 });
  assert(state.capturedBodies.length === 1, "T4: one outbound call");
  assert(state.capturedBodies[0].temperature === 0, "T4: temperature=0 in outbound body");

  reset([{ kind: "ok" }]);
  await callAnthropicRaw("test-key-not-real", baseParams);
  assert(state.capturedBodies[0].temperature === undefined, "T4b: temperature omitted when not passed");

  // T2 ─────────────────────────────────────────────────────────────────────
  reset([{ kind: "rate-limit", retryAfter: 1 }, { kind: "ok" }]);
  const t0 = Date.now();
  const res = await callAnthropicRaw("test-key-not-real", baseParams);
  const elapsed = Date.now() - t0;
  assert(state.capturedBodies.length === 2, "T2: 2 outbound calls (1 retry)");
  assert(res.text === "ok", "T2: succeeds after retry");
  assert(elapsed >= 900, `T2: respected ~1s retry-after (was ${elapsed}ms)`);

  // T3 ─────────────────────────────────────────────────────────────────────
  reset(Array.from({ length: 10 }, () => ({ kind: "rate-limit" as const, retryAfter: 0 })));
  let threw = false;
  try {
    await callAnthropicRaw("test-key-not-real", baseParams);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("Anthropic 429"), "T3: throws Anthropic 429");
  }
  assert(threw, "T3: throws after retry cap");
  assert(
    state.capturedBodies.length === 5,
    `T3: exactly 5 attempts (1 + 4 retries), got ${state.capturedBodies.length}`,
  );

  // T5 ─── streaming threshold gating ──────────────────────────────────────
  // baseParams sets no maxTokens, so the adapter's default (16384) applies —
  // above the 16000 streaming threshold — and every call above should
  // request stream:true. An explicit small maxTokens should NOT stream.
  reset([{ kind: "ok" }]);
  await callAnthropicRaw("test-key-not-real", baseParams);
  assert(state.capturedBodies[0].stream === true, "T5: default max_tokens (16384) requests stream:true");

  reset([{ kind: "ok" }]);
  await callAnthropicRaw("test-key-not-real", { ...baseParams, maxTokens: 1000 });
  assert(state.capturedBodies[0].stream === undefined, "T5b: maxTokens=1000 does not request streaming");

  reset([{ kind: "ok" }]);
  await callAnthropicRaw("test-key-not-real", {
    model: baseParams.model,
    messages: baseParams.messages,
  });
  assert(state.capturedBodies[0].stream === undefined, "T5c: production default keeps streaming disabled");

  // T6 ─── streaming response reassembly (multi-chunk text + tool_use) ────
  // Hand-crafted raw SSE with text split across two deltas and a tool_use
  // input split across two partial_json chunks, to exercise the adapter's
  // incremental-accumulation code specifically (not just the single-delta
  // shape toSseFrames produces for T2-T5).
  const rawFrames = [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } } })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello " } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "lookup", input: {} } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"q":"' } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'x"}' } })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 1 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  ].join("");
  reset([{ kind: "raw-sse", frames: rawFrames } as any]);
  const streamRes = await callAnthropicRaw("test-key-not-real", baseParams);
  assert(streamRes.text === "hello world", `T6: multi-chunk text_delta reassembled (got "${streamRes.text}")`);
  assert(streamRes.toolUses.length === 1 && streamRes.toolUses[0].name === "lookup", "T6: tool_use block reassembled");
  assert(JSON.stringify(streamRes.toolUses[0]?.args) === JSON.stringify({ q: "x" }), "T6: tool_use input reassembled from chunked partial_json");
  assert(streamRes.usage.inputTokens === 10 && streamRes.usage.outputTokens === 7, "T6: usage merged from message_start (input) + message_delta (output)");
  assert(streamRes.usage.cachedInputTokens === 2 && streamRes.usage.cacheCreationInputTokens === 3, "T6: cache usage read from message_start");

  // T7 ─── cache TTL 1h ─────────────────────────────────────────────────────
  reset([{ kind: "ok" }]);
  await callAnthropicRaw("test-key-not-real", { ...baseParams, systemInstruction: "you are a test" });
  const sysBlock = (state.capturedBodies[0].system as any[])?.[0];
  assert(sysBlock?.cache_control?.type === "ephemeral" && sysBlock?.cache_control?.ttl === "1h", "T7: system cache_control ttl=1h");
} finally {
  await new Promise<void>((r) => server.close(() => r()));
}

console.log(`\n${failures.length === 0 ? "ALL TESTS PASSED" : `${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
