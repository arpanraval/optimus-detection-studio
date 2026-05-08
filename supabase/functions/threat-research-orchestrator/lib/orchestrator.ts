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
//   preflight         → research          (singleton)
//   research          → attack_research × N  (fan-out, one job per behaviour)
//   attack_research × N  → detection × N    (fan-in then fan-out)
//   detection × N     → finalise           (fan-in)
//   finalise                                 (singleton; marks session completed)

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { RunContext, emit } from "./events.ts";
import type { ToolContext } from "./tools/index.ts";
import type { WebSearchResult } from "../../_shared/web-search.ts";
import { runPreflight } from "./preflight.ts";
import { runResearchAgent } from "./agents/research-agent.ts";
import { runAttackResearcherForBehaviour } from "./agents/attack-researcher.ts";
import {
  checkLibraryCoverage,
  generateInitialDetections,
  refineDetectionViaActorCritic,
} from "./agents/detection-engineer.ts";
import { resolveQueryLanguage } from "./query-language.ts";
import { loadKnowledgePack } from "./skills-loader.ts";
import { buildActorCoverageSeed } from "./actor-coverage.ts";
import {
  fetchTechniqueTactics,
  filterTacticInconsistent,
  findUnverifiedMitreIds,
} from "./mitre-validator.ts";
import type { ThreatResearchTree } from "./types.ts";

