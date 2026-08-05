// supabase/functions/threat-research-orchestrator/lib/events.ts
//
// Append-only event emitter. Writes one row per agent decision to
// threat_research_events. The UI subscribes via Supabase Realtime and renders
// a live activity console.
//
// Also hosts the session-level budget gate (consumeBudget) — replaces the
// per-worker in-memory Budget class. The Postgres RPC tr_consume_budget
// atomically checks-and-increments token / tool-call / model-call counters
// on the session row, so concurrent workers can't both pass the cap check
// and then both spend.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { ResearchAgent, ResearchEventType } from "./types.ts";

export interface RunContext {
  /** Service-role client used by all orchestrator-side writes. */
  supabase: SupabaseClient;
  sessionId: string;
  /** User the session belongs to. Used by Cost Center telemetry to attribute
   *  per-agent spend. */
  userId: string;
  /** Date.now() at the top of runJob, when this worker invocation claimed
   *  the job. Lets runAgentLoop check real remaining wall-clock time against
   *  the platform's ~400s edge-worker ceiling before starting an iteration
   *  that can't finish — see agent-loop.ts's job-wall-budget guard. Optional
   *  only so RunContext values built outside runJob (tests, etc.) don't need
   *  to supply it; the guard no-ops when absent. */
  jobStartedAt?: number;
  /** The job row this worker claimed. Keys the resumable conversation
   *  checkpoint (see agents/checkpoint.ts) so a reaper-reset retry continues
   *  where the killed attempt stopped instead of restarting from message zero.
   *  Optional so RunContext values built outside runJob (tests, one-off
   *  tooling) need not supply it; checkpointing simply no-ops when absent. */
  jobId?: string;
  /** Which pipeline phase this worker is running. Selects the phase token
   *  floor so an overrunning research phase cannot consume the budget
   *  reserved for detection and QA — the starvation behind 199 recorded
   *  "model-call budget exhausted" failures. Optional; work without a phase
   *  draws only on the session budget. */
  phase?: string;
}

export interface EmitEvent {
  agent: ResearchAgent;
  event_type: ResearchEventType;
  message?: string;
  duration_ms?: number;
  payload?: unknown;
  narration?: string;
}

/** Truncate a JSON-stringifiable value to fit in the events table's payload. */
function truncateJson(value: unknown, maxBytes: number): unknown | null {
  if (value == null) return null;
  try {
    const text = JSON.stringify(value);
    if (text.length <= maxBytes) return value;
    return { _truncated: true, preview: text.slice(0, maxBytes) };
  } catch {
    return { _serialise_failed: true };
  }
}

export async function emit(ctx: RunContext, ev: EmitEvent): Promise<void> {
  const payload = ev.payload != null ? truncateJson(ev.payload, 4000) : null;
  const narration = ev.narration ? ev.narration.slice(0, 1000) : null;

  const { error } = await ctx.supabase.from('threat_research_events').insert({
    session_id:  ctx.sessionId,
    user_id:     ctx.userId,
    agent:       ev.agent,
    event_type:  ev.event_type,
    message:     ev.message ?? null,
    duration_ms: ev.duration_ms ?? null,
    payload,
    narration,
  });

  if (error) {
    // Never fail the run because of telemetry — log and continue.
    console.warn('[events] insert failed:', error.message);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Session-level budget gate (replaces the in-memory Budget class)
// ────────────────────────────────────────────────────────────────────────────

export interface BudgetSpendResult {
  allowed: boolean;
  /** The session was aborted by a terminal, account-scoped provider failure.
   *  Distinct from `allowed: false` on a cap: there is nothing to retry and no
   *  other leaf will fare better, so the caller should stop rather than record
   *  a per-leaf failure. */
  aborted?: boolean;
  reason?: string;
  tool_used?: number;
  tool_cap?: number;
  model_used?: number;
  model_cap?: number;
  tokens_used?: number;
}

/** Check + atomically increment the session-level budget. Caps live in the
 *  RPC (tool=30, model=40, tokens are alarm-only). Returns `allowed: false`
 *  when a hard cap would be exceeded; the agent loop aborts in that case. */
export async function consumeBudget(
  ctx: RunContext,
  spend: {
    toolCalls?: number;
    modelCalls?: number;
    tokens?: number;
    /** Worst-case tokens this call may use, held against the cap until the
     *  real usage settles. Without it, concurrent workers each pass a gate
     *  that only sees committed spend and collectively overshoot. */
    tokensReserve?: number;
    /** Release a reservation made earlier by this same call. */
    tokensRelease?: number;
    /** Which phase floor to draw from. Omit for unbudgeted work. */
    phase?: string;
  },
): Promise<BudgetSpendResult> {
  const { data, error } = await ctx.supabase.rpc('tr_consume_budget', {
    p_session_id: ctx.sessionId,
    p_tool_calls: spend.toolCalls ?? 0,
    p_model_calls: spend.modelCalls ?? 0,
    p_tokens: spend.tokens ?? 0,
    p_phase: spend.phase ?? null,
    p_tokens_reserve: spend.tokensReserve ?? 0,
    p_tokens_release: spend.tokensRelease ?? 0,
  });
  if (error) {
    console.warn('[budget] tr_consume_budget rpc failed:', error.message);
    // Fail open: if the RPC errors we still let the call proceed. The hard
    // wall-clock + per-call timeouts are the load-bearing limits; this is a
    // belt, not the suspenders.
    return { allowed: true };
  }
  return data as BudgetSpendResult;
}

/** Abort the whole session after a terminal, account-scoped provider failure.
 *
 *  Called when the adapter classifies a failure as `scope: 'account'` — credit
 *  exhaustion, a bad key, a permission denial. Those are true of every
 *  concurrent worker, so failing leaves one at a time just spends the rest of
 *  the session's latency discovering the same fact N times, and then reports
 *  whatever partial output survived as a success.
 *
 *  The RPC is idempotent, so the several workers that hit the failure in the
 *  same second all call this and only the first takes effect.
 *
 *  Fail-open on RPC error, like consumeBudget: a telemetry or control-plane
 *  fault must never be the thing that breaks a run. The worst case is the old
 *  behaviour. */
export async function abortSession(ctx: RunContext, reason: string): Promise<void> {
  const { error } = await ctx.supabase.rpc('tr_abort_session', {
    p_session_id: ctx.sessionId,
    p_reason: reason.slice(0, 500),
  });
  if (error) {
    console.warn('[abort] tr_abort_session rpc failed:', error.message);
  }
}
