// supabase/functions/threat-research-orchestrator/lib/orchestrator.ts
//
// Threat Research orchestrator — JOB WORKER.
//
// Each invocation processes ONE row from public.threat_research_jobs and
// runs ONE phase (or one leaf within a fan-out phase) to completion. After
// the work is done the worker uses the SQL helper public.threat_research_
// promote_phase to atomically insert and dispatch the next-phase job(s),
// taking a session-scoped advisory lock to make fan-in race-free.
//
// Why this shape: Supabase Edge terminates background workers somewhere
// between 150-250s, which is too short for the multi-agent multi-LLM
// pipeline this orchestrator runs end-to-end. By splitting the pipeline
// into independent job rows and giving each its own fresh edge-function
// lifetime, every agent gets all the time it needs (full actor-critic,
// full agent loop iteration cap, no withTimeout) without ever crashing
// against the platform cap.
//
// Phase progression (each row is one job):
//   preflight            → research              (singleton)
//   research             → attack_research × N   (fan-out, one job per behaviour)
//   attack_research × N  → opportunity_planning  (fan-in, singleton)
//   opportunity_planning → detection × N         (fan-out per canonical opportunity)
//   detection × N        → finalise              (fan-in)
//   finalise                                       (singleton; marks session completed)
//
// The attack_research fan-out is LOAD-BEARING, not incidental. Supabase kills
// an edge worker at ~400s, and the measured Sonnet generation rate here is
// ~57 tokens/s (5,338 output tokens in 93s on a real research synthesis call).
// That puts a hard ceiling of roughly 19K output tokens on ANY single model
// call in this pipeline. Splitting the deep-dive work across one worker per
// behaviour is what keeps every individual call under that ceiling while
// still producing far more total output than one call ever could
// (6,144 + N×8,192 ≈ 71K tokens for an 8-behaviour subject).
//
// 2026-07-29: this phase was briefly merged into `research` as a single
// "Dossier Agent" call with maxTokens 32,768 (~575s of generation at the
// measured rate). Every session failed with "reaper: worker exceeded
// edge-function lifetime" — the call cannot finish inside one worker on any
// subject. Reverted. Do not merge these phases again without first changing
// the per-worker execution model.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { RunContext, emit } from "./events.ts";
import type { ToolContext } from "./tools/index.ts";
import type { WebSearchResult } from "../../_shared/web-search.ts";
import type { WebFetchResult } from "../../_shared/web-fetch.ts";
import { runPreflight } from "./preflight.ts";
import { runResearchAgent } from "./agents/research-agent.ts";
import { runAttackResearcherForBehaviour } from "./agents/attack-researcher.ts";
import { runOpportunityPlanner, toDetectionOpportunity } from "./agents/opportunity-planner.ts";
import {
  checkLibraryCoverage,
  generateDetectionForOpportunity,
  refineDetectionViaActorCritic,
} from "./agents/detection-engineer.ts";
// isDeployedCoverage / isLanguageRunnable are now DISPLAY helpers only — they
// annotate the reused leaf, they no longer gate whether a rule is reused.
import { isDeployedCoverage, isLanguageRunnable, adjudicateReuse } from "./coverage.ts";
import { resolveQueryTarget, supportsDefenderSchemaValidation } from "./query-language.ts";
import { flagCrossBehaviourDuplicates } from "./dedup.ts";
import { loadKnowledgePack } from "./skills-loader.ts";
import { buildActorCoverageSeed } from "./actor-coverage.ts";
import {
  fetchTechniqueTactics,
  filterTacticInconsistent,
  findUnverifiedMitreIds,
} from "./mitre-validator.ts";
import { validateKqlAgainstDefenderSchema } from "./tools/defender-schema-lookup.ts";
import { runDetectionValidators } from "./validators/index.ts";
import { sizeAfterResearch, sizeAfterPlanning } from "./budget-policy.ts";
import { summariseYield, deriveSessionStatus } from "./readiness.ts";
import type {
  DetectionOpportunity,
  GeneratedDetection,
  LibraryNearMatch,
  ResearchQueryLanguage,
  ThreatResearchTree,
} from "./types.ts";

// ────────────────────────────────────────────────────────────────────────────
// Job row shape
// ────────────────────────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  session_id: string;
  phase: 'preflight' | 'research' | 'attack_research' | 'opportunity_planning' | 'detection' | 'qa' | 'finalise';
  /** For attack_research: the behaviour id (for example "b1").
   *  For detection: composite "{primary_behaviour_id}/{opportunity_id}"
   *  (e.g. "b1/o3") — detection is now per canonical opportunity, not
   *  per behaviour, since the Opportunity Planner runs upstream.
   *  For qa: same composite format as detection.
   *  Null for singleton phases (preflight, research, opportunity_planning,
   *  finalise). */
  behaviour_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempt_count: number;
  failure_reason: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

/** Run one job to completion. Called by the edge-function entry on
 *  ?action=run_job. Idempotent — duplicate dispatch of the same job_id is
 *  safe (second worker sees status='completed' and bails). */
