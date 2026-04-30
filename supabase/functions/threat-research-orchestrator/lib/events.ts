// supabase/functions/threat-research-orchestrator/lib/events.ts
//
// Append-only event emitter. Writes one row per agent decision to
// threat_research_events. The UI subscribes via Supabase Realtime and renders
// a live activity console.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { Budget } from "./budget.ts";
import type { ResearchAgent, ResearchEventType } from "./types.ts";

export interface RunContext {
  /** Service-role client used by all orchestrator-side writes. */
  supabase: SupabaseClient;
  /** Service-role key, available to the agent loop for fetch-based ai-generate calls. */
  serviceRoleKey: string;
  sessionId: string;
  userId: string;
  budget: Budget;
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
