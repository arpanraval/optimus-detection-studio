// supabase/functions/threat-research-orchestrator/lib/orchestrator.ts
//
// Drives the five-phase state machine:
//   0. preflight (library gap awareness)
//   1. research  (Subject Brief)
//   2. behaviours (Attack Researcher)
//   3. detections (Detection Engineer ↔ QA actor-critic, per behaviour)
//   4. finalise  (Coverage Impact + status=completed)
//
// Hard wall-clock stop at 270s of the 300s edge-function ceiling.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Budget, DEFAULT_BUDGET_CAPS } from "./budget.ts";
import { RunContext, emit } from "./events.ts";
import type { ToolContext } from "./tools/index.ts";
import type { WebSearchResult } from "../../_shared/web-search.ts";
import { runPreflight } from "./preflight.ts";
import { runResearchAgent } from "./agents/research-agent.ts";
import { runAttackResearcher } from "./agents/attack-researcher.ts";
import { runDetectionEngineerForBehaviour } from "./agents/detection-engineer.ts";
import { resolveQueryLanguage } from "./query-language.ts";
import type { ThreatResearchTree } from "./types.ts";

const TIME_BUDGET_MS = 270_000;

export async function runOrchestration(
  supabase: SupabaseClient,
  serviceRoleKey: string,
  sessionId: string,
  userId: string,
): Promise<void> {
  const start = Date.now();
  const budget = new Budget(DEFAULT_BUDGET_CAPS);
  const searchCache = new Map<string, WebSearchResult>();

  const runCtx: RunContext = { supabase, serviceRoleKey, sessionId, userId, budget };
  const toolCtx: ToolContext = { supabase, userId, searchCache };

  // Mark running.
  await supabase
    .from('threat_research_sessions')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  // Load the session row + env profile snapshot.
  const { data: session } = await supabase
    .from('threat_research_sessions')
    .select('id, input_text, status')
    .eq('id', sessionId)
    .single();
  if (!session) {
    console.warn('[orchestrator] session disappeared before run', sessionId);
    return;
  }

  const { data: envProfile } = await supabase
    .from('environment_profiles')
    .select('siem_platforms, log_sources, edr_tools, custom_log_sources, cloud_platforms, industry, crown_jewels')
    .eq('user_id', userId)
    .maybeSingle();

  await supabase
    .from('threat_research_sessions')
    .update({ environment_snapshot: envProfile ?? null })
    .eq('id', sessionId);

  const queryLanguage = resolveQueryLanguage(envProfile);

  const tree: ThreatResearchTree = {
    subject: null,
    preflight: null,
    behaviours: [],
    open_questions: [],
  };
  const persistTree = () => persistSessionTree(supabase, sessionId, tree);

  const checkCancelled = async (): Promise<boolean> => {
    const { data } = await supabase
      .from('threat_research_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    return data?.status === 'cancelled';
  };

  try {
    // Phase 0: preflight
    if (Date.now() - start > TIME_BUDGET_MS) throw new Error('time_budget_exceeded');
    if (await checkCancelled()) return await markCancelled(supabase, runCtx, sessionId, start, tree, budget);
    tree.preflight = await runPreflight(toolCtx, runCtx, session.input_text);
    await persistTree();

    // Phase 1: research subject
    if (Date.now() - start > TIME_BUDGET_MS) throw new Error('time_budget_exceeded');
    if (await checkCancelled()) return await markCancelled(supabase, runCtx, sessionId, start, tree, budget);
    tree.subject = await runResearchAgent(toolCtx, runCtx, session.input_text);
    if (!tree.subject) {
      throw new Error('research_agent_failed');
    }
    await supabase
      .from('threat_research_sessions')
      .update({ input_classification: tree.subject.classification, tree, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    // Phase 2: behaviours
    if (Date.now() - start > TIME_BUDGET_MS) throw new Error('time_budget_exceeded');
    if (await checkCancelled()) return await markCancelled(supabase, runCtx, sessionId, start, tree, budget);
    tree.behaviours = await runAttackResearcher(toolCtx, runCtx, tree.subject);
    await persistTree();

    // Phase 3: detections — sequentially per behaviour, persist after each.
    for (const behaviour of tree.behaviours) {
      if (Date.now() - start > TIME_BUDGET_MS) throw new Error('time_budget_exceeded');
      if (await checkCancelled()) return await markCancelled(supabase, runCtx, sessionId, start, tree, budget);
      behaviour.opportunities = await runDetectionEngineerForBehaviour(
        toolCtx, runCtx, behaviour, queryLanguage,
      );
      await persistTree();
    }

    // Phase 4: finalise.
    const coverageImpact = await computeCoverageImpact(supabase, userId, tree);
    await supabase
      .from('threat_research_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        coverage_impact: coverageImpact,
        tree,
        updated_at: new Date().toISOString(),
        ...budgetSnapshotToSessionFields(budget),
      })
      .eq('id', sessionId);

    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'session_completed',
      message: 'all phases completed',
      duration_ms: Date.now() - start,
      payload: { ...budget.snapshot(), behaviours: tree.behaviours.length },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    await supabase
      .from('threat_research_sessions')
      .update({
        status: 'failed',
        failure_reason: reason,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        tree,
        updated_at: new Date().toISOString(),
        ...budgetSnapshotToSessionFields(budget),
      })
      .eq('id', sessionId);
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'session_failed',
      message: reason,
      duration_ms: Date.now() - start,
      payload: budget.snapshot(),
    });
  }
}

async function persistSessionTree(supabase: SupabaseClient, sessionId: string, tree: ThreatResearchTree): Promise<void> {
  await supabase
    .from('threat_research_sessions')
    .update({ tree, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

async function markCancelled(
  supabase: SupabaseClient,
  runCtx: RunContext,
  sessionId: string,
  start: number,
  tree: ThreatResearchTree,
  budget: Budget,
): Promise<void> {
  await supabase
    .from('threat_research_sessions')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      tree,
      updated_at: new Date().toISOString(),
      ...budgetSnapshotToSessionFields(budget),
    })
    .eq('id', sessionId);
  await emit(runCtx, {
    agent: 'orchestrator',
    event_type: 'session_cancelled',
    message: 'session cancelled by user',
    duration_ms: Date.now() - start,
  });
}

function budgetSnapshotToSessionFields(budget: Budget): Record<string, unknown> {
  const s = budget.snapshot();
  return {
    total_tokens: s.tokens_used,
    tool_calls_used: s.tool_calls_used,
  };
}

/**
 * Coverage Impact: the gap-score lift this research produced once detections
 * are saved. At session completion, no detections are saved yet — we return
 * 0; the impact recomputes on the save flow (client-side or via a future
 * recompute hook). The badge auto-hides when 0/null.
 */
async function computeCoverageImpact(
  _supabase: SupabaseClient,
  _userId: string,
  _tree: ThreatResearchTree,
): Promise<number> {
  return 0;
}