export async function runJob(supabase: SupabaseClient, jobId: string): Promise<void> {
  const start = Date.now();

  // 1. Claim the job ATOMICALLY via RPC — this is the only place
  //    attempt_count gets bumped. Without it, the reaper's Tier-1 hard kill
  //    (attempt >= 3) never fires and stuck jobs loop forever via Tier-2
  //    resets. RPC returns 0 rows when the job is already terminal.
  const { data: claimedRows, error: claimErr } = await supabase.rpc('tr_claim_job', {
    p_job_id: jobId,
  });

  if (claimErr) {
    console.error('[worker] failed to claim job', jobId, claimErr);
    return;
  }
  const claimed = Array.isArray(claimedRows) && claimedRows.length > 0 ? claimedRows[0] : null;
  if (!claimed) {
    console.log('[worker] job already terminal, skipping', jobId);
    return;
  }
  const job = claimed as JobRow;

  // Visibility: when attempt_count > 1 the reaper reset this job after a
  // prior worker stalled / died / failed validation. Surface that in the
  // activity console so a session that "looks like one attempt" but is
  // actually a retry can be debugged. We don't have session context yet
  // (loaded below) so emit through a minimal runCtx stub — the inserted
  // row carries the agent, type, and payload regardless of session/user
  // resolution.
  if (job.attempt_count > 1) {
    await supabase.from('threat_research_events').insert({
      session_id: job.session_id,
      user_id: null, // resolved at fetch time by RLS via session
      agent: 'orchestrator',
      event_type: 'job_resumed',
      message: `worker claimed ${job.phase} job ${job.behaviour_id ?? '(singleton)'} on attempt ${job.attempt_count}`,
      payload: {
        job_id: job.id,
        phase: job.phase,
        behaviour_id: job.behaviour_id,
        attempt_count: job.attempt_count,
        prior_failure_reason: job.failure_reason,
      },
    }).then(
      () => {/* fire-and-forget */},
      (e) => console.warn('[worker] job_resumed event insert failed:', e?.message ?? e),
    );
  }

  // 2. Load session + tree + ensure session is marked running.
  const { data: session, error: sessionErr } = await supabase
    .from('threat_research_sessions')
    .select('id, user_id, input_text, status, tree, environment_snapshot')
    .eq('id', job.session_id)
    .single();
  if (sessionErr || !session) {
    await failJob(supabase, job, 'session not found');
    return;
  }
  if (session.status === 'cancelled') {
    // Session was cancelled while this job was queued; mark the job done so
    // it doesn't pin a "running" state in the queue.
    await supabase
      .from('threat_research_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), failure_reason: 'session cancelled' })
      .eq('id', job.id);
    return;
  }
  if (session.status === 'pending') {
    await supabase
      .from('threat_research_sessions')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', session.id);
  }

  const searchCache = new Map<string, WebSearchResult>();
  const fetchCache = new Map<string, WebFetchResult>();
  // jobId keys the resumable conversation checkpoint: a reaper-reset retry
  // claims the SAME job row, so the killed attempt's conversation is waiting
  // for it instead of starting over from message zero.
  const runCtx: RunContext = {
    supabase,
    sessionId: session.id,
    userId: session.user_id,
    jobStartedAt: start,
    jobId,
    phase: job.phase,
  };
  // envContextCache starts undefined; populated lazily by executeTool on
  // the first environment_context call within this worker invocation.
  const toolCtx: ToolContext = { supabase, userId: session.user_id, searchCache, fetchCache };

  // Hydrate tree (will mutate, then persist).
  const tree: ThreatResearchTree = (session.tree as ThreatResearchTree | null) ?? {
    subject: null,
    preflight: null,
    tactic_summary: [],
    behaviours: [],
    open_questions: [],
  };

  // Visibility: track exit-kind so we always emit worker_exit before
  // returning, even when an unexpected throw bubbles. If worker_exit
  // doesn't appear in the events table, the worker was killed externally
  // (platform wall-time, OOM, etc) and we know which job to investigate.
  let exitKind: 'returned' | 'threw' | 'unknown' = 'unknown';
  let exitReason: string | null = null;
  try {
    switch (job.phase) {
      case 'preflight':
        await handlePreflight(supabase, runCtx, toolCtx, session, tree);
        await markJobCompleted(supabase, job);
        await promote(supabase, session.id, 'preflight', 'research', null);
        break;

      case 'research':
        await handleResearch(supabase, runCtx, toolCtx, session, tree);
        await markJobCompleted(supabase, job);
        // Fan out one attack_research job per behaviour. Each gets its own
        // fresh edge worker, which is what keeps every deep-dive call under
        // the ~400s platform ceiling (see the header comment).
        await promote(
          supabase,
          session.id,
          'research',
          'attack_research',
          tree.behaviours.map(b => b.id),
        );
        break;

      case 'attack_research':
        if (!job.behaviour_id) throw new Error('attack_research job missing behaviour_id');
        await handleAttackResearch(supabase, runCtx, toolCtx, session.id, tree, job.behaviour_id);
        await markJobCompleted(supabase, job);
        // Throttling: dispatch the next pending sibling so we keep ~2
        // concurrent in flight (Anthropic Tier-1 TPM safety net).
        await dispatchNextInPhase(supabase, session.id, 'attack_research');
        // Fan-in to opportunity_planning (singleton). The planner dedupes the
        // behaviour-level outputs into canonical detection opportunities.
        // promote() is a no-op if siblings are still running.
        await promote(
          supabase,
          session.id,
          'attack_research',
          'opportunity_planning',
          null,
        );
        break;

      case 'opportunity_planning':
        await handleOpportunityPlanning(supabase, runCtx, toolCtx, session, tree);
        await markJobCompleted(supabase, job);
        {
          // Fan-out detection jobs by canonical opportunity (composite
          // "{primary_behaviour_id}/{opportunity_id}"). When EVERY canonical
          // opportunity was flagged not_detectable / needs_telemetry by the
          // planner (or research produced zero behaviours), the composite
          // list is empty — there's no detection work to do. Skip the
          // detection phase entirely and call the finalise gate directly;
          // it sees zero pending detection AND zero pending qa, so it fires.
          const compositeIds = collectOpportunityCompositeIds(tree);
          if (compositeIds.length === 0) {
            await promoteFinaliseIfReady(supabase, runCtx, session.id);
          } else {
            await promote(
              supabase,
              session.id,
              'opportunity_planning',
              'detection',
              compositeIds,
            );
          }
        }
        break;

      case 'detection':
        if (!job.behaviour_id) throw new Error('detection job missing composite behaviour_id');
        await handleDetection(supabase, runCtx, toolCtx, session, tree, job.behaviour_id);
        await markJobCompleted(supabase, job);
        await dispatchNextInPhase(supabase, session.id, 'detection');
        // Finalise gate: only fires when BOTH detection AND qa phases are
        // terminal. The generic promote_phase(detection → finalise) is
        // unsafe because qa jobs are enqueued by detection workers and may
        // still be pending/running when the last detection completes.
        // tr_promote_finalise_if_ready checks both phases atomically; the
        // last worker (detection or qa, whichever finishes last) fires.
        await promoteFinaliseIfReady(supabase, runCtx, session.id);
        break;

      case 'qa':
        // Stand-alone QA pass on a single opportunity. behaviour_id is the
        // composite "{behaviourId}/{opportunityId}" path. Auto-enqueued by
        // handleDetection per opportunity (decoupled from detection-engineer
        // worker so a worker death doesn't lose all in-flight QA).
        if (!job.behaviour_id) throw new Error('qa job missing composite behaviour_id');
        await handleQa(supabase, runCtx, toolCtx, session, tree, job.behaviour_id);
        await markJobCompleted(supabase, job);
        await dispatchNextInPhase(supabase, session.id, 'qa');
        // Finalise gate (see detection branch above). The RPC is idempotent
        // and uses an advisory lock so the parallel detection-side call
        // can't race against this one.
        await promoteFinaliseIfReady(supabase, runCtx, session.id);
        break;

      case 'finalise':
        await handleFinalise(supabase, runCtx, session, tree, start);
        await markJobCompleted(supabase, job);
        break;

      default:
        throw new Error(`unknown phase ${(job as JobRow).phase}`);
    }
    exitKind = 'returned';
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    exitKind = 'threw';
    exitReason = reason;
    console.error(`[worker] job ${job.id} (${job.phase}) failed:`, reason);
    await failJob(supabase, job, reason);
    // Don't persistTree here — successful mutations were already written via
    // patchBehaviour (atomic per-leaf), and a full-tree write would clobber
    // sibling workers' concurrent writes.
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'job_failed',
      message: `${job.phase}: ${reason}`,
      payload: { job_id: job.id, behaviour_id: job.behaviour_id, attempt: job.attempt_count + 1 },
    });
  } finally {
    // ALWAYS emit worker_exit, even on uncaught throws or partial state.
    // If we see this event, the worker reached the end of its body.
    // If we DON'T see it, the platform killed the isolate.
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'worker_exit',
      message: `worker exit (${exitKind})${exitReason ? `: ${exitReason}` : ''}`,
      duration_ms: Date.now() - start,
      payload: {
        job_id: job.id,
        phase: job.phase,
        behaviour_id: job.behaviour_id,
        attempt_count: job.attempt_count,
        exit_kind: exitKind,
        exit_reason: exitReason,
      },
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase handlers
// ────────────────────────────────────────────────────────────────────────────

async function handlePreflight(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  session: { id: string; input_text: string; environment_snapshot: unknown },
  tree: ThreatResearchTree,
): Promise<void> {
  // Prime environment snapshot once, on the very first phase, so all
  // downstream agents see the same env without re-querying per leaf.
  if (!session.environment_snapshot) {
    await primeEnvironmentSnapshot(supabase, runCtx.userId, session.id);
  }

  // Preflight now runs the input classifier and seeds tree.subject with the
  // classification + canonical name. Research Agent reads tree.subject.
  // classification to pick its workflow lane (CVE vs Actor vs Technique
  // vs Concept) and fills in the rest of the subject fields on return.
  const result = await runPreflight(toolCtx, runCtx, session.input_text);
  tree.preflight = result.summary;
  if (result.subject_stub) {
    tree.subject = {
      classification: result.subject_stub.classification,
      subject: result.subject_stub.subject,
      brief: '',
      intel_summary: {},
      citations: [],
    };
  }

  await persistTree(supabase, session.id, tree);
}

async function handleResearch(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  session: { id: string; input_text: string },
  tree: ThreatResearchTree,
): Promise<void> {
  // Classification was set by preflight. Pass it into the Research Agent
  // so it can pick the workflow lane (CVE / actor / technique / concept).
  // If preflight wasn't run (legacy session shape), default to concept
  // workflow — same fallback the classifier itself uses.
  const classification = tree.subject?.classification ?? 'concept';
  const subjectFromPreflight = tree.subject;

  const out = await runResearchAgent(toolCtx, runCtx, session.input_text, classification);
  if (!out) throw new Error('research_agent_failed');

  // Post-step: validate every emitted MITRE technique ID against the canonical
  // mitre_techniques table. Hallucinated IDs are surfaced via `unverified_mitre_ids`
  // on each behaviour — the model's claim is preserved, just flagged. We also
  // check tactic-technique consistency: a behaviour tagged `initial-access`
  // citing T1598.003 (canonical tactic = reconnaissance) is mis-classified.
  // Surface those via `tactic_inconsistent_mitre_ids` so QA / UI can react.
  const allIds = out.behaviours.flatMap(b => b.mitre_technique_ids);
  const unverified = new Set(await findUnverifiedMitreIds(supabase, allIds));
  const tacticsByTechnique = await fetchTechniqueTactics(supabase, allIds);
  for (const b of out.behaviours) {
    b.unverified_mitre_ids = b.mitre_technique_ids.filter(id => unverified.has(id));
    // Skip already-unverified IDs from inconsistency check (no canonical
    // tactic to compare against; they're already flagged separately).
    const verifiedIds = b.mitre_technique_ids.filter(id => !unverified.has(id));
    b.tactic_inconsistent_mitre_ids = filterTacticInconsistent(
      verifiedIds, b.tactic, tacticsByTechnique,
    );
  }

  // Preserve classification + canonical subject from preflight — preflight
  // is the authoritative source for the workflow lane. The Research Agent's
  // own subject output may differ on these fields (it operates with a copy
  // of the classification) but the orchestrator pins them to preflight's.
  // brief / intel_summary / citations come from the research agent.
  tree.subject = {
    classification: subjectFromPreflight?.classification ?? out.subject.classification,
    subject:        subjectFromPreflight?.subject        ?? out.subject.subject,
    brief:          out.subject.brief,
    intel_summary:  out.subject.intel_summary,
    citations:      out.subject.citations,
  };
  tree.tactic_summary = out.tactic_summary;
  tree.behaviours = out.behaviours;

  // Actor-tagged coverage seed: empty for non-actor threats (CVEs, generic
  // concepts), substantive for groups/campaigns. Built once here so every
  // downstream detection job can read it from the tree without re-querying.
  // Best-effort: a failure leaves the field absent; the engineer continues
  // with per-behaviour vector search alone.
  try {
    tree.actor_coverage_seed = await buildActorCoverageSeed(supabase, out.subject, runCtx.userId);
    if (tree.actor_coverage_seed.length > 0) {
      await emit(runCtx, {
        agent: 'orchestrator',
        event_type: 'preflight_completed',
        message: `Actor coverage seed: ${tree.actor_coverage_seed.length} library detections tagged with this actor's aliases`,
        payload: { count: tree.actor_coverage_seed.length },
      });
    }
  } catch (e) {
    console.warn('[handleResearch] actor coverage seed build failed:', (e as Error).message);
    tree.actor_coverage_seed = [];
  }

  // Stage-based budget. The initial cap covers the pre-opportunity phases:
  //   classifier (preflight):      1 call
  //   research (singleton):         up to 5 calls
  //   attack_research x N:          up to 6 calls per independent worker
  //   opportunity_planning:        ~3-6 calls (iter cap 6, singleton)
  // handleOpportunityPlanning bumps the cap (via tr_bump_caps) once M
  // canonical opportunities are known, sizing for the detection + qa
  // per-opportunity work that follows.
  //
  // 25 + 6*N retains retry headroom across research, the per-behaviour
  // attack-research fan-out and planning. It is a ceiling, not a target.
  const N = out.behaviours.length;
  const modelCap = Math.min(800, 25 + 6 * N);
  const toolCap  = Math.min(800, 25 + 6 * N);

  await supabase
    .from('threat_research_sessions')
    .update({
      input_classification: out.subject.classification,
      tree,
      model_call_cap: modelCap,
      tool_call_cap:  toolCap,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  // Token budget with per-phase floors. Call counts above stay as a secondary
  // runaway guard, but they cannot bound spend — one 16K-token call costs
  // ~50x a 300-token one, which is why bc5804b3 used 169 calls for 1.17M
  // tokens while 048fdd12 used 28 for 165K.
  //
  // Floors matter more than the ceiling. detection and qa are sized here, on
  // an ESTIMATE of opportunities, specifically so research and attack_research
  // cannot spend that budget first. The planner re-sizes with the real count,
  // and floors may only rise.
  const budgets = sizeAfterResearch(N);
  const { error: budgetErr } = await supabase.rpc('tr_set_phase_budgets', {
    p_session_id: session.id,
    p_token_cap:  budgets.tokenCap,
    p_phases:     budgets.perPhase,
  });
  if (budgetErr) {
    // Non-fatal: an unsized session falls back to the call caps, i.e. the
    // previous behaviour. Losing a guard rail must not lose the run.
    console.warn('[handleResearch] tr_set_phase_budgets failed:', budgetErr.message);
  } else {
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'preflight_completed',
      message: budgets.capped
        // Never let a session be quietly under-funded: one that dies two
        // thirds of the way through is the exact failure being fixed, so say
        // it up front rather than let it look like a mid-run crash.
        ? `Token budget CAPPED: ${N} behaviours need more than the ${Math.round(budgets.tokenCap / 1000)}K ` +
          `session ceiling, so every phase floor was scaled down. This session may not complete all leaves.`
        : `Token budget: ${Math.round(budgets.tokenCap / 1000)}K total, ` +
          `detection ${Math.round(budgets.perPhase.detection / 1000)}K / ` +
          `qa ${Math.round(budgets.perPhase.qa / 1000)}K reserved`,
      payload: {
        token_cap: budgets.tokenCap,
        per_phase: budgets.perPhase,
        behaviours: N,
        capacity_limited: budgets.capped,
      },
    });
  }
}

/** Build the list of composite "{primary_behaviour_id}/{opportunity_id}"
 *  strings that the detection phase will fan out on. Called by the
 *  opportunity_planning promote step after the planner has populated
 *  behaviour.opportunities[]. */
function collectOpportunityCompositeIds(tree: ThreatResearchTree): string[] {
  const ids: string[] = [];
  for (const b of tree.behaviours) {
    for (const o of b.opportunities) {
      // Skip opportunities the planner explicitly flagged as not_detectable
      // or needs_telemetry — there's nothing for the engineer to do on
      // those, and enqueuing a detection job just to produce an empty
      // result wastes a worker invocation + 1+ model calls.
      if (o.detectability === 'not_detectable' || o.detectability === 'needs_telemetry') {
        continue;
      }
      ids.push(`${b.id}/${o.id}`);
    }
  }
  return ids;
}

/** One behaviour's offensive deep-dive. Runs as its OWN edge worker (one job
 *  per behaviour), which is what keeps each call comfortably under the ~400s
 *  platform ceiling — see the phase-progression note at the top of this file. */
async function handleAttackResearch(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  sessionId: string,
  tree: ThreatResearchTree,
  behaviourId: string,
): Promise<void> {
  const behaviour = tree.behaviours.find(b => b.id === behaviourId);
  if (!behaviour) throw new Error(`behaviour ${behaviourId} not in tree`);
  if (!tree.subject) throw new Error('attack_research before research');

  const deep = await runAttackResearcherForBehaviour(toolCtx, runCtx, tree.subject, behaviour);
  behaviour.deep_dive = deep; // mutate local tree so subsequent in-process reads see it

  // Atomic per-leaf write — never overwrites siblings. Multiple attack_research
  // workers running in parallel can each patch their own behaviour without
  // racing on the JSONB column.
  await patchBehaviour(supabase, sessionId, behaviour.id, { deep_dive: deep });

  await emit(runCtx, {
    agent: 'attack-researcher',
    event_type: 'attack_research_completed',
    message: behaviour.title,
    payload: { behaviour_id: behaviour.id, has_deep_dive: !!deep },
  });
}

/** Singleton phase: cluster all behaviours' attack-research outputs into
 *  canonical detection opportunities. After this phase, the tree's
 *  behaviour.opportunities[] is fully populated (with empty detection slots)
 *  and the detection phase fans out per opportunity. */
async function handleOpportunityPlanning(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  session: { id: string; environment_snapshot: unknown },
  tree: ThreatResearchTree,
): Promise<void> {
  if (!tree.subject) throw new Error('opportunity_planning before research');
  if (tree.behaviours.length === 0) {
    // Edge case: research produced zero behaviours. Nothing to plan. Skip
    // to finalise gracefully — no detection jobs will be enqueued.
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'opportunity_created',
      message: 'no behaviours to plan — session will finalise empty',
      payload: { count: 0 },
    });
    return;
  }

  const { language: queryLanguage, product: queryProduct } =
    resolveQueryTarget(session.environment_snapshot ?? null);
  const out = await runOpportunityPlanner(toolCtx, runCtx, tree.subject, tree.behaviours);
  if (!out) {
    // Planner failed. Don't blow up the session — fall back to a no-op:
    // every behaviour gets one opportunity that mirrors its title/tactic.
    // The Detection Engineer will then work per-behaviour (same as pre-PR2
    // semantics). This preserves output even when the planner step is
    // unavailable.
    //
    // CRITICAL: surface this as tree.planner_status='degraded' so the UI
    // can render a banner. Without the flag, users can't tell whether the
    // output went through proper opportunity dedup or fell back. The
    // fallback path WILL produce AF_ALG-style sibling duplicates that the
    // planner exists to merge, and downstream cost/quality differs
    // materially from the completed path.
    console.warn('[handleOpportunityPlanning] planner failed — falling back to 1:1 behaviour->opportunity');
    tree.planner_status = 'degraded';
    // Surface as an orchestrator-level event, not under planner — the
    // planner already emitted its agent_failed; this is the orchestrator's
    // decision to enter degraded mode. Distinct event_type so the activity
    // console can highlight it instead of treating it like a routine
    // opportunity_created.
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'planner_degraded',
      message: 'PLANNER DEGRADED — falling back to 1:1 behaviour→opportunity (no dedup). Detections will be generated per behaviour with no cross-behaviour deduplication. Recovery requires starting a new session.',
      payload: {
        planner_status: 'degraded',
        behaviour_count: tree.behaviours.length,
      },
    });
    for (const b of tree.behaviours) {
      const fallbackOpp: DetectionOpportunity = {
        id: 'o1',
        title: b.title,
        description: b.narrative_description,
        observable_chain: b.artefacts,
        telemetry: b.data_sources,
        mitre_technique_ids: b.mitre_technique_ids,
        tactic: b.tactic,
        primary_behaviour_id: b.id,
        source_behaviour_ids: [b.id],
        variants: [],
        detectability: 'siem',
        detectability_rationale: 'Planner unavailable; defaulting to SIEM-detectable per behaviour-level data sources.',
        detection: {
          id: 'd_o1',
          name: '',
          description: '',
          query_language: queryLanguage,
          query: '',
          mitre_technique_ids: b.mitre_technique_ids,
          unverified_mitre_ids: [],
          tactic: b.tactic,
          suggested_severity: 'Medium',
          suggested_detection_type: 'Detection',
          feasibility: 'partial',
          feasibility_notes: '',
          citations: [],
          covers_behaviour_ids: [b.id],
          qa: null,
          qa_error: null,
          saved_detection_id: null,
          archived: false,
        },
      };
      b.opportunities = [fallbackOpp];
      await patchBehaviour(supabase, session.id, b.id, { opportunities: b.opportunities });
    }
    // patchBehaviour persists each fallback leaf but cannot write this
    // top-level flag. Persist it so the UI banner and resume_session planner
    // recovery path can observe degraded mode.
    await persistTree(supabase, session.id, tree);
    return;
  }

  // Group canonical opportunities into TWO maps:
  //   byPrimary  — opportunities physically attached to this behaviour
  //                (this behaviour is the planner's primary_behaviour_id)
  //   bySource   — opportunities that REFERENCE this behaviour in their
  //                source_behaviour_ids but are physically attached
  //                elsewhere. Used to populate behaviour.merged_into_
  //                opportunity_ids so the UI can render "merged into N
  //                opportunities" instead of falsely showing not_detectable.
  const byPrimary = new Map<string, DetectionOpportunity[]>();
  const bySource  = new Map<string, Array<{ ref: string; opp: DetectionOpportunity }>>();
  for (const cop of out.opportunities) {
    const opp = toDetectionOpportunity(cop, queryLanguage);
    const primary = opp.primary_behaviour_id!;
    const list = byPrimary.get(primary) ?? [];
    // Renumber the opportunity id within the primary behaviour's scope so
    // composite ids (b1/o1, b1/o2, ...) are dense per behaviour. The
    // planner-emitted ids are globally numbered which would leave gaps.
    opp.id = `o${list.length + 1}`;
    opp.detection.id = `d_${opp.id}`;
    list.push(opp);
    byPrimary.set(primary, list);

    const compositeRef = `${primary}/${opp.id}`;
    for (const srcId of opp.source_behaviour_ids ?? []) {
      if (srcId === primary) continue; // primary attaches via byPrimary already
      const refs = bySource.get(srcId) ?? [];
      refs.push({ ref: compositeRef, opp });
      bySource.set(srcId, refs);
    }
  }

  const priority: Record<string, number> = { siem: 4, edr: 3, needs_telemetry: 2, not_detectable: 1 };

  for (const b of tree.behaviours) {
    const opps = byPrimary.get(b.id) ?? [];
    const merged = bySource.get(b.id) ?? [];
    b.opportunities = opps;
    b.merged_into_opportunity_ids = merged.map(m => m.ref);

    if (opps.length === 0 && merged.length === 0) {
      // No canonical opportunity claims this behaviour as primary AND no
      // opportunity includes it in source_behaviour_ids. Planner judged
      // it not actionable.
      b.detectability = 'not_detectable';
      b.detectability_rationale = 'Opportunity planner did not produce a detection opportunity for this behaviour.';
      b.artefacts_required = [];
    } else if (opps.length === 0 && merged.length > 0) {
      // Behaviour was merged into other behaviours' canonical opportunities.
      // Roll up detectability from the strongest covering opportunity so
      // the behaviour-level verdict reflects "this IS covered, just over
      // there". UI uses merged_into_opportunity_ids to link to the actual
      // opportunity slots.
      const bestMerged = merged.reduce((acc, m) =>
        (priority[m.opp.detectability ?? 'siem'] ?? 0) > (priority[acc.opp.detectability ?? 'siem'] ?? 0) ? m : acc,
        merged[0]);
      b.detectability = bestMerged.opp.detectability ?? 'siem';
      b.detectability_rationale = `Merged into ${merged.length} canonical opportunit${merged.length === 1 ? 'y' : 'ies'} under sibling behaviour(s). Strongest verdict: ${bestMerged.opp.detectability ?? 'siem'}.`;
      // Telemetry rollup from the canonical opportunities covering this
      // behaviour, deduped.
      b.artefacts_required = Array.from(new Set(merged.flatMap(m => m.opp.telemetry ?? [])));
    } else {
      // Behaviour has its own primary opportunities. Prefer
      // siem > edr > needs_telemetry > not_detectable for the rollup.
      const best = opps.reduce((acc, o) =>
        (priority[o.detectability ?? 'siem'] ?? 0) > (priority[acc.detectability ?? 'siem'] ?? 0) ? o : acc,
        opps[0]);
      b.detectability = best.detectability ?? 'siem';
      b.detectability_rationale = best.detectability_rationale ?? '';
      b.artefacts_required = Array.from(new Set(opps.flatMap(o => o.telemetry ?? [])));
    }
    await patchBehaviour(supabase, session.id, b.id, {
      opportunities: b.opportunities,
      merged_into_opportunity_ids: b.merged_into_opportunity_ids,
      detectability: b.detectability,
      detectability_rationale: b.detectability_rationale,
      artefacts_required: b.artefacts_required,
    });
  }

  // Mark planner success at the tree level so the UI can distinguish a
  // fully-planned result from the degraded-fallback path. Singleton phase,
  // safe to write the whole tree.
  tree.planner_status = 'completed';
  await persistTree(supabase, session.id, tree);

  // Bump the per-session budget for the detection + qa work this phase
  // just queued. Sized for single-pass QA (was 3-round actor-critic).
  // Each canonical opportunity drives:
  //   detection generation: ~3 model calls (iter cap 4 with strict tools)
  //   QA single critique:   1 model call (sometimes 2 on JSON validation)
  //   revision (only on fail): ~2 model calls (iter cap 3)
  //   tool calls: ~3 across detection turn + 0-1 in revision; QA has none
  // Sized for ~6 model calls + ~6 tool calls per opportunity, with ~50%
  // headroom for retries. The previous sizing (12/4) was tuned for the
  // actor-critic loop's 5-call worst case + reaper-driven re-execution
  // tax — both gone now.
  const oppCount = out.opportunities.length;
  if (oppCount > 0) {
    // Re-size the token floors now that the real opportunity count is known.
    // handleResearch estimated it (behaviours / 1.5) so detection and qa had a
    // reservation before this phase could spend against it; this replaces the
    // estimate with the measurement. tr_set_phase_budgets only ever RAISES a
    // floor, so a planner that merged aggressively cannot retroactively starve
    // a phase that has already begun spending.
    const planned = sizeAfterPlanning(tree.behaviours.length, oppCount);
    const { error: tokenBudgetErr } = await supabase.rpc('tr_set_phase_budgets', {
      p_session_id: session.id,
      p_token_cap:  planned.tokenCap,
      p_phases:     planned.perPhase,
    });
    if (tokenBudgetErr) {
      console.warn('[handleOpportunityPlanning] tr_set_phase_budgets failed:', tokenBudgetErr.message);
    }

    const { error: bumpErr } = await supabase.rpc('tr_bump_caps', {
      p_session_id: session.id,
      p_model_delta: 12 * oppCount,
      p_tool_delta: 8 * oppCount,
    });
    if (bumpErr) {
      console.warn(`[handleOpportunityPlanning] tr_bump_caps failed:`, bumpErr.message);
    }
  }
}

