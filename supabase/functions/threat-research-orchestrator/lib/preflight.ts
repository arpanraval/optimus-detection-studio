// supabase/functions/threat-research-orchestrator/lib/preflight.ts
//
// Phase 0 of the orchestration: lightweight gap awareness. Use library_search
// to surface existing detections that may already cover the input. Records a
// PreflightSummary into the tree before the heavy agents fire.

import { ToolContext } from "./tools/index.ts";
import { handleLibrarySearch } from "./tools/library-search.ts";
import { RunContext, emit } from "./events.ts";
import type { PreflightSummary } from "./types.ts";

export async function runPreflight(
  toolCtx: ToolContext,
  runCtx: RunContext,
  inputText: string,
): Promise<PreflightSummary> {
  await emit(runCtx, {
    agent: 'preflight',
    event_type: 'preflight_started',
    message: 'gap awareness check',
  });

  const startedAt = Date.now();
  const { hits } = await handleLibrarySearch(toolCtx.supabase, { query: inputText, limit: 30 });

  const seenTechs = new Set<string>();
  for (const h of hits) {
    for (const t of h.mitre_technique_ids ?? []) {
      if (t) seenTechs.add(t);
    }
  }

  const summary: PreflightSummary = {
    existing_coverage_pct: null,        // populated only when a portfolio metric exists
    covered_techniques: Array.from(seenTechs),
    gap_techniques: [],                 // intentionally empty in v1; UI computes diff
    skipped: false,
    ran_at: new Date().toISOString(),
  };

  await emit(runCtx, {
    agent: 'preflight',
    event_type: 'preflight_completed',
    duration_ms: Date.now() - startedAt,
    payload: { covered_techniques_count: summary.covered_techniques.length, library_hits: hits.length },
  });

  return summary;
}
