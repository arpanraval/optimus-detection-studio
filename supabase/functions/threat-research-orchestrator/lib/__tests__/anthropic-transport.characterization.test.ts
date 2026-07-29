// supabase/functions/threat-research-orchestrator/lib/__tests__/anthropic-transport.characterization.test.ts
//
// CHARACTERIZATION TESTS — these pin what the transport does TODAY, including
// the parts that are wrong. They exist so the W1a change (one absolute
// deadline, retry the full set of transient failures) is a visible, deliberate
// edit to an assertion rather than an invisible behaviour drift.
//
// Two of these assertions describe defects and say so. When W1a lands, they
// flip; a reviewer diffing this file sees exactly which contract changed.
//
// The adapter reads ANTHROPIC_URL_OVERRIDE into a module-scope const, so each
// test sets the variable and then dynamically imports after vi.resetModules().

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** One scripted response from the fake Anthropic endpoint. */
interface ScriptedResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
  /** Hold the response open this long before replying, to drive timeouts. */
  delayMs?: number;
}

const OK_BODY = JSON.stringify({
  content: [{ type: 'text', text: 'ok' }],
  usage: { input_tokens: 10, output_tokens: 5 },
});

let server: Server;
let baseUrl: string;
let script: ScriptedResponse[];
let hits: number;

beforeEach(async () => {
  script = [];
  hits = 0;
  server = createServer((req, res) => {
    const step = script[Math.min(hits, script.length - 1)];
    hits++;
    // Drain the request body so the socket does not stall.
    req.resume();
    const send = () => {
      res.writeHead(step.status, { 'Content-Type': 'application/json', ...(step.headers ?? {}) });
      res.end(step.body);
    };
    if (step.delayMs) setTimeout(send, step.delayMs);
    else send();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/v1/messages`;

  process.env.ANTHROPIC_API_KEY = 'test-key-not-a-secret';
  process.env.ANTHROPIC_URL_OVERRIDE = baseUrl;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.ANTHROPIC_URL_OVERRIDE;
  delete process.env.ANTHROPIC_API_KEY;
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

async function callRaw(overrides: Record<string, unknown> = {}) {
  const { callAnthropicRaw } = await import('../llm/anthropic-raw.ts');
  // The raw adapter takes the key explicitly; only the telemetry-wrapped
  // callAnthropic in anthropic-direct.ts reads it from the environment.
  return callAnthropicRaw('test-key-not-a-secret', {
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'hello' }],
    timeoutMs: 2_000,
    ...overrides,
  } as never);
}

describe('anthropic transport — current behaviour', () => {
  it('returns text and usage on a 200', async () => {
    script = [{ status: 200, body: OK_BODY }];
    const res = await callRaw();
    expect(res.text).toBe('ok');
    expect(res.usage.inputTokens).toBe(10);
    expect(res.usage.outputTokens).toBe(5);
    expect(hits).toBe(1);
  });

  it('retries a 429 and succeeds on the following attempt', async () => {
    script = [
      { status: 429, body: '{"type":"error"}', headers: { 'retry-after': '1' } },
      { status: 200, body: OK_BODY },
    ];
    const res = await callRaw();
    expect(res.text).toBe('ok');
    expect(hits).toBe(2);
  });

  it('DEFECT: timeoutMs is per attempt, so total wall time can exceed it', async () => {
    // One 429 with retry-after: 1s, against a 300ms "timeout". If timeoutMs
    // were an absolute deadline the call would abort; instead each attempt
    // gets a fresh AbortSignal.timeout() and the sleep is not counted at all.
    //
    // This is the mechanism behind `reaper: worker exceeded edge-function
    // lifetime` on research jobs: a role configured for 110s can legally run
    // 5 attempts plus 4 backoffs against a ~400s worker kill.
    //
    // W1a: this assertion inverts — elapsed must stay under the deadline and
    // the call must fail fast when the backoff would overrun it.
    script = [
      { status: 429, body: '{"type":"error"}', headers: { 'retry-after': '1' } },
      { status: 200, body: OK_BODY },
    ];
    const startedAt = Date.now();
    const res = await callRaw({ timeoutMs: 300 });
    const elapsed = Date.now() - startedAt;

    expect(res.text).toBe('ok');
    expect(elapsed).toBeGreaterThan(300);
  }, 10_000);

  it('DEFECT: a 500 is not retried, even though it is transient', async () => {
    // Anthropic 529 overloaded_error and 5xx are routine. Today they throw on
    // the first response and kill the agent, so the job burns a full attempt
    // and the reaper has to reset it minutes later.
    //
    // W1a: hits becomes 2+ and the call succeeds.
    script = [
      { status: 500, body: '{"type":"error","error":{"type":"api_error"}}' },
      { status: 200, body: OK_BODY },
    ];
    await expect(callRaw()).rejects.toThrow(/^Anthropic 500:/);
    expect(hits).toBe(1);
  });

  it('does not retry a 400 — a request-shape error is not transient', async () => {
    // This one is correct today and must stay correct: retrying a malformed
    // request just burns budget. It is also the shape of the real
    // "`temperature` is deprecated for this model" failure in production, which
    // is a code bug affecting one agent and must never abort a whole session.
    script = [{ status: 400, body: '{"type":"error","error":{"type":"invalid_request_error"}}' }];
    await expect(callRaw()).rejects.toThrow(/^Anthropic 400:/);
    expect(hits).toBe(1);
  });

  it('surfaces a stalled response as a TimeoutError naming the timeout', async () => {
    script = [{ status: 200, body: OK_BODY, delayMs: 1_000 }];
    await expect(callRaw({ timeoutMs: 150 })).rejects.toThrow(
      /Anthropic call timed out after 0\.15s \(TimeoutError\)/,
    );
  });

  it('emits debug stages for the request lifecycle', async () => {
    // The orchestrator relies on these stage names to tell "stalled before
    // headers" apart from "stalled parsing body" — the distinction that made
    // the worker-death diagnosis possible at all.
    script = [{ status: 200, body: OK_BODY }];
    const stages: string[] = [];
    await callRaw({ debug: (e: { stage: string }) => { stages.push(e.stage); } });
    expect(stages).toContain('fetch_start');
    expect(stages).toContain('fetch_headers');
    expect(stages).toContain('json_parse_done');
  });
});