async function handleDetection(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  session: { id: string; user_id: string; input_text: string; environment_snapshot: unknown },
  tree: ThreatResearchTree,
  compositeId: string,
): Promise<void> {
  // PR2: detection runs per canonical opportunity. behaviour_id is the
  // composite "{primary_behaviour_id}/{opportunity_id}" path (same convention
  // qa already uses). The Opportunity Planner upstream produced the
  // opportunity stubs; this phase fills in detection.{name, query, ...}.
  const slash = compositeId.indexOf('/');
  if (slash < 0) throw new Error(`detection job behaviour_id must be "{primary_behaviour}/{opportunity}", got ${compositeId}`);
  const behaviourId = compositeId.slice(0, slash);
  const opportunityId = compositeId.slice(slash + 1);

  const behaviour = tree.behaviours.find(b => b.id === behaviourId);
  if (!behaviour) throw new Error(`behaviour ${behaviourId} not in tree`);
  if (!tree.subject) throw new Error('detection before research');
  const opp = behaviour.opportunities.find(o => o.id === opportunityId);
  if (!opp) throw new Error(`opportunity ${behaviourId}/${opportunityId} not in tree (planner missed it?)`);

  const { language: queryLanguage, product: queryProduct } =
    resolveQueryTarget(session.environment_snapshot ?? null);

  // Refresh the actor coverage seed at job start. The seed is built once
  // when Research completes, but a session can run for 30+ minutes — and
  // users may add detections to their library mid-session that the seed
  // wouldn't know about. Cheap to re-fetch (one library_search call) and
  // keeps the engineer up-to-date with the user's current library shape.
  // Falls back to whatever's on the tree if rebuild fails.
  let actorCoverageSeed = tree.actor_coverage_seed ?? [];
  try {
    actorCoverageSeed = await buildActorCoverageSeed(supabase, tree.subject, runCtx.userId);
  } catch (e) {
    console.warn('[handleDetection] actor coverage seed refresh failed:', (e as Error).message);
  }

  // ── 1. Library reuse check, AT OPPORTUNITY LEVEL (PR2). ──────────────────
  // Pre-PR2 this searched the library by behaviour TITLE+NARRATIVE — too
  // broad, often missed actual coverage of specific detection observables.
  // Now we search by the canonical opportunity's observable chain +
  // telemetry, which is the actual detection target. Any high-similarity
  // match is reused as-is; see the reuse-first note below.
  const libMatch = await checkLibraryCoverage(toolCtx, behaviour, opp);
  // REUSE-FIRST. If a rule already exists in the library, point this leaf at
  // it and skip generation entirely — we do not rewrite what the user already
  // has, especially when generation is the weakest stage in the pipeline.
  //
  // Status and query language are recorded for DISPLAY only. They describe
  // where the rule lives and what it is written in; they do not decide whether
  // it counts. The user reviews the complete set — existing and newly written —
  // at the end of the research and chooses the action.
  //
  // This reverses the two gates added earlier (Production-only + language
  // match). On a real run those excluded all 185 mshta rules in an 11,820-rule
  // library, because no rule was simultaneously Production AND KQL — so the
  // pipeline generated from scratch instead of reusing any of them.
  // See Amendment 1 in docs/plans/2026-07-28-threat-research-remediation-plan.md.
  // Adjudicate rather than reuse on sight. A hit replaces generation only when
  // it overlaps on technique, has a runnable query, is written in this
  // session's language, and is actually deployed. Otherwise it is shown as
  // related coverage and the gap is still filled -- which is what makes the
  // strictness safe: failing a condition costs the short-circuit, not the
  // match. See adjudicateReuse in coverage.ts for why the earlier
  // Production-AND-language gate was reverted and why this is not that.
  const adjudication = adjudicateReuse({
    opportunityMitreIds: opp.mitre_technique_ids,
    match: libMatch,
    targetLanguage: queryLanguage,
  });

  if (libMatch && adjudication.suppressGeneration) {
    const deployed = isDeployedCoverage(libMatch);
    const runnable = isLanguageRunnable(libMatch, queryLanguage);
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'library_match_found',
      message: `${opp.title} → reusing existing rule "${libMatch.name}" (${libMatch.status || 'unknown status'}, ${libMatch.query_language || 'unknown language'})`,
      payload: {
        behaviour_id: behaviour.id,
        opportunity_id: opp.id,
        match: libMatch,
        deployed,
        runnable_in_session_language: runnable,
        target_language: queryLanguage,
      },
    });
    // Point this OPPORTUNITY's leaf at the existing rule. The leaf itself is
    // unchanged in shape — saved_detection_id is what the UI already reads to
    // render a reused leaf and link back to the library entry. reused_from_library
    // distinguishes this from a user manually saving a freshly-generated
    // detection — the UI's "Saved to library as a Draft" banner is wrong here
    // (no user action happened, and the rule may already be Production/Testing).
    opp.detection.saved_detection_id = libMatch.existing_detection_id;
    opp.detection.reused_from_library = true;
    opp.detection.name = libMatch.name;
    opp.detection.query_language = (libMatch.query_language || queryLanguage) as ResearchQueryLanguage;
    // Carry the rule body across so the leaf shows the actual query, not just
    // a title. Without this a reused leaf renders an empty code block.
    opp.detection.query = libMatch.detection_query ?? '';
    opp.detection.description = `Existing library rule — no new detection was written for this opportunity.`;
    // 'covered' only when the rule is both deployed and runnable here;
    // otherwise 'partial'. Either way the rule is reused, never regenerated.
    opp.detection.feasibility = deployed && runnable ? 'covered' : 'partial';
    opp.detection.feasibility_notes = [
      `Existing rule "${libMatch.name}"`,
      `status ${libMatch.status || 'unknown'}`,
      `language ${libMatch.query_language || 'unknown'}${runnable ? '' : ` (this session targets ${queryLanguage})`}`,
      `match ${libMatch.combined_score.toFixed(2)}`,
    ].join(' · ');
    await patchDetection(supabase, session.id, behaviour.id, opp.id, opp.detection.id, {
      saved_detection_id: opp.detection.saved_detection_id,
      reused_from_library: true,
      name: opp.detection.name,
      query_language: opp.detection.query_language,
      query: opp.detection.query,
      description: opp.detection.description,
      feasibility: opp.detection.feasibility,
      feasibility_notes: opp.detection.feasibility_notes,
      // A reused rule was never critiqued by THIS pipeline — clear any qa
      // verdict/error left over from a prior attempt on this opportunity
      // (e.g. a failed generation that's now being retried and resolves via
      // reuse instead). Without this a retry-into-reuse keeps showing a
      // stale verdict/error alongside a brand-new query body.
      qa: null,
      qa_error: null,
    });
    // Also resolve any pre-existing qa JOB row for this opportunity. A reuse
    // needs no QA pass, so mark it 'completed' directly rather than leaving
    // it 'pending'/'failed' (which would either block the finalise gate —
    // tr_promote_finalise_if_ready only treats completed/failed as done — or
    // get picked up by the dispatcher cron and waste a QA call critiquing a
    // rule this pipeline didn't write).
    const qaCompositeIdForReuse = `${behaviour.id}/${opp.id}`;
    const { error: reuseQaResetErr } = await supabase
      .from('threat_research_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), failure_reason: null })
      .eq('session_id', session.id)
      .eq('phase', 'qa')
      .eq('behaviour_id', qaCompositeIdForReuse)
      .neq('status', 'completed');
    if (reuseQaResetErr) {
      console.warn(`[handleDetection] reuse-path qa resolve for ${qaCompositeIdForReuse} failed:`, reuseQaResetErr.message);
    }
    return;
  }
  // Generation proceeds. A match may still exist here — it just did not earn
  // the right to replace writing a new detection. Surfacing it as related
  // coverage is the whole reason the adjudication can afford to be strict:
  // the engineer sees the neighbouring rule, the user sees why it was not
  // reused, and the gap still gets filled.
  const nearMatch: LibraryNearMatch | null =
    libMatch && adjudication.showAsRelatedCoverage
      ? {
          existing_detection_id: libMatch.existing_detection_id,
          name: libMatch.name,
          query_language: libMatch.query_language,
          status: libMatch.status,
          combined_score: libMatch.combined_score,
          skipped_reason: adjudication.skippedReason ?? 'unknown',
        } as LibraryNearMatch
      : null;

  if (nearMatch) {
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'library_match_found',
      message: `${opp.title} → related rule "${libMatch!.name}" not reused ` +
        `(${adjudication.skippedReason}); writing a new detection for this gap`,
      payload: {
        behaviour_id: behaviour.id,
        opportunity_id: opp.id,
        match: libMatch,
        skipped_reason: adjudication.skippedReason,
        conditions: adjudication.reasons,
        target_language: queryLanguage,
      },
    });
  }

  // Resolve the full set of source behaviours referenced by this
  // canonical opportunity. Pre-fix the orchestrator passed only the
  // primary behaviour to the engineer, which lost the deep-dive context
  // from the secondaries — making the resulting query shallower than the
  // merged-from-multiple-behaviours signal warranted.
  const sourceIds = new Set(opp.source_behaviour_ids ?? [behaviour.id]);
  const sourceBehaviours = tree.behaviours.filter(b => sourceIds.has(b.id));
  if (sourceBehaviours.length === 0) sourceBehaviours.push(behaviour);
  // Visibility: warn when the planner output references behaviour ids that
  // aren't in the tree. Shouldn't happen (planner validates against tree
  // ids), but a real corruption would be silent otherwise.
  if (sourceBehaviours.length < sourceIds.size) {
    const resolved = new Set(sourceBehaviours.map(b => b.id));
    const missing = Array.from(sourceIds).filter(id => !resolved.has(id));
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'source_behaviour_drop',
      message: `planner referenced ${missing.length} behaviour id(s) not in tree for opportunity ${behaviourId}/${opportunityId}`,
      payload: {
        behaviour_id: behaviourId,
        opportunity_id: opportunityId,
        expected: Array.from(sourceIds),
        resolved: Array.from(resolved),
        missing,
      },
    });
  }

  // ── 2. Generate the detection for THIS canonical opportunity. ───────────
  // The Detection Engineer now operates per opportunity (not per behaviour).
  // It receives the canonical opportunity shape (observable_chain, telemetry,
  // mitre) and the FULL set of source behaviours' deep_dives — primary plus
  // any secondaries the planner merged into this opportunity. Sibling
  // deep-dive context is crucial when the planner merged 3 AF_ALG variants
  // into one opportunity: the engineer needs all three to write a query
  // that catches the variant surface, not just the primary's wording.
  const generated = await generateDetectionForOpportunity(
    toolCtx, runCtx, tree.subject, behaviour, sourceBehaviours, opp, queryLanguage, actorCoverageSeed,
  );
  if (!generated) {
    // Engineer agent loop failed (budget exhausted, validation cap hit,
    // 429 storm, etc). Mark THIS opportunity's detection as engineer-failed
    // via qa_error ONLY. Pre-fix this code prefixed "[engineer failed]"
    // into detection.name, which then leaked into list/canvas views
    // as if it were content. The UI now reads qa_error and renders the
    // failure state via styling — name stays as the opportunity title
    // so users see what the detection WOULD have been, with a clear
    // error badge alongside it.
    opp.detection.name = opp.title;
    opp.detection.description = '';
    opp.detection.query = '';
    opp.detection.qa_error = 'engineer_failed';
    await patchDetection(supabase, session.id, behaviour.id, opp.id, opp.detection.id, {
      name: opp.detection.name,
      description: opp.detection.description,
      query: opp.detection.query,
      qa_error: opp.detection.qa_error,
    });
    return;
  }

  // Post-step: validate emitted T-ids against the canonical mitre_techniques
  // table. Hallucinated ids surface via unverified_mitre_ids on the
  // GeneratedDetection so the UI can flag.
  if (generated.mitre_technique_ids.length > 0) {
    const unverified = new Set(await findUnverifiedMitreIds(supabase, generated.mitre_technique_ids));
    generated.unverified_mitre_ids = generated.mitre_technique_ids.filter(id => unverified.has(id));
  }

  // Post-step: deterministic schema validation for Defender XDR KQL queries.
  // Extracts the leading table + every column reference, checks them against
  // the imported Defender XDR schema. Unknowns get prepended to
  // feasibility_notes so the user (and downstream QA) sees them without
  // needing a model judgment. Catches the most common KQL hallucination
  // (wrong column name) mechanically — no LLM call, no extra latency
  // beyond one RPC roundtrip.
  //
  // Gated on PRODUCT, not language. Microsoft Sentinel and Microsoft Defender
  // XDR both write KQL, so gating on 'KQL' alone ran the Defender schema check
  // over Sentinel queries: a correct query using SecurityEvent, SigninLogs or
  // AuditLogs came back as "unknown table", the note landed in
  // feasibility_notes, and QA — which is told to incorporate those findings —
  // could then "repair" a working query into the wrong product's schema.
  //
  // There is no Sentinel schema table here, so a Sentinel query records the
  // check as SKIPPED rather than receiving a fabricated verdict. Saying "not
  // checked" is worth more than confidently saying the wrong thing, because
  // the wrong thing is what got acted on.
  //
  // Library-match short-circuits (saved_detection_id set) still skip: the
  // matched detection's query isn't ours to validate.
  const canSchemaValidate = supportsDefenderSchemaValidation(queryProduct);
  if (
    generated.query_language === 'KQL' &&
    generated.query &&
    !generated.saved_detection_id &&
    !canSchemaValidate
  ) {
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'schema_validation_completed',
      message: `schema validation skipped — no schema available for ${queryProduct ?? 'unspecified product'}`,
      payload: {
        opportunity_id: opp.id,
        behaviour_id: behaviour.id,
        detection_id: generated.id,
        skipped: true,
        skipped_reason: queryProduct ? 'no_schema_for_product' : 'no_product_resolved',
        product: queryProduct,
      },
    });
  }
  if (
    generated.query_language === 'KQL' &&
    generated.query &&
    !generated.saved_detection_id &&
    canSchemaValidate
  ) {
    const findings = await validateKqlAgainstDefenderSchema(supabase, generated.query);
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'schema_validation_completed',
      message: findings.unknown_columns.length === 0 && findings.table_known
        ? `schema clean (${findings.checked_columns} refs checked on ${findings.table})`
        : findings.table_known
          ? `unknown columns on ${findings.table}: ${findings.unknown_columns.join(', ')}`
          : `unknown table: ${findings.table ?? '(none)'}`,
      payload: {
        opportunity_id: opp.id,
        behaviour_id: behaviour.id,
        detection_id: generated.id,
        findings,
      },
    });
    if (!findings.table_known && findings.table) {
      const note = `[schema] table '${findings.table}' not found in Defender XDR schema — likely a non-KQL table name or a typo.`;
      generated.feasibility_notes = generated.feasibility_notes
        ? `${note}\n${generated.feasibility_notes}`
        : note;
    } else if (findings.unknown_columns.length > 0) {
      const note = `[schema] ${findings.unknown_columns.length} unknown column(s) on ${findings.table}: ${findings.unknown_columns.join(', ')}. Verify the column exists; common mistake: Computer vs DeviceName, ProcessCmdLine vs ProcessCommandLine.`;
      generated.feasibility_notes = generated.feasibility_notes
        ? `${note}\n${generated.feasibility_notes}`
        : note;
    }
  }

  // Post-step: deterministic (no-LLM) validators — telemetry feasibility,
  // Sigma structural syntax, citation spot-check, MITRE ID/tactic
  // consistency. Advisory only; never blocks the detection from shipping.
  // Runs after the KQL schema check above so validator_findings and
  // feasibility_notes both reflect the same final generated detection.
  generated.validator_findings = await runDetectionValidators(supabase, runCtx.userId, opp, generated);

  // ── 3. Persist the detection. ───────────────────────────────────────────
  // Carry the advisory near-match (if any) onto the leaf so the detail card
  // can explain why a fresh query exists next to an adjacent library rule.
  generated.library_near_match = nearMatch;
  opp.detection = generated;
  await patchDetection(supabase, session.id, behaviour.id, opp.id, opp.detection.id, {
    library_near_match: generated.library_near_match,
    name: generated.name,
    description: generated.description,
    query: generated.query,
    query_language: generated.query_language,
    mitre_technique_ids: generated.mitre_technique_ids,
    unverified_mitre_ids: generated.unverified_mitre_ids,
    tactic: generated.tactic,
    suggested_severity: generated.suggested_severity,
    suggested_detection_type: generated.suggested_detection_type,
    feasibility: generated.feasibility,
    feasibility_notes: generated.feasibility_notes,
    citations: generated.citations,
    covers_behaviour_ids: generated.covers_behaviour_ids,
    validator_findings: generated.validator_findings,
    qa: null,
    qa_error: null,
  });

  // ── 4. Enqueue ONE qa job for this opportunity. ─────────────────────────
  // PR2: detection is now per-opportunity, so each detection job produces
  // exactly one qa job — no fan-out from detection to qa.
  const qaCompositeId = `${behaviour.id}/${opp.id}`;
  // Reset any prior qa row with this composite id (retry_leaf path).
  const { error: qaResetErr } = await supabase
    .from('threat_research_jobs')
    .update({
      status: 'pending',
      attempt_count: 0,
      started_at: null,
      completed_at: null,
      failure_reason: null,
    })
    .eq('session_id', session.id)
    .eq('phase', 'qa')
    .eq('behaviour_id', qaCompositeId);
  if (qaResetErr) {
    console.warn(`[handleDetection] qa reset for ${qaCompositeId} failed:`, qaResetErr.message);
  }

  const { error: qaInsertErr } = await supabase
    .from('threat_research_jobs')
    .upsert(
      [{ session_id: session.id, phase: 'qa' as const, behaviour_id: qaCompositeId }],
      { onConflict: 'session_id,phase,behaviour_id', ignoreDuplicates: true },
    );
  if (qaInsertErr) {
    // Non-fatal: detection content is already persisted at step 3. The
    // user can manually trigger complete_qa to recover later.
    console.warn(`[handleDetection] qa job enqueue for ${qaCompositeId} failed:`, qaInsertErr.message);
  } else {
    // Kick the dispatcher so the qa job starts immediately rather than
    // waiting for the next cron tick.
    await supabase.rpc('threat_research_dispatch_next_in_phase', {
      p_session_id: session.id,
      p_phase: 'qa',
    }).then(() => {/* fire-and-forget */}, () => {/* swallow */});
  }
}