// ────────────────────────────────────────────────────────────────────────────
// Job row shape
// ────────────────────────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  session_id: string;
  phase: 'preflight' | 'research' | 'attack_research' | 'detection' | 'qa' | 'finalise';
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
  const runCtx: RunContext = { supabase, sessionId: session.id, userId: session.user_id };
  // envContextCache starts undefined; populated lazily by executeTool on
  // the first environment_context call within this worker invocation.
  const toolCtx: ToolContext = { supabase, userId: session.user_id, searchCache };

  // Hydrate tree (will mutate, then persist).
  const tree: ThreatResearchTree = (session.tree as ThreatResearchTree | null) ?? {
    subject: null,
    preflight: null,
    tactic_summary: [],
    behaviours: [],
    open_questions: [],
  };

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
        // Fan-in: when ALL attack_research siblings are terminal, promote to
        // detection. promote() is a no-op if siblings are still running.
        await promote(
          supabase,
          session.id,
          'attack_research',
          'detection',
          tree.behaviours.map(b => b.id),
        );
        break;

      case 'detection':
        if (!job.behaviour_id) throw new Error('detection job missing behaviour_id');
        await handleDetection(supabase, runCtx, toolCtx, session, tree, job.behaviour_id);
        await markJobCompleted(supabase, job);
        await dispatchNextInPhase(supabase, session.id, 'detection');
        await promote(supabase, session.id, 'detection', 'finalise', null);
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
        // Promote to finalise when ALL qa siblings are terminal. promote()
        // is idempotent, so the parallel detection→finalise path is safe.
        await promote(supabase, session.id, 'qa', 'finalise', null);
        break;

      case 'finalise':
        await handleFinalise(supabase, runCtx, session, tree, start);
        await markJobCompleted(supabase, job);
        break;

      default:
        throw new Error(`unknown phase ${(job as JobRow).phase}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
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
  tree.preflight = await runPreflight(toolCtx, runCtx, session.input_text);
  await persistTree(supabase, session.id, tree);
}

async function handleResearch(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  session: { id: string; input_text: string },
  tree: ThreatResearchTree,
): Promise<void> {
  const out = await runResearchAgent(toolCtx, runCtx, session.input_text);
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

  tree.subject = out.subject;
  tree.tactic_summary = out.tactic_summary;
  tree.behaviours = out.behaviours;

  // Actor-tagged coverage seed: empty for non-actor threats (CVEs, generic
  // concepts), substantive for groups/campaigns. Built once here so every
  // downstream detection job can read it from the tree without re-querying.
  // Best-effort: a failure leaves the field absent; the engineer continues
  // with per-behaviour vector search alone.
  try {
    tree.actor_coverage_seed = await buildActorCoverageSeed(supabase, out.subject);
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

  // Size the per-session budget caps from the actual behaviour count.
  //
  // Per-behaviour worst-case call count, with actor-critic now wired in qa:
  //   Detection (initial gen): 1 wrapper call × up-to-8 validation iters → ~3 avg
  //   Per-opp QA (actor-critic, ~2 opps/leaf):
  //     QA: 1 call × up-to-2 iters × 3 rounds (initial + 2 revs) → ~5 avg
  //     Revision: up to 2 × 1 call × up-to-3 iters → ~4 avg
  //   Plus attack_research: ~3 avg
  // So ~15 model calls per behaviour average, ~30 worst case.
  //
  // Formula: 5 + 18*N capped at 800. For N=24: 437. For N=12: 221. For the
  // hallucination ceiling N=30: 545. Cap raised from 400 → 800 to fit
  // worst-case spikes without prematurely starving back-half leaves.
  const N = out.behaviours.length;
  const modelCap = Math.min(800, 5 + 18 * N);
  const toolCap  = Math.min(800, 5 + 18 * N);

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
}

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

async function handleDetection(
  supabase: SupabaseClient,
  runCtx: RunContext,
  toolCtx: ToolContext,
  session: { id: string; user_id: string; input_text: string; environment_snapshot: unknown },
  tree: ThreatResearchTree,
  behaviourId: string,
): Promise<void> {
  const behaviour = tree.behaviours.find(b => b.id === behaviourId);
  if (!behaviour) throw new Error(`behaviour ${behaviourId} not in tree`);
  if (!tree.subject) throw new Error('detection before research');

  const queryLanguage = resolveQueryLanguage(session.environment_snapshot ?? null);

  // Refresh the actor coverage seed at job start. The seed is built once
  // when Research completes, but a session can run for 30+ minutes — and
  // users may add detections to their library mid-session that the seed
  // wouldn't know about. Cheap to re-fetch (one library_search call) and
  // keeps the engineer up-to-date with the user's current library shape.
  // Falls back to whatever's on the tree if rebuild fails.
  let actorCoverageSeed = tree.actor_coverage_seed ?? [];
  try {
    actorCoverageSeed = await buildActorCoverageSeed(supabase, tree.subject);
  } catch (e) {
    console.warn('[handleDetection] actor coverage seed refresh failed:', (e as Error).message);
  }

  // ── 1. Library coverage shortcut. ────────────────────────────────────────
  // If a high-similarity match exists AND it's runnable in the user's
  // current SIEM language, skip generation entirely. Without the language
  // gate, a user whose env now uses KQL would short-circuit on a stale
  // SPL detection from a prior toolchain — sage-green leaf hides a real
  // gap because the existing detection can't run in their stack.
  const libMatch = await checkLibraryCoverage(toolCtx, behaviour);
  const matchedLanguageRunnable = (() => {
    if (!libMatch) return false;
    // Empty query_language means we couldn't determine the matched
    // detection's language — be conservative and fall through to
    // generation rather than veto with low confidence.
    if (!libMatch.query_language) return false;
    // Compare case-insensitively against the resolved env language. If
    // the user's env doesn't resolve a SIEM language we still accept
    // the match (better than failing closed).
    return !queryLanguage || libMatch.query_language.toLowerCase() === queryLanguage.toLowerCase();
  })();
  if (libMatch && matchedLanguageRunnable) {
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'library_match_found',
      message: `${behaviour.title} → already covered by "${libMatch.name}"`,
      payload: { behaviour_id: behaviour.id, match: libMatch },
    });
    behaviour.library_match = libMatch;
    behaviour.detectability = 'siem';
    behaviour.detectability_rationale = `Already detected by existing detection "${libMatch.name}" in the user's library.`;
    behaviour.artefacts_required = [];
    behaviour.opportunities = [];
    await patchBehaviour(supabase, session.id, behaviour.id, {
      library_match: libMatch,
      detectability: 'siem',
      detectability_rationale: behaviour.detectability_rationale,
      artefacts_required: [],
      opportunities: [],
    });
    return;
  }
  // libMatch existed but couldn't run in the user's SIEM — emit the
  // signal so the engineer knows there's a near-match worth referencing
  // via covers_behaviour_ids, but proceed to generation in the user's
  // actual language.
  if (libMatch && !matchedLanguageRunnable) {
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'library_match_found',
      message: `${behaviour.title} → near-match "${libMatch.name}" in ${libMatch.query_language || 'unknown SIEM'} (skipped: user's SIEM is ${queryLanguage})`,
      payload: {
        behaviour_id: behaviour.id,
        match: libMatch,
        skipped_reason: 'language_mismatch',
        target_language: queryLanguage,
      },
    });
  }

  // ── 2. Initial generation. ───────────────────────────────────────────────
  // Engineer produces a wrapper of detectability + opportunities + draft
  // detections. No actor-critic yet — that runs per-detection in step 4
  // so a reaped worker preserves everything emitted before kill.
  const { wrapper, pack } = await generateInitialDetections(
    toolCtx, runCtx, tree.subject, behaviour, queryLanguage,
    actorCoverageSeed,
  );
  if (!wrapper) {
    // Engineer agent loop failed (budget exhausted, validation cap hit,
    // 429 storm, etc). This is NOT a verdict that the behaviour is
    // genuinely undetectable — it's a recoverable failure. Surface it as
    // `engineer_failed` so the UI shows a "retry available" state instead
    // of the misleading "not detectable" label.
    behaviour.library_match = null;
    behaviour.detectability = 'engineer_failed';
    behaviour.detectability_rationale = 'Detection Engineer agent loop did not produce a valid output (budget, timeout, or validation failure). Retry recommended — this is not a model verdict that the behaviour is undetectable.';
    behaviour.artefacts_required = [];
    behaviour.opportunities = [];
    await patchBehaviour(supabase, session.id, behaviour.id, {
      library_match: null,
      detectability: 'engineer_failed',
      detectability_rationale: behaviour.detectability_rationale,
      artefacts_required: [],
      opportunities: [],
    });
    return;
  }

  // Post-step: validate every emitted T-id on each detection. Hallucinated
  // ids surface via unverified_mitre_ids on the GeneratedDetection.
  const detIds = wrapper.opportunities.flatMap(o => o.detection.mitre_technique_ids);
  if (detIds.length > 0) {
    const unverified = new Set(await findUnverifiedMitreIds(supabase, detIds));
    for (const opp of wrapper.opportunities) {
      opp.detection.unverified_mitre_ids = opp.detection.mitre_technique_ids.filter(id => unverified.has(id));
    }
  }

  // ── 3. Persist the wrapper NOW. ─────────────────────────────────────────
  // Opportunities land in the tree with qa=null on each detection. The UI
  // can render them as "QA pending". If this worker dies before any
  // actor-critic completes, this state survives.
  behaviour.library_match = null;
  behaviour.detectability = wrapper.detectability;
  behaviour.detectability_rationale = wrapper.detectability_rationale;
  behaviour.artefacts_required = wrapper.artefacts_required;
  behaviour.opportunities = wrapper.opportunities;
  await patchBehaviour(supabase, session.id, behaviour.id, {
    library_match: null,
    detectability: wrapper.detectability,
    detectability_rationale: wrapper.detectability_rationale,
    artefacts_required: wrapper.artefacts_required,
    opportunities: wrapper.opportunities,
  });

  // ── 4. Enqueue ONE qa job per opportunity. ──────────────────────────────
  // Inline QA inside handleDetection is unreliable: even with bounded
  // parallelism, the worker can die mid-loop (platform lifetime cap,
  // Anthropic 429 cascade) and lose ALL in-flight QA work, leaving every
  // opportunity with qa=null in the tree.
  //
  // Splitting QA into its own queue phase makes each pass a small (~10-30s)
  // worker invocation that fits comfortably under any worker lifetime,
  // gets reaper-protected like any other job, and chains via the existing
  // dispatch cascade. The handleDetection worker exits cleanly as soon as
  // opportunities are generated, freeing the worker for the next leaf.
  //
  // Each qa job's behaviour_id is the composite "{behaviourId}/{oppId}"
  // — handleQa parses it and runs critiqueDetection on that single opp.
  if (wrapper.opportunities.length > 0) {
    // Reset any existing qa rows for this behaviour FIRST. Without this,
    // a re-run of handleDetection (reaper reset, retry_leaf, etc.)
    // collides with prior qa rows in 'completed'/'failed' state and the
    // upsert below silently skips them (ignoreDuplicates) — the new
    // opportunities then never get QA. The match is path-prefixed to
    // catch every composite id under this behaviour, including any
    // orphans whose opportunity index changed across runs.
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
      .like('behaviour_id', `${behaviour.id}/%`);
    if (qaResetErr) {
      console.warn(`[handleDetection] qa reset for ${behaviour.id} failed:`, qaResetErr.message);
    }

    const qaRows = wrapper.opportunities.map(o => ({
      session_id: session.id,
      phase: 'qa' as const,
      behaviour_id: `${behaviour.id}/${o.id}`,
    }));
    const { error: qaInsertErr } = await supabase
      .from('threat_research_jobs')
      .upsert(qaRows, { onConflict: 'session_id,phase,behaviour_id', ignoreDuplicates: true });
    if (qaInsertErr) {
      // Non-fatal: detection content is already persisted at step 3.
      // The user can manually trigger complete_qa to recover later.
      console.warn(`[handleDetection] qa job enqueue for ${behaviour.id} failed:`, qaInsertErr.message);
    } else {
      // Kick the dispatcher so the first qa job starts immediately
      // rather than waiting for the next cron tick.
      await supabase.rpc('threat_research_dispatch_next_in_phase', {
        p_session_id: session.id,
        p_phase: 'qa',
      }).then(() => {/* fire-and-forget */}, () => {/* swallow */});
    }
  }
}

