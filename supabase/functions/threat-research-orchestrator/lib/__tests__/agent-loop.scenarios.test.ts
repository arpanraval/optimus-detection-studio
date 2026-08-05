// supabase/functions/threat-research-orchestrator/lib/__tests__/agent-loop.scenarios.test.ts
//
// Lifecycle scenarios for the shared agent loop, driven against a fake
// Anthropic endpoint and an in-memory RunContext. Every one of these is a
// failure mode observed in production; until now none could be reproduced
// without spending money on a live session.
//
// Where a scenario documents current behaviour that the W1a change will alter,
// the test says so explicitly. Those assertions are the contract diff.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  startFakeAnthropic,
  okBody,
  toolUseBody,
  errorBody,
  type FakeAnthropic,
} from './helpers/fake-anthropic.ts';
import {
  makeFakeRunContext,
  budgetAllowingModelCalls,
} from './helpers/fake-run-context.ts';
import type { ToolContext } from '../tools/index.ts';

let fake: FakeAnthropic;

beforeAll(async () => {
  fake = await startFakeAnthropic();
  process.env.ANTHROPIC_URL_OVERRIDE = fake.url;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-a-secret';
  // aiTelemetry builds an admin client from these. A syntactically valid URL
  // keeps createClient from throwing; the usage-event insert then fails on the
  // network and is swallowed, which is the production posture -- telemetry must
  // never fail a run.
  process.env.SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-not-a-secret';
});

afterAll(async () => {
  delete process.env.ANTHROPIC_URL_OVERRIDE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fake.close();
});

beforeEach(() => {
  vi.resetModules();
  fake.setScript([{ status: 200, body: okBody('{"value":1}') }]);
});

function makeToolContext(): ToolContext {
  return {
    supabase: {} as never,
    userId: '00000000-0000-4000-8000-000000000002',
    searchCache: new Map(),
    fetchCache: new Map(),
  } as ToolContext;
}

/** Minimal loop config: accepts any JSON object with a `value` key. */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    agent: 'research' as const,
    model: 'claude-sonnet-5',
    systemInstruction: 'test system',
    knowledgePack: '',
    toolDeclarations: [],
    iterationCap: 5,
    feature: 'threat_research',
    timeoutMs: 2_000,
    maxTokens: 1_024,
    validateFinalOutput: (text: string) => {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.value !== 'number') {
          return { ok: false as const, reason: 'value must be a number' };
        }
        return { ok: true as const, value: parsed };
      } catch (e) {
        return { ok: false as const, reason: `JSON parse failed: ${(e as Error).message}` };
      }
    },
    ...overrides,
  };
}

async function runLoop(cfg: Record<string, unknown>, harness: ReturnType<typeof makeFakeRunContext>) {
  const { runAgentLoop } = await import('../agents/agent-loop.ts');
  return runAgentLoop(cfg as never, makeToolContext(), harness.ctx, 'do the task');
}

describe('agent loop — success and validation', () => {
  it('returns the validated output and emits a completion event', async () => {
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.success).toBe(true);
    expect(outcome.output).toEqual({ value: 1 });
    expect(harness.ofType('agent_completed')).toHaveLength(1);
    expect(harness.ofType('agent_loop_exit')).toHaveLength(1);
  });

  it('retries once on invalid output and succeeds, without carrying the bad text forward', async () => {
    // The failed output can be 15-25K chars. Carrying it into the retry pushed
    // input tokens up and workers back into timeout territory, so the loop
    // replaces it with a placeholder and sends only the validator's reason.
    fake.setScript([
      { status: 200, body: okBody('not json at all') },
      { status: 200, body: okBody('{"value":7}') },
    ]);
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig({ maxValidationRetries: 1 }), harness);

    expect(outcome.success).toBe(true);
    expect(outcome.output).toEqual({ value: 7 });
    expect(harness.ofType('agent_validation_failed')).toHaveLength(1);

    const retryRequest = fake.requests()[1] as { messages: { role: string; content: unknown }[] };
    const assistantTurn = retryRequest.messages.find(m => m.role === 'assistant');
    expect(String(assistantTurn?.content)).toContain('invalid JSON output omitted');
    expect(String(assistantTurn?.content)).not.toContain('not json at all');
  });

  it('fails after exhausting validation retries, naming the validator reason', async () => {
    // maxValidationRetries: 0 was the real research-agent setting. It made the
    // agent emitting the pipeline's largest JSON the only one with no second
    // chance, and two production sessions died on a single stray character.
    fake.setScript([{ status: 200, body: okBody('{"value":"not-a-number"}') }]);
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig({ maxValidationRetries: 0 }), harness);

    expect(outcome.success).toBe(false);
    expect(outcome.reason).toBe('validation_failed');
    expect(harness.lastFailureReason()).toBe('validation_failed');
    expect(fake.hits()).toBe(1);
  });

  it('stops at the iteration cap when the model never finalises', async () => {
    fake.setScript([{ status: 200, body: toolUseBody('web_search', { query: 'x' }) }]);
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig({ iterationCap: 3 }), harness);

    expect(outcome.success).toBe(false);
    expect(outcome.reason).toBe('iteration_cap');
    expect(outcome.iterations).toBe(3);
  });
});

