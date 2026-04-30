// supabase/functions/threat-research-orchestrator/lib/orchestrator.ts
//
// Drives the five-phase state machine:
//   0. preflight        (library gap awareness)
//   1. research         (Knowledge Bundle + behaviours[] in one call)
//   2. attack research  (fan out — one Attack Researcher invocation per behaviour)
//   3. detection        (per behaviour: library-first check → generate → actor-critic with QA)
//   4. finalise         (Coverage Impact + status=completed)
//
// Hard wall-clock stop at 270s of the 300s edge-function ceiling.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Budget, DEFAULT_BUDGET_CAPS } from "./budget.ts";
import { RunContext, emit } from "./events.ts";
import type { ToolContext } from "./tools/index.ts";
import type { WebSearchResult } from "../../_shared/web-search.ts";
import { runPreflight } from "./preflight.ts";
import { runResearchAgent } from "./agents/research-agent.ts";
import { runAttackResearcherForBehaviour } from "./agents/attack-researcher.ts";
import { runDetectionEngineerForBehaviour } from "./agents/detection-engineer.ts";
import { resolveQueryLanguage } from "./query-language.ts";
import type { ThreatResearchTree } from "./types.ts";

const TIME_BUDGET_MS = 270_000;

/** Cap parallel agent invocations so we don't blow Anthropic's input TPM
 *  rate limit (tier-1 is 30,000 input tokens/min for Sonnet/Opus). 2 is the
 *  highest safe concurrency given each call carries a knowledge pack
 *  (~5-10K input tokens). Combined with retry-on-429 backoff in the Anthropic
 *  adapter, this is enough to keep parallel work flowing without burning
 *  half the run on rate-limit retries. */
const FAN_OUT_CONCURRENCY = 2;

/** Run an async fn over each item with a max concurrency cap. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function runOrchestration(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  const start = Date.now();
  const budget = new Budget(DEFAULT_BUDGET_CAPS);
  const searchCache = new Map<string, WebSearchResult>();

  const runCtx: RunContext = { supabase, sessionId, userId, budget };
  const toolCtx: ToolContext = { supabase, userId, searchCache };

  await supabase
    .from('threat_research_sessions')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', sessionId);

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

    // Phase 1: research — Knowledge Bundle + behaviours
    if (Date.now() - start > TIME_BUDGET_MS) throw new Error('time_budget_exceeded');
    if (await checkCancelled()) return await markCancelled(supabase, runCtx, sessionId, start, tree, budget);
    const researchOutput = await runResearchAgent(toolCtx, runCtx, session.input_text);
    if (!researchOutput) throw new Error('research_agent_failed');
    tree.subject = researchOutput.subject;
    tree.behaviours = researchOutput.behaviours;
    await supabase
      .from('threat_research_sessions')
      .update({
        input_classification: researchOutput.subject.classification,
        tree,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Phase 2: attack research per behaviour, in PARALLEL.
    //
    // Each behaviour's deep-dive is independent — they read different parts
    // of the web. Running them sequentially turned 9 behaviours × ~60s into
    // ~9 minutes (over the wall-clock budget). Parallel collapses that to
    // roughly the slowest single invocation.
    if (Date.now() - start > TIME_BUDGET_MS) throw new Error('time_budget_exceeded');
    if (await checkCancelled()) return await markCancelled(supabase, runCtx, sessionId, start, tree, budget);
    await mapWithConcurrency(tree.behaviours, FAN_OUT_CONCURRENCY, async (behaviour) => {
      const deep = await runAttackResearcherForBehaviour(toolCtx, runCtx, tree.subject!, behaviour);
      behaviour.deep_dive = deep;
      await emit(runCtx, {
        agent: 'attack-researcher',
        event_type: 'attack_research_completed',
        message: behaviour.title,
        payload: { behaviour_id: behaviour.id, has_deep_dive: !!deep },
      });
    });
    await persistTree();

    // Phase 3: detections per behaviour, in PARALLEL.
    // Each behaviour is independently library-checked then generated; same
    // parallelisation benefit as Phase 2.
    if (Date.now() - start > TIME_BUDGET_MS) throw new Error('time_budget_exceeded');
    if (await checkCancelled()) return await markCancelled(supabase, runCtx, sessionId, start, tree, budget);
    await mapWithConcurrency(tree.behaviours, FAN_OUT_CONCURRENCY, async (behaviour) => {
      const result = await runDetectionEngineerForBehaviour(
        toolCtx, runCtx, tree.subject!, behaviour, queryLanguage,
      );
      behaviour.library_match = result.library_match;
      behaviour.opportunities = result.opportunities;
    });
    await persistTree();

    // Phase 4: finalise
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

async function computeCoverageImpact(
  _supabase: SupabaseClient,
  _userId: string,
  _tree: ThreatResearchTree,
): Promise<number> {
  return 0;
}