/** Single-pass QA on one opportunity. Each qa job runs critiqueDetection
 *  ONCE, plus one engineer revision attempt if verdict='fail' (no
 *  re-critique on the revision). Patches the final detection (with
 *  verdict, concerns, history of length 1) back to the tree.
 *
 *  Wall-clock per job: ~1-3 min (1 QA call + 0-1 engineer revision call,
 *  each ~30-70s). Fits inside one edge-function invocation cleanly — no
 *  worker death mid-loop, no state lost on restart.
 *
 *  Previously this ran a 3-round actor-critic loop (up to 5 LLM calls
 *  per opp). The loop drove most of the architectural pain — workers
 *  dying mid-iteration, state lost on restart, tokens burned re-doing
 *  earlier rounds. Removed in favour of "trust Opus + critique once +
 *  one fix on failure". Tools used: engineer kit only; qa has no tools. */
async function handleQa(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  session: { id: string; user_id: string; input_text: string; environment_snapshot: unknown },
  tree: ThreatResearchTree,
  compositeId: string,
): Promise<void> {
  const slash = compositeId.indexOf('/');
  if (slash < 0) throw new Error(`qa job behaviour_id must be "{behaviourId}/{opportunityId}", got ${compositeId}`);
  const behaviourId = compositeId.slice(0, slash);
  const opportunityId = compositeId.slice(slash + 1);

  const behaviour = tree.behaviours.find(b => b.id === behaviourId);
  if (!behaviour) {
    console.warn(`[handleQa] behaviour ${behaviourId} not in tree — skipping`);
    return;
  }
  const opp = behaviour.opportunities.find(o => o.id === opportunityId);
  if (!opp) {
    console.warn(`[handleQa] opportunity ${behaviourId}/${opportunityId} not in tree — skipping`);
    return;
  }
  // Idempotent: if QA already ran (re-dispatch race, manual retry), skip.
  if (opp.detection.qa) return;

  const { language: queryLanguage, product: queryProduct } =
    resolveQueryTarget(session.environment_snapshot ?? null);
  const pack = await loadKnowledgePack('detection-engineering');

  // Refresh the actor coverage seed at qa-job start. Same rationale as in
  // handleDetection: the cached tree.actor_coverage_seed can be 30+
  // minutes stale by the time qa runs on a late opportunity. Pass to
  // refineDetectionViaActorCritic so QA sees the same context the
  // engineer was given (otherwise QA can mis-flag deliberately
  // complementary detections as duplicates of the seed).
  let actorCoverageSeed = tree.actor_coverage_seed ?? [];
  if (tree.subject) {
    try {
      actorCoverageSeed = await buildActorCoverageSeed(supabase, tree.subject, runCtx.userId);
    } catch (e) {
      console.warn('[handleQa] actor coverage seed refresh failed:', (e as Error).message);
    }
  }

  // refineDetectionViaActorCritic emits qa_refinement_started /
  // qa_refinement_completed / qa_verdict events itself — no need to
  // duplicate them here. Returns the REVISED detection with qa.iteration_*
  // populated.
  const refined = await refineDetectionViaActorCritic(
    toolCtx, runCtx, behaviour, opp, queryLanguage, pack, actorCoverageSeed, queryProduct,
  );

  // Re-run BOTH MITRE post-steps on the revised detection: revisions can
  // introduce new technique IDs the model hallucinates AND can introduce
  // techniques whose canonical tactic doesn't match the parent behaviour's
  // tactic. Without the consistency re-check, a revision could silently
  // pivot the detection's MITRE coverage onto a different tactic from the
  // behaviour it supposedly defends — the user would see a green "passed"
  // detection that's actually mis-classified.
  if (refined.mitre_technique_ids.length > 0) {
    const unverified = new Set(await findUnverifiedMitreIds(supabase, refined.mitre_technique_ids));
    refined.unverified_mitre_ids = refined.mitre_technique_ids.filter(id => unverified.has(id));
    // Tactic consistency: only check IDs that exist in the canonical table
    // (verified). Hallucinated ones are already flagged via unverified.
    const verifiedIds = refined.mitre_technique_ids.filter(id => !unverified.has(id));
    if (verifiedIds.length > 0) {
      const tacticsByTechnique = await fetchTechniqueTactics(supabase, verifiedIds);
      const inconsistent = filterTacticInconsistent(verifiedIds, behaviour.tactic, tacticsByTechnique);
      if (inconsistent.length > 0) {
        // Surface on the BEHAVIOUR (where tactic mismatch lives) rather
        // than the detection — the detection's tactic field can be the
        // detection's claimed tactic; the mismatch is between behaviour
        // and the technique's canonical tactic. Merge with existing flags
        // rather than overwriting; multiple revisions could accumulate.
        const before = new Set(behaviour.tactic_inconsistent_mitre_ids ?? []);
        for (const id of inconsistent) before.add(id);
        behaviour.tactic_inconsistent_mitre_ids = Array.from(before);
      }
    }
  }

  // Detect feasibility pivots: if the revised detection's feasibility moved
  // from covered/partial to uncovered, the BEHAVIOUR's detectability and
  // artefacts_required (set in handleDetection) are stale. We don't have
  // enough context to recompute them here (the engineer would have to be
  // re-asked), but we can at least flag the inconsistency by appending a
  // note to detectability_rationale so the canvas tile + leaf card reflect
  // the late discovery. UI consumers should surface this distinctly.
  const feasibilityPivot =
    behaviour.detectability !== null
    && behaviour.detectability !== undefined
    && refined.feasibility === 'uncovered'
    && (behaviour.detectability === 'siem' || behaviour.detectability === 'edr');
  let behaviourPatch: Record<string, unknown> | null = null;
  if (feasibilityPivot) {
    const note = ' [QA revision flipped this opportunity to uncovered — telemetry assumed at engineering time may not be present.]';
    const newRationale = (behaviour.detectability_rationale ?? '') + note;
    behaviour.detectability_rationale = newRationale;
    behaviourPatch = { detectability_rationale: newRationale };
  }
  if ((behaviour.tactic_inconsistent_mitre_ids ?? []).length > 0) {
    behaviourPatch = {
      ...(behaviourPatch ?? {}),
      tactic_inconsistent_mitre_ids: behaviour.tactic_inconsistent_mitre_ids,
    };
  }
  if (behaviourPatch) {
    await patchBehaviour(supabase, session.id, behaviour.id, behaviourPatch);
  }

  // Mutate local tree for subsequent in-process reads.
  opp.detection = refined;

  // Patch the FULL revised detection back. Revision can change name, query,
  // mitre_technique_ids, severity, etc. — not just qa.
  //
  // qa_error is patched alongside qa: when the pipeline failed mid-loop,
  // refined.qa may be null AND refined.qa_error is set. When the loop
  // completed normally, qa is set and qa_error is null. UIs use the two
  // together to distinguish "QA judged this fails" (qa.verdict='fail',
  // qa_error=null) from "QA never reached a verdict" (qa=null, qa_error set).
  await patchDetection(supabase, session.id, behaviour.id, opp.id, opp.detection.id, {
    name: refined.name,
    description: refined.description,
    query: refined.query,
    query_language: refined.query_language,
    mitre_technique_ids: refined.mitre_technique_ids,
    unverified_mitre_ids: refined.unverified_mitre_ids,
    tactic: refined.tactic,
    suggested_severity: refined.suggested_severity,
    suggested_detection_type: refined.suggested_detection_type,
    feasibility: refined.feasibility,
    feasibility_notes: refined.feasibility_notes,
    citations: refined.citations,
    covers_behaviour_ids: refined.covers_behaviour_ids,
    qa: refined.qa,
    qa_error: refined.qa_error,
    // Without this the flag lives only in memory and the persisted leaf reads
    // as a plain 'fail' -- the repaired detection would be discarded exactly
    // as before.
    revised_after_fail: refined.revised_after_fail ?? null,
  });
}