/** QA pass with full actor-critic loop on a single opportunity. Each qa
 *  job runs critiqueDetection + up to 2 engineer revision rounds, then
 *  patches the FINAL revised detection (with verdict, concerns, iteration
 *  history) back to the tree. One job per opportunity = bounded wall time
 *  (5-call ceiling × ~30-60s/call ≈ 2-5 min), fits the 4-min reaper window.
 *
 *  This was previously a single-shot critique. The actor-critic loop was
 *  built but never wired in production — every detection shipped with its
 *  first-draft verdict, including verdict:fail with no follow-through.
 *  Tools used (engineer + qa kits, no web_search). */
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

  const queryLanguage = resolveQueryLanguage(session.environment_snapshot ?? null);
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
      actorCoverageSeed = await buildActorCoverageSeed(supabase, tree.subject);
    } catch (e) {
      console.warn('[handleQa] actor coverage seed refresh failed:', (e as Error).message);
    }
  }

  // refineDetectionViaActorCritic emits qa_refinement_started /
  // qa_refinement_completed / qa_verdict events itself — no need to
  // duplicate them here. Returns the REVISED detection with qa.iteration_*
  // populated.
  const refined = await refineDetectionViaActorCritic(
    toolCtx, runCtx, behaviour, opp, queryLanguage, pack, actorCoverageSeed,
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
    .select('created_at, tool_calls_used, model_calls_used, total_tokens')
    .eq('id', session.id)
    .single();
  const totalMs = row?.created_at ? Date.now() - new Date(row.created_at).getTime() : 0;

  // Cross-behaviour dedup. Detection-engineer runs per behaviour with no view
  // of siblings, so two distinct behaviours can produce detections with the
  // same name+query. Flag duplicates here so the UI can group them.
  const dupCount = flagCrossBehaviourDuplicates(tree);
  if (dupCount > 0) {
    console.log(`[finalise] flagged ${dupCount} cross-behaviour duplicate detection(s)`);
  }

  await supabase
    .from('threat_research_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_ms: totalMs,
      coverage_impact: 0,
      tree,
      updated_at: new Date().toISOString(),
      // tool_calls_used / model_calls_used / total_tokens are owned by
      // tr_consume_budget — don't overwrite them here.
    })
    .eq('id', session.id);

  await emit(runCtx, {
    agent: 'orchestrator',
    event_type: 'session_completed',
    message: 'all phases completed',
    duration_ms: totalMs,
    payload: {
      tool_calls_used: row?.tool_calls_used ?? 0,
      model_calls_used: row?.model_calls_used ?? 0,
      total_tokens: row?.total_tokens ?? 0,
      behaviours: tree.behaviours.length,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Full-tree write. ONLY safe for singleton-phase handlers (preflight,
 *  research, finalise) where exactly one worker is writing. NEVER use this
 *  in attack_research / detection — those are fan-out and must use
 *  patchBehaviour to avoid trampling sibling workers. */
async function persistTree(
  supabase: SupabaseClient,
  sessionId: string,
  tree: ThreatResearchTree,
): Promise<void> {
  await supabase
    .from('threat_research_sessions')
    .update({ tree, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

/** Cross-behaviour duplicate detection finder. Walks every detection across
 *  every behaviour, normalises name + query, and flags second-and-later
 *  occurrences as duplicates by setting qa.duplicate_of to the canonical id.
 *  Returns the number of duplicates flagged.
 *
 *  Why here and not in QA agent: QA sees one detection at a time and can't
 *  spot cross-behaviour collisions. This pass runs once at finalise after all
 *  detection workers have committed their per-leaf patches.
 *
 *  Mutates `tree` in place. */
function flagCrossBehaviourDuplicates(tree: ThreatResearchTree): number {
  const seen = new Map<string, string>(); // normalized key → canonical detection id
  let flagged = 0;
  for (const b of tree.behaviours) {
    for (const opp of b.opportunities) {
      const det = opp.detection;
      if (det.archived) continue;
      // Key off normalized name + query — two detections with the same name
      // but different queries are not actually duplicates, and vice versa.
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const key = `${norm(det.name)}::${norm(det.query)}`;
      if (!key || key === '::') continue;
      const existingId = seen.get(key);
      if (!existingId) {
        seen.set(key, det.id);
        continue;
      }
      // Found a duplicate. Record on qa.duplicate_of (creating qa if missing —
      // the actor-critic loop normally fills it, but be defensive).
      if (det.qa) {
        det.qa.duplicate_of = existingId;
        if (!det.qa.concerns.some(c => c.startsWith('Duplicate of'))) {
          det.qa.concerns = [
            ...det.qa.concerns,
            `Duplicate of detection ${existingId} (same name + query, different behaviour).`,
          ];
        }
      } else {
        det.qa = {
          verdict: 'pass_with_concerns',
          coverage_quality: 'acceptable',
          concerns: [`Duplicate of detection ${existingId} (same name + query, different behaviour).`],
          suggested_changes: [],
          duplicate_of: existingId,
          iteration_history: [],
          iteration_count: 0,
        };
      }
      flagged++;
    }
  }
  return flagged;
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
 *  handleDetection to land each refined detection in the tree as soon as
 *  its actor-critic finishes — so a reaped worker preserves everything
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
    console.warn(`[worker] patchDetection: detection ${detectionId} not found at expected path in session ${sessionId}`);
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
