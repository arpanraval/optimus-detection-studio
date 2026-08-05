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
  /** Destroy the socket without replying, to model a connection reset. */
  destroy?: boolean;
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
    if (step.destroy) {
      res.socket?.destroy();
      return;
    }
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
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'hello' }],
    // Generous by default so retry behaviour is what's under test. The adapter
    // refuses to retry unless the backoff plus a minimally useful attempt fits
    // inside the remaining deadline, so a 2s budget would abandon every retry
    // and the assertions would be measuring the deadline, not the retry.
    // Tests that ARE about the deadline pass their own small value.
    timeoutMs: 10_000,
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

  it('treats timeoutMs as an absolute deadline spanning every attempt', async () => {
    // One 429 quoting a 1s wait, against a 300ms deadline. The backoff plus a
    // minimally useful attempt cannot fit, so the call fails immediately
    // instead of sleeping past its budget.
    //
    // This is the fix for `reaper: worker exceeded edge-function lifetime`.
    // Previously each attempt got a fresh AbortSignal.timeout(timeoutMs) and
    // the sleeps were not counted at all, so a call configured for 110s could
    // run ~670s against a ~400s worker kill.
    script = [
      { status: 429, body: '{"type":"error"}', headers: { 'retry-after': '1' } },
      { status: 200, body: OK_BODY },
    ];
    const startedAt = Date.now();
    await expect(callRaw({ timeoutMs: 300 })).rejects.toThrow(/Anthropic 429/);
    const elapsed = Date.now() - startedAt;

    // Never slept the 1s the server asked for: there was no room for it.
    expect(elapsed).toBeLessThan(1_000);
    expect(hits).toBe(1);
  }, 10_000);

  it('retries a 500 and succeeds — 5xx and 529 are transient', async () => {
    script = [
      { status: 500, body: '{"type":"error","error":{"type":"api_error"}}' },
      { status: 200, body: OK_BODY },
    ];
    const res = await callRaw();
    expect(res.text).toBe('ok');
    expect(hits).toBe(2);
  }, 10_000);

  it('retries a 529 overloaded_error', async () => {
    script = [
      { status: 529, body: '{"type":"error","error":{"type":"overloaded_error"}}' },
      { status: 200, body: OK_BODY },
    ];
    const res = await callRaw();
    expect(res.text).toBe('ok');
    expect(hits).toBe(2);
  }, 10_000);

  it('retries a dropped connection', async () => {
    // A reset socket produced a fetch-level TypeError that killed the agent on
    // first sight. It is a transport fault, not a rejected request.
    script = [
      { status: 200, body: '', destroy: true },
      { status: 200, body: OK_BODY },
    ];
    const res = await callRaw();
    expect(res.text).toBe('ok');
    expect(hits).toBe(2);
  }, 10_000);

  it('does not retry a 400 — a request-shape error is not transient', async () => {
    // Retrying a malformed request just burns budget. This is the shape of the
    // real "`temperature` is deprecated for this model" failure: a code bug
    // affecting one agent, which must never abort a whole session.
    script = [{ status: 400, body: '{"type":"error","error":{"type":"invalid_request_error","message":"bad param"}}' }];
    await expect(callRaw()).rejects.toThrow(/Anthropic 400 invalid_request_error/);
    expect(hits).toBe(1);
  });

  it('classifies credit exhaustion as account-scoped, not a request bug', async () => {
    // Anthropic returns this as a 400, indistinguishable by status from a
    // malformed request. Getting the distinction right is what lets the caller
    // stop the whole session instead of failing leaves one at a time -- the
    // exact miss in production session 793cafab.
    const { AnthropicError } = await import('../llm/anthropic-raw.ts');
    script = [{
      status: 400,
      body: '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
    }];

    await expect(callRaw()).rejects.toThrow(AnthropicError);
    try {
      await callRaw();
    } catch (e) {
      const info = (e as InstanceType<typeof AnthropicError>).info;
      expect(info.kind).toBe('account');
      expect(info.scope).toBe('account');
      expect(info.retryable).toBe(false);
    }
  });

  it('classifies 401 and 403 as account-scoped', async () => {
    const { classifyAnthropicHttpFailure } = await import('../llm/anthropic-raw.ts');
    for (const status of [401, 403]) {
      const info = classifyAnthropicHttpFailure(status, '{"error":{"type":"authentication_error"}}');
      expect(info.scope).toBe('account');
      expect(info.retryable).toBe(false);
    }
  });

  it('abandons a retry rather than sleeping past the deadline (org-level 429)', async () => {
    // An organisation-level rate limit can quote hours. Parking a worker for
    // one is strictly worse than failing now and letting the queue re-dispatch
    // into a fresh worker later.
    script = [{ status: 429, body: '{"type":"error"}', headers: { 'retry-after': '3600' } }];
    const stages: { stage: string }[] = [];
    const startedAt = Date.now();

    await expect(
      callRaw({ timeoutMs: 3_000, debug: (e: { stage: string }) => { stages.push(e); } }),
    ).rejects.toThrow(/Anthropic 429/);

    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(stages.some(s => s.stage === 'retry_abandoned')).toBe(true);
  }, 10_000);

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

// ---------------------------------------------------------------------------
// Retry-After parsing
// ---------------------------------------------------------------------------

describe('parseRetryAfterSeconds', () => {
  it('reads delta-seconds', async () => {
    const { parseRetryAfterSeconds } = await import('../llm/anthropic-raw.ts');
    expect(parseRetryAfterSeconds('30')).toBe(30);
  });

  it('reads an HTTP-date, which used to fall through to exponential backoff', async () => {
    // RFC 9110 allows both forms. Only the integer form was handled, so a
    // date-valued header produced a much SHORTER wait than the server asked
    // for -- on an org-level limit that means retrying straight back into it.
    const { parseRetryAfterSeconds } = await import('../llm/anthropic-raw.ts');
    const now = Date.parse('2026-07-30T00:00:00Z');
    expect(parseRetryAfterSeconds('Thu, 30 Jul 2026 00:01:00 GMT', now)).toBe(60);
  });

  it('treats a past date as no guidance', async () => {
    const { parseRetryAfterSeconds } = await import('../llm/anthropic-raw.ts');
    const now = Date.parse('2026-07-30T00:05:00Z');
    expect(parseRetryAfterSeconds('Thu, 30 Jul 2026 00:00:00 GMT', now)).toBeNull();
  });

  it('returns null for absent, empty or unparseable values', async () => {
    const { parseRetryAfterSeconds } = await import('../llm/anthropic-raw.ts');
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds('')).toBeNull();
    expect(parseRetryAfterSeconds('soon')).toBeNull();
    expect(parseRetryAfterSeconds('0')).toBeNull();
  });
});
