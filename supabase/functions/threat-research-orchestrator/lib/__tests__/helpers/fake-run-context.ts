// supabase/functions/threat-research-orchestrator/lib/__tests__/helpers/fake-run-context.ts
//
// A RunContext backed by an in-memory fake instead of Supabase.
//
// The agent loop touches the database in exactly two ways: it appends events,
// and it calls the tr_consume_budget RPC as an atomic check-and-spend gate.
// Faking those two is enough to drive every lifecycle path -- budget
// exhaustion, validation retries, the job-wall-budget guard, terminal provider
// errors -- with no network and no credentials.
//
// Events are captured rather than discarded: what the pipeline emits IS its
// observable contract, and several real defects (the missing 'dossier' value in
// the events CHECK constraint; a phase running with no trace at all) were
// invisible precisely because nothing asserted on them.

import type { RunContext, BudgetSpendResult } from '../../events.ts';

export interface CapturedEvent {
  agent: string;
  event_type: string;
  message: string | null;
  duration_ms: number | null;
  payload: Record<string, unknown> | null;
  narration: string | null;
}

export interface FakeRunContext {
  ctx: RunContext;
  events: CapturedEvent[];
  /** Events of one type, in order. */
  ofType(type: string): CapturedEvent[];
  /** The reason field carried by the last agent_failed event, if any. */
  lastFailureReason(): string | undefined;
  /** How many times the budget gate was consulted, and for what. */
  budgetCalls: { toolCalls: number; modelCalls: number; tokens: number }[];
  /** Session aborts requested. Should be empty unless a terminal,
   *  account-scoped provider failure occurred. */
  abortCalls: { reason: string }[];
}

export interface FakeRunContextOptions {
  sessionId?: string;
  userId?: string;
  jobStartedAt?: number;
  /** Decides each budget request. Default: always allowed. */
  budget?: (
    spend: { toolCalls: number; modelCalls: number; tokens: number },
    callIndex: number,
  ) => BudgetSpendResult;
  /** Make the events insert fail, to prove telemetry failures never break a
   *  run (events.ts deliberately swallows them). */
  failEventInserts?: boolean;
}

export function makeFakeRunContext(options: FakeRunContextOptions = {}): FakeRunContext {
  const events: CapturedEvent[] = [];
  const budgetCalls: { toolCalls: number; modelCalls: number; tokens: number }[] = [];
  const abortCalls: { reason: string }[] = [];

  const supabase = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === 'threat_research_events') {
            events.push({
              agent: row.agent as string,
              event_type: row.event_type as string,
              message: (row.message as string) ?? null,
              duration_ms: (row.duration_ms as number) ?? null,
              payload: (row.payload as Record<string, unknown>) ?? null,
              narration: (row.narration as string) ?? null,
            });
          }
          return Promise.resolve(
            options.failEventInserts
              ? { error: { message: 'fake insert failure' } }
              : { error: null },
          );
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'tr_abort_session') {
        abortCalls.push({ reason: String(args.p_reason ?? '') });
        return Promise.resolve({ data: { aborted: true }, error: null });
      }
      if (fn !== 'tr_consume_budget') {
        return Promise.resolve({ data: null, error: null });
      }
      const spend = {
        toolCalls: (args.p_tool_calls as number) ?? 0,
        modelCalls: (args.p_model_calls as number) ?? 0,
        tokens: (args.p_tokens as number) ?? 0,
      };
      const index = budgetCalls.length;
      budgetCalls.push(spend);
      const decide = options.budget ?? (() => ({ allowed: true }));
      return Promise.resolve({ data: decide(spend, index), error: null });
    },
  };

  const ctx = {
    supabase,
    sessionId: options.sessionId ?? '00000000-0000-4000-8000-000000000001',
    userId: options.userId ?? '00000000-0000-4000-8000-000000000002',
    jobStartedAt: options.jobStartedAt,
  } as unknown as RunContext;

  return {
    ctx,
    events,
    budgetCalls,
    abortCalls,
    ofType: (type) => events.filter(e => e.event_type === type),
    lastFailureReason: () => {
      const failures = events.filter(e => e.event_type === 'agent_failed');
      const last = failures[failures.length - 1];
      return last?.payload?.reason as string | undefined;
    },
  };
}

/** A budget decider that allows the first `n` model calls and then refuses --
 *  the exact production shape where a session burns its cap and every
 *  remaining leaf dies with "model-call budget exhausted". */
export function budgetAllowingModelCalls(n: number) {
  let modelCallsSeen = 0;
  return (spend: { modelCalls: number }): BudgetSpendResult => {
    if (spend.modelCalls > 0) {
      modelCallsSeen += spend.modelCalls;
      if (modelCallsSeen > n) {
        return {
          allowed: false,
          reason: `model-call cap reached (${n}/${n})`,
          model_used: n,
          model_cap: n,
        };
      }
    }
    return { allowed: true };
  };
}
