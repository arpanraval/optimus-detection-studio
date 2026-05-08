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
  spend: { toolCalls?: number; modelCalls?: number; tokens?: number },
): Promise<BudgetSpendResult> {
  const { data, error } = await ctx.supabase.rpc('tr_consume_budget', {
    p_session_id: ctx.sessionId,
    p_tool_calls: spend.toolCalls ?? 0,
    p_model_calls: spend.modelCalls ?? 0,
    p_tokens: spend.tokens ?? 0,
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
