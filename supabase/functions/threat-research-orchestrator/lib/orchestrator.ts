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
import type { VendorSearchRecord } from "./tools/rule-repo-search.ts";
import type {
  DetectionOpportunity,
  AttackBehaviour,
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
  /** 'qa' is retained ONLY so job rows from sessions that ran before the QA
   *  agent was removed still type-check when replayed. Nothing enqueues it and
   *  the dispatcher has no arm for it. */
  phase: 'preflight' | 'research' | 'attack_research' | 'opportunity_planning' | 'detection' | 'qa' | 'finalise';
  /** For attack_research: the behaviour id (for example "b1").
   *  For detection: composite "{primary_behaviour_id}/{opportunity_id}"
   *  (e.g. "b1/o3") — detection is now per canonical opportunity, not
   *  per behaviour, since the Opportunity Planner runs upstream.
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
  // vendorSearchLog is collected here, at the worker level, and persisted after
  // the phase handler returns. Production had seven rule_repo_search calls with
  // no recorded result, URL, or error — the tool's "not configured" answer went
  // only into the model's context, so the session could substantiate neither
  // that it found nothing nor that it never looked.
  const vendorSearchLog: VendorSearchRecord[] = [];
  const toolCtx: ToolContext = {
    supabase,
    userId: session.user_id,
    searchCache,
    fetchCache,
    queryLanguage: resolveQueryTarget(session.environment_snapshot ?? null).language,
    vendorSearchLog,
  };

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
        // terminal. tr_promote_finalise_if_ready still counts a 'qa' phase
        // that no longer produces jobs — with none enqueued its pending count
        // is 0, so the gate turns purely on detection. Left in place so
        // historical sessions mid-flight when QA was removed still finalise.
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
    // Persist vendor-search provenance regardless of how the job ended. A
    // search that ran before the failure is still evidence of what was
    // reviewed, and the not-configured case is exactly the one worth keeping —
    // it is the difference between "found nothing" and "never looked".
    //
    // Written to its own append-only table, never onto the session tree: a
    // read-modify-write of the tree would discard concurrent workers' detection
    // and QA patches along with their provenance.
    if (vendorSearchLog.length > 0) {
      try {
        await appendVendorSearchProvenance(
          supabase, session.id, session.user_id, job, vendorSearchLog,
        );
      } catch (e) {
        console.warn('[worker] vendor search provenance write failed:', (e as Error).message);
      }
    }

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
  // Call caps are a RUNAWAY BACKSTOP now, not the spend control — tokens are
  // (see budget-policy.ts). They are deliberately wide so the token budget is
  // what binds.
  //
  // The old sizing (25 + 6N, so 73 for 8 behaviours) was the spend control, and
  // it is why 199 agent failures read "model-call budget exhausted": a
  // call-count cliff stopped work that was nowhere near its token budget, and
  // whichever leaves happened to run last were the ones starved. Since a
  // failed call also consumed a call, a flaky session tightened the cliff on
  // itself.
  //
  // 3x the previous allowance keeps a genuine runaway bounded — an infinite
  // agent loop still cannot spin forever — while making the cliff essentially
  // unreachable in a healthy session.
  const CALL_CAP_BACKSTOP_MULTIPLIER = 3;
  const modelCap = Math.min(2000, (25 + 6 * N) * CALL_CAP_BACKSTOP_MULTIPLIER);
  const toolCap  = Math.min(2000, (25 + 6 * N) * CALL_CAP_BACKSTOP_MULTIPLIER);

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
          `detection ${Math.round(budgets.perPhase.detection / 1000)}K reserved`,
      payload: {
        token_cap: budgets.tokenCap,
        per_phase: budgets.perPhase,
        behaviours: N,
        capacity_limited: budgets.capped,
      },
    });
  }
}

/** Append this worker's vendor-search attempts to the session tree.
 *
 *  Read-modify-write on `tree.vendor_search`, appending only. Several workers
 *  search concurrently and each holds its own log, so replacing the field would
 *  discard the others'. The read is deliberately narrow (one jsonb field) rather
 *  than a full-tree round trip.
 *
 *  Best-effort by design: provenance is evidence about the run, and losing it
 *  must never be the thing that fails the run. */
async function appendVendorSearchProvenance(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  job: JobRow,
  records: readonly VendorSearchRecord[],
): Promise<void> {
  // A plain INSERT. No read, so there is nothing to clobber.
  //
  // The first version of this read the whole session tree, appended to one
  // field, and wrote the whole tree back. That is a data-loss bug, and the
  // comment on it claimed the opposite: appending to one field of a whole-tree
  // round trip still writes the whole tree. Two workers reading the same
  // version would each write their own copy, losing the other's provenance AND
  // any detection or QA leaf committed in between — the precise "work
  // disappeared" failure this remediation exists to remove. Detection and QA
  // leaves are patched concurrently by design; tr_patch_detection exists so
  // they never need a full-tree write.
  const { error } = await supabase
    .from('threat_research_vendor_searches')
    .insert(records.map(r => ({
      session_id: sessionId,
      user_id: userId,
      phase: job.phase,
      behaviour_id: job.behaviour_id,
      query: r.query,
      repositories: r.repositories,
      results_found: r.results_found,
      source_urls: r.source_urls,
      error: r.error ?? null,
      attempted_at: r.attempted_at,
    })));
  if (error) {
    console.warn('[worker] vendor search provenance insert failed:', error.message);
  }
}

/** A 1:1 behaviour→opportunity stand-in, used when the planner produced
 *  nothing usable for a behaviour.
 *
 *  Shared by two callers with deliberately different scope: the whole-plan
 *  degraded path (planner returned nothing at all) and the targeted rescue
 *  (planner returned a good plan but left specific behaviours unaccounted for).
 *  Extracted so those two cannot drift — the rescue exists precisely because
 *  discarding a good plan to fix one gap loses the merges the planner is for. */
function buildFallbackOpportunity(
  b: AttackBehaviour,
  queryLanguage: ResearchQueryLanguage,
): DetectionOpportunity {
  return {
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
      b.opportunities = [buildFallbackOpportunity(b, queryLanguage)];
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

  const excludedById = new Map(
    (out.excluded_behaviours ?? []).map(e => [e.behaviour_id, e]),
  );

  // Targeted rescue. The validator rejects a plan that leaves a behaviour
  // unaccounted for, so this only fires if the planner failed its retry too.
  //
  // Scoped deliberately to the MISSING behaviours. The existing
  // `planner_degraded` path throws the whole plan away and rebuilds every
  // behaviour 1:1 with no dedup — losing good merges to rescue one gap.
  // Rescuing only what is missing keeps the planner's real work.
  const accountedIds = new Set<string>();
  for (const cop of out.opportunities) {
    if (cop.primary_behaviour_id) accountedIds.add(cop.primary_behaviour_id);
    for (const src of cop.source_behaviour_ids ?? []) accountedIds.add(src);
  }
  for (const id of excludedById.keys()) accountedIds.add(id);

  const rescued = tree.behaviours.filter(b => !accountedIds.has(b.id));
  if (rescued.length > 0) {
    await emit(runCtx, {
      agent: 'orchestrator',
      event_type: 'planner_degraded',
      message:
        `PLANNER PARTIAL — ${rescued.length} of ${tree.behaviours.length} behaviour(s) ` +
        `unaccounted for after retry (${rescued.map(b => b.id).join(', ')}); ` +
        'generating 1:1 opportunities for those only. The rest of the plan is kept.',
      payload: {
        rescued_behaviour_ids: rescued.map(b => b.id),
        planned_opportunities: out.opportunities.length,
        excluded: [...excludedById.keys()],
      },
    });
    for (const b of rescued) {
      byPrimary.set(b.id, [buildFallbackOpportunity(b, queryLanguage)]);
    }
  }

  for (const b of tree.behaviours) {
    const opps = byPrimary.get(b.id) ?? [];
    const merged = bySource.get(b.id) ?? [];
    b.opportunities = opps;
    b.merged_into_opportunity_ids = merged.map(m => m.ref);

    if (opps.length === 0 && merged.length === 0) {
      // No opportunity claims this behaviour as primary and none references it
      // as a source. Two very different situations, previously collapsed into
      // one and both reported as a verdict:
      //
      //   - the planner EXCLUDED it and said why. That is a real judgement.
      //   - the planner simply left it out. That is the absence of a judgement,
      //     and stamping 'not_detectable' on it invented one.
      //
      // The validator now rejects the second case outright, so reaching here
      // without an exclusion means the planner failed twice and the targeted
      // fallback below could not rescue it. Say that, rather than claiming the
      // behaviour cannot be detected.
      const exclusion = excludedById.get(b.id);
      b.detectability = 'not_detectable';
      b.detectability_rationale = exclusion
        ? `Planner excluded this behaviour: ${exclusion.reason}`
        : 'No detection opportunity was produced for this behaviour and the planner ' +
          'gave no reason. This is a gap in the plan, not a finding that the behaviour ' +
          'is undetectable — re-run the planner for this behaviour.';
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
      // Same reasoning as the initial sizing: these are a runaway backstop, and
      // the token floors installed just above are the real control. Sized so a
      // detection or QA leaf cannot hit a call cliff while it still has tokens.
      p_model_delta: 36 * oppCount,
      p_tool_delta: 24 * oppCount,
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
    // The opportunity's declared detection surface. Without these the
    // observable condition cannot be satisfied and every match falls through
    // to generation -- safe, but it would make the gate inert.
    opportunityObservableChain: opp.observable_chain,
    opportunityTelemetry: opp.telemetry,
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
      // Clear any verdict/error left over from a prior attempt on this
      // opportunity (a failed generation now being retried and resolving via
      // reuse instead). Without this a retry-into-reuse keeps showing a stale
      // judgement alongside a brand-new query body.
      qa: null,
      qa_error: null,
    });
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
  //
  // The tactic-consistency half of this used to run in handleQa, on the
  // post-revision detection. With no QA stage there is no revision and no
  // second chance to catch it, so both checks run here on the one body that
  // ships. A behaviour tagged `persistence` citing a technique whose canonical
  // tactic is defense-evasion is mis-classified, and the user should see that
  // whether or not anything reviewed the query.
  if (generated.mitre_technique_ids.length > 0) {
    const unverified = new Set(await findUnverifiedMitreIds(supabase, generated.mitre_technique_ids));
    generated.unverified_mitre_ids = generated.mitre_technique_ids.filter(id => unverified.has(id));
    // Only verified ids can be checked for tactic consistency — a hallucinated
    // id has no canonical tactic to compare against and is already flagged.
    const verifiedIds = generated.mitre_technique_ids.filter(id => !unverified.has(id));
    if (verifiedIds.length > 0) {
      const tacticsByTechnique = await fetchTechniqueTactics(supabase, verifiedIds);
      const inconsistent = filterTacticInconsistent(
        verifiedIds, behaviour.tactic, tacticsByTechnique,
      );
      if (inconsistent.length > 0) {
        // Recorded on the BEHAVIOUR, not the detection: the mismatch is between
        // the behaviour's tactic and the technique's canonical one. Merge
        // rather than overwrite so a retry can't drop an earlier flag.
        const merged = new Set(behaviour.tactic_inconsistent_mitre_ids ?? []);
        for (const id of inconsistent) merged.add(id);
        behaviour.tactic_inconsistent_mitre_ids = Array.from(merged);
      }
    }
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
    // Written explicitly rather than left absent: a retry into this slot must
    // clear any verdict a previous (pre-removal) attempt left behind, so the
    // leaf never shows a stale judgement beside a fresh query.
    qa: null,
    qa_error: null,
  });

  // Persist the tactic-consistency flag raised above. It lives on the
  // behaviour, so it needs its own patch — the detection patch above cannot
  // carry it.
  if ((behaviour.tactic_inconsistent_mitre_ids ?? []).length > 0) {
    await patchBehaviour(supabase, session.id, behaviour.id, {
      tactic_inconsistent_mitre_ids: behaviour.tactic_inconsistent_mitre_ids,
    });
  }
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
      if (det.duplicate_of) duplicateFlagged++;
    }
  }

  // Decide final session status from the shared readiness model rather than
  // counting ad hoc here. Two failures came out of the old arithmetic, in
  // opposite directions:
  //
  //   - a detection whose QA call ERRORED was discarded, though its query had
  //     already been written and paid for. bc5804b3 wrote ten queries, hit six
  //     QA errors, and delivered one.
  //   - a run whose real work died could still report success on library
  //     look-ups alone. 793cafab did exactly that on credit exhaustion and had
  //     to be corrected by hand.
  //
  // `partial` is the state that was missing, and its absence is why the
  // pipeline had to pick one of those two lies. It now means one thing only:
  // some opportunities produced a query and some produced nothing.
  const allDetections = tree.behaviours.flatMap(b => b.opportunities.map(o => o.detection));
  const sessionYield = summariseYield(allDetections);
  const finalStatus = deriveSessionStatus(sessionYield);
  const failureReason = finalStatus === 'failed'
    ? `pipeline ran but preserved no detections: ${engineerFailedCount} engineer_failed across ${oppCount} opportunit${oppCount === 1 ? 'y' : 'ies'}. Use the resume_session action to retry failed detection jobs after fixing the underlying cause.`
    : finalStatus === 'partial'
      // Not a failure, and deliberately not silent either.
      ? `${sessionYield.productionCandidates} ready to review, ${sessionYield.drafts} could not be generated.`
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
    // Lead with yield, because that is the question being asked. The
    // breakdown follows for post-mortems.
    message: `${tree.behaviours.length} behaviours → ${oppCount} opportunities → ` +
      `${sessionYield.productionCandidates} ready / ${sessionYield.drafts} not usable` +
      ` (${libraryMatchCount} library / ${engineerFailedCount} engineer_failed)` +
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
      drafts:                 sessionYield.drafts,
      preserved:              sessionYield.preserved,
      // detection state breakdown
      detections_with_query: detectionWithQuery,
      library_matches:       libraryMatchCount,
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
 *  handleDetection to land each detection's state in the tree as soon as it's
 *  finalised — so a reaped worker preserves everything completed before kill.
 *  Verifies the detection id matches before merging. */
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