/** Run async fn over items with a fixed pool size. Caller-side errors are
 *  swallowed by fn (it has its own try/catch); this just bounds parallelism. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await fn(next);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
}

async function handleFinalise(
  supabase: SupabaseClient,
  runCtx: RunContext,
  session: { id: string },
  tree: ThreatResearchTree,
  _start: number,
): Promise<void> {
  // Total duration is wall-clock since the session was created (not since
  // this worker started) — across all the queued jobs.
  // Budget totals are already on the row (incremented atomically by every
  // worker via tr_consume_budget). We just read them back for the event.
  const { data: row } = await supabase
    .from('threat_research_sessions')
    .select('created_at, tool_calls_used, model_calls_used, total_tokens, model_call_cap, tool_call_cap')
    .eq('id', session.id)
    .single();
  const totalMs = row?.created_at ? Date.now() - new Date(row.created_at).getTime() : 0;

  await annotateFailedQaJobs(supabase, session.id, tree);

  // Cross-opportunity dedup (semantic fingerprint, PR3-lite). Catches
  // duplicates the Opportunity Planner missed.
  const dupCount = flagCrossBehaviourDuplicates(tree);
  if (dupCount > 0) {
    console.log(`[finalise] flagged ${dupCount} cross-opportunity duplicate detection(s)`);
  }

  // Build a rich session summary for the completion event. The Activity
  // Console renders this as the final tile; the same numbers are what an
  // analyst would look at first in a post-mortem ("did the planner cluster
  // it? how many opportunities? how many QA errors?"). Pre-fix the payload
  // only held three counts (tool/model/tokens) which forced clicking into
  // each leaf to understand the run.
  let oppCount = 0;
  let detectionWithQuery = 0;
  let libraryMatchCount = 0;
  let qaPass = 0;
  let qaPassWithConcerns = 0;
  let qaFail = 0;
  let qaErrorCount = 0;
  let engineerFailedCount = 0;
  let duplicateFlagged = 0;
  let mergedBehaviourCount = 0;
  for (const b of tree.behaviours) {
    if ((b.merged_into_opportunity_ids?.length ?? 0) > 0) mergedBehaviourCount++;
    for (const opp of b.opportunities) {
      oppCount++;
      const det = opp.detection;
      if (det.query && det.query.length > 0) detectionWithQuery++;
      if (det.saved_detection_id) libraryMatchCount++;
      if (det.qa_error === 'engineer_failed') engineerFailedCount++;
      else if (det.qa_error) qaErrorCount++;
      if (det.qa?.verdict === 'pass') qaPass++;
      else if (det.qa?.verdict === 'pass_with_concerns') qaPassWithConcerns++;
      else if (det.qa?.verdict === 'fail') qaFail++;
      // Both shapes count: qa.duplicate_of when the leaf had a real verdict to
      // annotate, det.duplicate_of when it never reached QA.
      if (det.qa?.duplicate_of || det.duplicate_of) duplicateFlagged++;
    }
  }

  // Decide final session status. A session is only "completed" if at least
  // ONE detection actually has a usable artefact: either an LLM-generated
  // query that passed (or pass_with_concerns) QA, or a library_match that
  // covers the opportunity. Otherwise the session ran the pipeline but
  // produced no usable output — that's a failure, not a success, and
  // downstream consumers querying status='completed' to mean "you have
  // detections" need to be told the truth.
  // Yield, derived from the shared readiness model rather than counted ad hoc
  // here. Two failures came out of the old arithmetic
  // (`library + qa_pass + qa_pass_with_concerns`), in opposite directions:
  //
  //   - a detection whose QA call ERRORED was discarded, though its query had
  //     already been written and paid for. bc5804b3 wrote ten queries, hit six
  //     QA errors, and delivered one.
  //   - a run whose real work died could still report success on library
  //     look-ups alone. 793cafab did exactly that on credit exhaustion and had
  //     to be corrected by hand.
  //
  // Preservation and readiness are now separate: nothing generated is thrown
  // away, and nothing unreviewed is called production-ready. `partial` is the
  // state that was missing, and its absence is why the pipeline had to pick
  // one of those two lies.
  const allDetections = tree.behaviours.flatMap(b => b.opportunities.map(o => o.detection));
  const sessionYield = summariseYield(allDetections);
  const finalStatus = deriveSessionStatus(sessionYield);
  const failureReason = finalStatus === 'failed'
    ? `pipeline ran but preserved no detections: ${engineerFailedCount} engineer_failed, ${qaErrorCount} qa_error, ${qaFail} qa_fail across ${oppCount} opportunit${oppCount === 1 ? 'y' : 'ies'}. Use the resume_session action to retry failed detection jobs after fixing the underlying cause.`
    : finalStatus === 'partial'
      // Not a failure, and deliberately not silent either: the user is told
      // exactly how much needs them before anything can ship.
      ? `${sessionYield.productionCandidates} ready to review, ${sessionYield.needsReview} need a human verdict (QA did not reach one), ${sessionYield.drafts} not usable.`
      : null;

  const { error: finaliseError } = await supabase
    .from('threat_research_sessions')
    .update({
      status: finalStatus,
      failure_reason: failureReason,
      completed_at: new Date().toISOString(),
      duration_ms: totalMs,
      coverage_impact: 0,
      tree,
      updated_at: new Date().toISOString(),
      // tool_calls_used / model_calls_used / total_tokens are owned by
      // tr_consume_budget — don't overwrite them here.
    })
    .eq('id', session.id);
  if (finaliseError) {
    throw new Error(`finalise session update: ${finaliseError.message}`);
  }

  await emit(runCtx, {
    agent: 'orchestrator',
    event_type: finalStatus === 'failed' ? 'session_failed' : 'session_completed',
    // Lead with yield, because that is the question being asked. The verdict
    // breakdown follows for post-mortems.
    message: `${tree.behaviours.length} behaviours → ${oppCount} opportunities → ` +
      `${sessionYield.productionCandidates} ready / ${sessionYield.needsReview} need review / ${sessionYield.drafts} not usable` +
      ` (${libraryMatchCount} library / ${qaPass} pass / ${qaPassWithConcerns} pass+concerns / ${qaFail} fail / ${qaErrorCount} qa_error / ${engineerFailedCount} engineer_failed)` +
      `${finalStatus === 'failed' ? ' — SESSION FAILED: nothing preserved' : ''}`,
    duration_ms: totalMs,
    payload: {
      // budget
      tool_calls_used:  row?.tool_calls_used  ?? 0,
      tool_call_cap:    row?.tool_call_cap    ?? null,
      model_calls_used: row?.model_calls_used ?? 0,
      model_call_cap:   row?.model_call_cap   ?? null,
      total_tokens:     row?.total_tokens     ?? 0,
      // tree shape
      classification:   tree.subject?.classification ?? null,
      planner_status:   tree.planner_status ?? null,
      behaviours:       tree.behaviours.length,
      opportunities:    oppCount,
      // Session yield, as first-class telemetry rather than something an
      // analyst has to reconstruct from verdict counts. The "did this run
      // achieve anything" question previously had no machine-readable answer,
      // which is why the useful/hollow split had to be worked out by hand
      // across sessions with differing tree shapes.
      session_status:         finalStatus,
      production_candidates:  sessionYield.productionCandidates,
      needs_review:           sessionYield.needsReview,
      drafts:                 sessionYield.drafts,
      preserved:              sessionYield.preserved,
      // detection state breakdown
      detections_with_query: detectionWithQuery,
      library_matches:       libraryMatchCount,
      qa_pass:               qaPass,
      qa_pass_with_concerns: qaPassWithConcerns,
      qa_fail:               qaFail,
      qa_error_count:        qaErrorCount,
      engineer_failed_count: engineerFailedCount,
      merged_behaviours:     mergedBehaviourCount,
      duplicate_flagged:     duplicateFlagged,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Full-tree write. ONLY safe for singleton-phase handlers (preflight,
 *  research, finalise) where exactly one worker is writing. NEVER use this
 *  in attack_research/detection/qa — those are fan-out and must use
 *  patchBehaviour / patchDetection to avoid trampling sibling workers. */
