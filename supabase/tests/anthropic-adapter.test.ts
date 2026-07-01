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
  | { kind: "rate-limit"; retryAfter?: number };

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

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* malformed body; leave as {} */ }
    state.capturedBodies.push(body);
    const next = state.responses[state.callIndex++] ?? { kind: "ok" };
    if (next.kind === "ok") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(next.body ?? defaultOk()));
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
} finally {
  await new Promise<void>((r) => server.close(() => r()));
}

console.log(`\n${failures.length === 0 ? "ALL TESTS PASSED" : `${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
