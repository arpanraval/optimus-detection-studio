// supabase/functions/threat-research-orchestrator/lib/preflight.ts
//
// Phase 0 of the orchestration is now a no-op transition. The previous
// implementation ran a library_search against the raw user input and reported
// "X detections similar to this input, mentioning Y MITRE techniques". That
// was structurally misleading:
//   - We have not produced any behaviours or detection candidates yet, so
//     there is nothing real to "check coverage of".
//   - The hybrid_search RPC has no minimum-similarity floor on the keyword
//     side, so the result count was always cap-fill regardless of input.
//   - Aggregating MITRE technique IDs from those top-N rows produced a
//     "techniques mentioned" stat that bore no relationship to whether the
//     library actually covers the input.
//
// Per-behaviour library coverage IS still done — see checkLibraryCoverage in
// detection-engineer.ts which runs AFTER research has produced behaviours.
// That signal is honest because it knows what it's matching against.
//
// We keep the phase row in the queue so phase progression (preflight →
// research) doesn't need a migration; the worker just emits a "skipped" event
// and writes a zeroed summary.

import { ToolContext } from "./tools/index.ts";
import { RunContext, emit } from "./events.ts";
import type { PreflightSummary } from "./types.ts";

export async function runPreflight(
  _toolCtx: ToolContext,
  runCtx: RunContext,
  _inputText: string,
): Promise<PreflightSummary> {
  await emit(runCtx, {
    agent: 'preflight',
    event_type: 'preflight_started',
    message: 'preflight skipped — coverage is assessed per-behaviour after research',
  });

  const summary: PreflightSummary = {
    library_hits: 0,
    techniques_seen_in_hits: [],
    skipped: true,
    ran_at: new Date().toISOString(),
  };

  await emit(runCtx, {
    agent: 'preflight',
    event_type: 'preflight_completed',
    duration_ms: 0,
    payload: { skipped: true },
  });

  return summary;
}