async function persistTree(
  supabase: SupabaseClient,
  sessionId: string,
  tree: ThreatResearchTree,
): Promise<void> {
  const { error } = await supabase
    .from('threat_research_sessions')
    .update({ tree, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) {
    throw new Error(`persistTree ${sessionId}: ${error.message}`);
  }
}

/** Atomic merge of a JSONB patch into one behaviour. Concurrent-safe — use
 *  this in fan-out phases instead of full-tree persistTree. The Postgres
 *  RPC tr_patch_behaviour serializes by row so two parallel workers each
 *  patching different behaviours never lose each other's writes. */
async function patchBehaviour(
  supabase: SupabaseClient,
  sessionId: string,
  behaviourId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase.rpc('tr_patch_behaviour', {
    p_session_id: sessionId,
    p_behaviour_id: behaviourId,
    p_patch: patch,
  });
  if (error) {
    console.error(`[worker] patchBehaviour(${behaviourId}) failed:`, error.message);
    throw new Error(`patchBehaviour ${behaviourId}: ${error.message}`);
  }
  if (data === false) {
    console.warn(`[worker] patchBehaviour: behaviour ${behaviourId} not found in session ${sessionId}`);
  }
}

/** Atomic merge of a JSONB patch into one detection (deeper path). Used by
 *  handleDetection / handleQa to land each detection's state in the tree
 *  as soon as it's finalised — so a reaped worker preserves everything
 *  completed before kill. Verifies the detection id matches before merging. */
async function patchDetection(
  supabase: SupabaseClient,
  sessionId: string,
  behaviourId: string,
  opportunityId: string,
  detectionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase.rpc('tr_patch_detection', {
    p_session_id: sessionId,
    p_behaviour_id: behaviourId,
    p_opportunity_id: opportunityId,
    p_detection_id: detectionId,
    p_patch: patch,
  });
  if (error) {
    console.error(`[worker] patchDetection(${detectionId}) failed:`, error.message);
    throw new Error(`patchDetection ${detectionId}: ${error.message}`);
  }
  if (data === false) {
    throw new Error(`patchDetection: detection ${detectionId} not found at expected path ${behaviourId}/${opportunityId} in session ${sessionId}`);
  }
}

/** Before finalise, make queue-level QA failures visible in the tree. A job
 *  can fail via the SQL reaper without running handleQa's normal
 *  qa_error patch path. If we leave those leaves as qa=null/qa_error=null,
 *  the UI reads as "still pending" even though the queue is terminal. */
async function annotateFailedQaJobs(
  supabase: SupabaseClient,
  sessionId: string,
  tree: ThreatResearchTree,
): Promise<void> {
  const { data: failedJobs, error } = await supabase
    .from('threat_research_jobs')
    .select('behaviour_id, failure_reason')
    .eq('session_id', sessionId)
    .eq('phase', 'qa')
    .eq('status', 'failed');
  if (error) {
    console.warn('[finalise] failed to load failed QA jobs:', error.message);
    return;
  }

  for (const job of failedJobs ?? []) {
    const composite = String(job.behaviour_id ?? '');
    const slash = composite.indexOf('/');
    if (slash < 0) continue;
    const behaviourId = composite.slice(0, slash);
    const opportunityId = composite.slice(slash + 1);
    const behaviour = tree.behaviours.find(b => b.id === behaviourId);
    const opp = behaviour?.opportunities.find(o => o.id === opportunityId);
    if (!opp || opp.detection.qa || opp.detection.qa_error) continue;
    opp.detection.qa_error = job.failure_reason
      ? `qa_job_failed: ${job.failure_reason}`
      : 'qa_job_failed';
  }
}

async function primeEnvironmentSnapshot(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  const { data: env } = await supabase
    .from('environment_profiles')
    .select('siem_platforms, log_sources, edr_tools, custom_log_sources, cloud_platforms, industry, crown_jewels')
    .eq('user_id', userId)
    .maybeSingle();
  await supabase
    .from('threat_research_sessions')
    .update({ environment_snapshot: env ?? null })
    .eq('id', sessionId);
}

async function markJobCompleted(supabase: SupabaseClient, job: JobRow): Promise<void> {
  await supabase
    .from('threat_research_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id);
}

async function failJob(supabase: SupabaseClient, job: JobRow, reason: string): Promise<void> {
  await supabase
    .from('threat_research_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      failure_reason: reason.slice(0, 1000),
    })
    .eq('id', job.id);
}

/** Gated finalise promotion. Fires only when BOTH detection AND qa phases
 *  are fully terminal — the generic promote_phase(...,'finalise') was
 *  unsafe because it only checks the source phase, and qa jobs are enqueued
 *  by detection workers (so the last detection completes while qa is still
 *  pending). Idempotent via session-scoped advisory lock + existing-row check
 *  inside the SQL function.
 *
 *  Emits a finalise_gate_checked event every call so we can see, in the
 *  activity console, why finalise is or isn't firing. Pre-fix the RPC
 *  returned NULL on blocked and the caller had zero visibility into the
 *  decision. */
async function promoteFinaliseIfReady(
  supabase: SupabaseClient,
  runCtx: RunContext,
  sessionId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('tr_promote_finalise_if_ready', {
    p_session_id: sessionId,
  });
  if (error) {
    console.error(`[worker] promote_finalise_if_ready failed:`, error.message);
    // Don't throw — the dispatcher cron will retry the gate on the next
    // tick. Worst case the session sits without finalise for ~60s.
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'finalise_gate_checked',
      message: `gate RPC error: ${error.message.slice(0, 200)}`,
      payload: { rpc_error: error.message.slice(0, 600) },
    });
    return;
  }
  // The RPC returns a jsonb diagnostic. data shape:
  //   { fired: boolean, reason: 'blocked' | 'already_exists' | 'gate_cleared',
  //     detection_pending?: number, detection_total: number,
  //     qa_pending?: number, qa_total: number, finalise_job_id?: uuid }
  const result = (data ?? {}) as {
    fired?: boolean;
    reason?: string;
    detection_pending?: number;
    detection_total?: number;
    qa_pending?: number;
    qa_total?: number;
    finalise_job_id?: string;
  };
  const fired = result.fired === true;
  const reason = result.reason ?? 'unknown';
  const msg = fired
    ? `finalise gate cleared (detection=${result.detection_total}/0 qa=${result.qa_total}/0)`
    : reason === 'already_exists'
    ? `finalise already queued by sibling worker (job ${result.finalise_job_id?.slice(0, 8) ?? '?'})`
    : `finalise blocked: detection=${result.detection_total ?? 0}/${result.detection_pending ?? 0} pending, qa=${result.qa_total ?? 0}/${result.qa_pending ?? 0} pending`;
  await emit(runCtx, {
    agent: 'orchestrator',
    event_type: 'finalise_gate_checked',
    message: msg,
    payload: result,
  });
}