describe('agent loop — budget', () => {
  it('exits immediately when the session model-call cap is already spent', async () => {
    // 199 production agent failures carry this reason. Because the cap is a
    // single session-wide counter consumed by leaves running in parallel,
    // whichever leaves happen to run last are the ones starved.
    const harness = makeFakeRunContext({ budget: budgetAllowingModelCalls(0) });
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.success).toBe(false);
    expect(outcome.reason).toBe('model_budget_exhausted');
    expect(outcome.iterations).toBe(0);
    // No model call was made -- the gate is checked before spending.
    expect(fake.hits()).toBe(0);
  });

  it('DEFECT: a failed call still consumes budget, so retries eat the cap', async () => {
    // The pre-call gate spends one model call, and nothing refunds it when the
    // call fails. A job the reaper resets three times has therefore charged the
    // session three times for zero output. W1a moves the budget to tokens and
    // reconciles after the call.
    fake.setScript([{ status: 500, body: errorBody('api_error', 'boom') }]);
    const harness = makeFakeRunContext();
    await runLoop(makeConfig(), harness);

    const modelSpends = harness.budgetCalls.filter(c => c.modelCalls > 0);
    expect(modelSpends).toHaveLength(1);
    // ...and no compensating refund was recorded.
    expect(harness.budgetCalls.some(c => c.modelCalls < 0)).toBe(false);
  });
});

describe('agent loop — worker lifetime', () => {
  it('refuses to start an iteration when the worker has no useful runway left', async () => {
    // Supabase kills the worker at ~400s. The guard exits cleanly instead of
    // being killed mid-request, which is what made "worker died, no reason
    // recorded" diagnosable at all.
    const harness = makeFakeRunContext({ jobStartedAt: Date.now() - 380_000 });
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.success).toBe(false);
    expect(outcome.reason).toBe('job_wall_budget');
    expect(fake.hits()).toBe(0);

    const failure = harness.ofType('agent_failed')[0];
    expect(failure.message).toContain('job_wall_budget');
  });

  it('shrinks this call timeout to the remaining runway rather than refusing outright', async () => {
    // The guard originally refused whenever a role's worst-case ceiling did not
    // fit the remaining budget, which fired ~40s into every real session even
    // though most iterations are short tool turns.
    const harness = makeFakeRunContext({ jobStartedAt: Date.now() - 300_000 });
    const outcome = await runLoop(makeConfig({ timeoutMs: 300_000 }), harness);

    expect(outcome.success).toBe(true);
    const started = harness.ofType('agent_model_call_start')[0];
    // 370s safe deadline - 300s elapsed = ~70s of runway, well under the
    // configured 300s ceiling.
    expect(started.payload?.timeout_ms as number).toBeLessThan(300_000);
    expect(started.payload?.timeout_ms as number).toBeGreaterThan(0);
  });
});

describe('agent loop — resumable checkpoints', () => {
  const JOB_ID = '00000000-0000-4000-8000-0000000000aa';

  it('persists the conversation after an iteration that used tools', async () => {
    fake.setScript([
      { status: 200, body: toolUseBody('web_search', { query: 'x' }) },
      { status: 200, body: okBody('{"value":5}') },
    ]);
    const harness = makeFakeRunContext({ jobId: JOB_ID });
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.success).toBe(true);
    // One write after the tool-call iteration...
    expect(harness.checkpointWrites).toHaveLength(1);
    expect(harness.checkpointWrites[0].job_id).toBe(JOB_ID);
    // ...and cleared on success, since it holds the environment profile and
    // library rule bodies and is dead weight once the job produced output.
    expect(harness.checkpointDeletes()).toBe(1);
    expect(harness.checkpoint()).toBeNull();
  });

  it('resumes a killed attempt instead of replaying its tool calls', async () => {
    // This is the reaper-reset path: the worker died, the job row was reset,
    // and a fresh worker claimed the SAME job id. Previously it restarted from
    // message zero and re-ran every tool call.
    const priorConversation = [
      { role: 'user', content: 'do the task' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'web_search', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"results":[]}' }] },
    ];
    fake.setScript([{ status: 200, body: okBody('{"value":9}') }]);
    const harness = makeFakeRunContext({
      jobId: JOB_ID,
      existingCheckpoint: {
        schema_version: 1,
        iteration: 2,
        restore_count: 0,
        messages: priorConversation,
      },
    });

    const outcome = await runLoop(makeConfig(), harness);
    expect(outcome.success).toBe(true);

    // The restored turns were sent, so the tool call was not repeated.
    const sent = fake.requests()[0] as { messages: unknown[] };
    expect(sent.messages).toHaveLength(priorConversation.length);
    expect(harness.events.some(e => e.message?.includes('resumed from checkpoint'))).toBe(true);
  });

  it('starts clean when the checkpoint came from a different code version', async () => {
    // Deploys happen mid-session. Replaying a message shape the running parser
    // no longer understands turns a recoverable job into a confusing one.
    fake.setScript([{ status: 200, body: okBody('{"value":1}') }]);
    const harness = makeFakeRunContext({
      jobId: JOB_ID,
      existingCheckpoint: {
        schema_version: 999,
        iteration: 3,
        restore_count: 0,
        messages: [{ role: 'user', content: 'stale shape' }],
      },
    });

    await runLoop(makeConfig(), harness);
    const sent = fake.requests()[0] as { messages: { content: unknown }[] };
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0].content).toBe('do the task');
    expect(harness.events.some(e => e.message?.includes('schema_mismatch'))).toBe(true);
  });

  it('stops resuming a conversation that has already burned its restores', async () => {
    fake.setScript([{ status: 200, body: okBody('{"value":1}') }]);
    const harness = makeFakeRunContext({
      jobId: JOB_ID,
      existingCheckpoint: {
        schema_version: 1,
        iteration: 4,
        restore_count: 2,
        messages: [{ role: 'user', content: 'poisoned turn' }],
      },
    });

    await runLoop(makeConfig(), harness);
    const sent = fake.requests()[0] as { messages: { content: unknown }[] };
    expect(sent.messages[0].content).toBe('do the task');
    expect(harness.events.some(e => e.message?.includes('restore_cap_reached'))).toBe(true);
  });

  it('does nothing at all when the context carries no job id', async () => {
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig(), harness);
    expect(outcome.success).toBe(true);
    expect(harness.checkpointWrites).toHaveLength(0);
  });
});

describe('agent loop — provider errors', () => {
  it('parses a terminal credit-exhaustion 400 into a readable failure', async () => {
    fake.setScript([{
      status: 400,
      body: errorBody('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
    }]);
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.success).toBe(false);
    expect(outcome.reason).toBe('anthropic_failed');

    const failure = harness.ofType('agent_failed')[0];
    expect(failure.message).toContain('credit balance is too low');
    expect(failure.payload?.error_type).toBe('invalid_request_error');
  });

  it('aborts the whole session on a terminal account error', async () => {
    // Production session 793cafab: five attack-research workers, the planner
    // and two engineers each hit this same 400 within 56 seconds. The pipeline
    // degraded the planner, ran to the end, and emitted session_completed on
    // five library matches.
    fake.setScript([{
      status: 400,
      body: errorBody('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
    }]);
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.success).toBe(false);
    expect(outcome.failure?.scope).toBe('account');
    expect(harness.abortCalls).toHaveLength(1);
    expect(harness.abortCalls[0].reason).toContain('credit balance is too low');

    const failure = harness.ofType('agent_failed')[0];
    expect(failure.payload?.terminal).toBe(true);
    expect(failure.payload?.error_scope).toBe('account');
  });

  it('does NOT abort the session on a request-shape 400', async () => {
    // "`temperature` is deprecated for this model" is a real production error
    // of exactly this shape. It is a code bug affecting one agent; aborting
    // every session on it would turn a one-agent bug into a total outage.
    fake.setScript([{
      status: 400,
      body: errorBody('invalid_request_error', '`temperature` is deprecated for this model.'),
    }]);
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.success).toBe(false);
    expect(outcome.failure?.scope).toBe('request');
    expect(harness.abortCalls).toHaveLength(0);
    expect(harness.ofType('agent_failed')[0].payload?.terminal).toBe(false);
  });

  it('stops at the next budget check once the session is aborted', async () => {
    // Supabase Edge has no cancellation channel, so a sibling worker cannot be
    // killed -- it observes the abort at its next tr_consume_budget call,
    // which is exactly where it would otherwise have spent money.
    const harness = makeFakeRunContext({
      budget: () => ({ allowed: false, aborted: true, reason: 'research: credit balance is too low' }),
    });
    const outcome = await runLoop(makeConfig(), harness);

    expect(outcome.reason).toBe('session_aborted');
    expect(fake.hits()).toBe(0);
    expect(harness.ofType('agent_failed')[0].message).toContain('session aborted');
  });

  it('retries a dropped connection inside the deadline', async () => {
    fake.setScript([
      { status: 200, body: '', destroy: true },
      { status: 200, body: okBody('{"value":3}') },
    ]);
    const harness = makeFakeRunContext();
    const outcome = await runLoop(makeConfig({ timeoutMs: 10_000 }), harness);

    expect(outcome.success).toBe(true);
    expect(fake.hits()).toBe(2);
  }, 15_000);

  it('keeps running when event inserts fail — telemetry must never break a run', async () => {
    const harness = makeFakeRunContext({ failEventInserts: true });
    const outcome = await runLoop(makeConfig(), harness);
    expect(outcome.success).toBe(true);
  });
});