/** Atomic fan-in promotion via SQL helper. The SQL function takes a session
 *  advisory lock, verifies all completed_phase jobs are terminal, and (if so)
 *  inserts and dispatches the next_phase jobs in one transaction. No-op if
 *  siblings are still running. */
async function promote(
  supabase: SupabaseClient,
  sessionId: string,
  completedPhase: string,
  nextPhase: string,
  behaviourIds: string[] | null,
): Promise<void> {
  const { error } = await supabase.rpc('threat_research_promote_phase', {
    p_session_id: sessionId,
    p_completed_phase: completedPhase,
    p_next_phase: nextPhase,
    p_behaviour_ids: behaviourIds,
  });
  if (error) {
    console.error(`[worker] promote ${completedPhase}→${nextPhase} failed:`, error.message);
    throw new Error(`promote ${completedPhase}→${nextPhase}: ${error.message}`);
  }
}

/** Dispatch the next pending sibling for this fan-out phase. The SQL helper
 *  enforces a per-session-per-phase concurrency cap (2) so we never blow
 *  Anthropic's input-TPM ceiling. No-op if cap reached or no pendings. */
async function dispatchNextInPhase(
  supabase: SupabaseClient,
  sessionId: string,
  phase: 'attack_research' | 'detection' | 'qa',
): Promise<void> {
  const { error } = await supabase.rpc('threat_research_dispatch_next_in_phase', {
    p_session_id: sessionId,
    p_phase: phase,
  });
  if (error) {
    // Not fatal — the dispatcher cron will pick up any stranded pendings
    // within a minute. Log so we notice if this becomes a hot path.
    console.warn(`[worker] dispatch_next_in_phase ${phase} failed:`, error.message);
  }
}
