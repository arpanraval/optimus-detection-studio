// supabase/functions/threat-research-orchestrator/index.ts
//
// HTTP entry point for the Threat Research feature. Three actions:
//   - POST /                       — start a new session: insert the row,
//                                     insert a preflight job, dispatch it.
//                                     Returns the session id immediately.
//   - POST /?action=cancel         — flip an in-progress session to
//                                     cancelled. The next worker that picks
//                                     up a job sees this and exits cleanly.
//   - POST /?action=run_job        — internal: dispatcher (cron or another
//                                     worker) hands off one job. Service-
//                                     role bearer required. Skips rate limit.
//
// Multi-phase orchestration is queue-driven via public.threat_research_jobs;
// see lib/orchestrator.ts (worker) and migrations 20260430c/d for the queue
// schema and dispatcher cron.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handleCorsPreflight, corsErrorResponse, corsJsonResponse } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";
import { runJob } from "./lib/orchestrator.ts";

const MAX_INPUT_LEN = 1000;

/** Constant-time string compare — the run_job path uses the service-role
 *  key as a shared secret. Length-mismatch short-circuit is not secret. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ──────────────────────────────────────────────────────────────────────
    // Internal: run a single queued job. Matched BEFORE user-JWT validation.
    // Service-role bearer required; called from the dispatcher cron and
    // worker-to-worker hand-offs via pg_net.
    // ──────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'run_job') {
      const auth = req.headers.get('Authorization') ?? '';
      const presented = auth.replace(/^Bearer\s+/, '');
      if (!presented || !timingSafeEqual(presented, serviceRoleKey)) {
        return corsErrorResponse('Unauthorized run_job', req, 401);
      }

      let body: { job_id?: string };
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const jobId = typeof body.job_id === 'string' ? body.job_id : '';
      if (!jobId) return corsErrorResponse('job_id is required', req, 400);

      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Fire-and-forget the worker. EdgeRuntime.waitUntil keeps the isolate
      // alive after we return 200 so the work has time to finish. Any single
      // job is bounded (one phase, one leaf) so it fits comfortably inside
      // the platform's worker lifetime — that's the whole point of the queue.
      const job = runJob(adminClient, jobId).catch(e => {
        console.error('[entry] run_job failed:', e);
      });
      // @ts-ignore — EdgeRuntime is provided by the Supabase Deno runtime.
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(job);
      }
      return corsJsonResponse({ ok: true, job_id: jobId }, req);
    }

    // ──────────────────────────────────────────────────────────────────────
    // User-authenticated paths (new session, cancel)
    // ──────────────────────────────────────────────────────────────────────
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return corsErrorResponse('Missing authorization header', req, 401);
    }

    const token = auth.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return corsErrorResponse('Unauthorized', req, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (req.method === 'POST' && action === 'cancel') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
      if (!sessionId) return corsErrorResponse('session_id is required', req, 400);

      const { error } = await userClient
        .from('threat_research_sessions')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', sessionId)
        .in('status', ['pending', 'running']);
      if (error) {
        console.error('[entry] cancel failed:', error.message);
        return corsErrorResponse('Failed to cancel', req, 500);
      }
      return corsJsonResponse({ ok: true }, req);
    }

    if (req.method === 'POST' && !action) {
      // Per-user rate limit on new sessions only. Internal run_job calls
      // are matched above this branch and skip the limit.
      const { allowed } = await checkRateLimit(
        adminClient,
        `user:${user.id}:fn:threat-research-orchestrator`,
        5,
        3600,
      );
      if (!allowed) return corsErrorResponse('Rate limit exceeded — 5 sessions per hour.', req, 429);

      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }

      const inputText = typeof body?.input_text === 'string' ? body.input_text.trim() : '';
      if (!inputText) return corsErrorResponse('input_text is required', req, 400);
      if (inputText.length > MAX_INPUT_LEN) {
        return corsErrorResponse(`input_text exceeds ${MAX_INPUT_LEN} characters`, req, 400);
      }

      // Initial tree shape so the detail page can render between row insert
      // and the preflight worker's first persistTree() call. Includes
      // tactic_summary:[] to match the server-side ThreatResearchTree type
      // (required field; runtime-tolerated by frontend's optional declaration
      // but trips the orchestrator's type-checked hydration fallback).
      const initialTree = {
        subject: null,
        preflight: null,
        tactic_summary: [],
        behaviours: [],
        open_questions: [],
      };
      const { data: session, error } = await userClient
        .from('threat_research_sessions')
        .insert({
          user_id: user.id,
          input_text: inputText,
          status: 'pending',
          tree: initialTree,
        })
        .select('id')
        .single();
      if (error || !session) {
        console.error('[entry] insert session failed:', error?.message);
        return corsErrorResponse('Failed to create session', req, 500);
      }

      // Insert the preflight job and dispatch it directly via the SQL
      // helper. Worker-to-worker hand-off and cron use the same helper.
      const { data: jobRow, error: jobErr } = await adminClient
        .from('threat_research_jobs')
        .insert({ session_id: session.id, phase: 'preflight', behaviour_id: null })
        .select('id')
        .single();
      if (jobErr || !jobRow) {
        console.error('[entry] insert preflight job failed:', jobErr?.message);
        return corsErrorResponse('Failed to enqueue preflight job', req, 500);
      }
      const { error: dispatchErr } = await adminClient.rpc('threat_research_dispatch_job', {
        p_job_id: jobRow.id,
      });
      if (dispatchErr) {
        // Not fatal — the dispatcher cron will pick it up within a minute.
        console.warn('[entry] preflight dispatch RPC failed (cron will retry):', dispatchErr.message);
      }

      return corsJsonResponse({ session_id: session.id }, req);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Retry one detection leaf. Inserts a fresh detection job for the named
    // behaviour and dispatches it. Used by the "Retry" button on a failed
    // leaf in the UI. handleDetection is idempotent — it overwrites prior
    // partial state on the tree.
    // ──────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'retry_leaf') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
      const behaviourId = typeof body?.behaviour_id === 'string' ? body.behaviour_id : '';
      if (!sessionId || !behaviourId) return corsErrorResponse('session_id and behaviour_id are required', req, 400);

      // Verify ownership via the user-scoped client (RLS).
      const { data: ownedSession } = await userClient
        .from('threat_research_sessions')
        .select('id')
        .eq('id', sessionId)
        .maybeSingle();
      if (!ownedSession) return corsErrorResponse('Session not found', req, 404);

      // The (session_id, phase, behaviour_id) UNIQUE index means a plain
      // INSERT collides whenever a prior detection row exists for this
      // behaviour — which by definition is the case for a Retry. So we
      // UPDATE in place when a row exists, INSERT only when there's no
      // prior row. Mirrors resume_session's update-then-dispatch pattern.
      // Also reset any stale qa rows for this behaviour so the cascade
      // re-runs QA on the regenerated detections (D2 fix).
      const { data: existing, error: existingErr } = await adminClient
        .from('threat_research_jobs')
        .select('id')
        .eq('session_id', sessionId)
        .eq('phase', 'detection')
        .eq('behaviour_id', behaviourId)
        .maybeSingle();
      if (existingErr) {
        console.error('[entry] retry_leaf existence check failed:', existingErr.message);
        return corsErrorResponse('Failed to enqueue retry job', req, 500);
      }

      let jobId: string;
      if (existing?.id) {
        const { error: resetErr } = await adminClient
          .from('threat_research_jobs')
          .update({
            status: 'pending',
            attempt_count: 0,
            started_at: null,
            completed_at: null,
            failure_reason: null,
          })
          .eq('id', existing.id);
        if (resetErr) {
          console.error('[entry] retry_leaf reset failed:', resetErr.message);
          return corsErrorResponse('Failed to enqueue retry job', req, 500);
        }
        jobId = existing.id;
      } else {
        const { data: newJob, error: insertErr } = await adminClient
          .from('threat_research_jobs')
          .insert({ session_id: sessionId, phase: 'detection', behaviour_id: behaviourId })
          .select('id')
          .single();
        if (insertErr || !newJob) {
          console.error('[entry] retry_leaf insert failed:', insertErr?.message);
          return corsErrorResponse('Failed to enqueue retry job', req, 500);
        }
        jobId = newJob.id;
      }

      // Reset any qa rows for this behaviour back to pending so the
      // detection→qa cascade re-runs after regeneration. Without this,
      // existing qa rows in 'failed'/'completed' state block new dispatch
      // (composite ids 'b3/o1' etc collide with pre-retry rows).
      const { error: qaResetErr } = await adminClient
        .from('threat_research_jobs')
        .update({
          status: 'pending',
          attempt_count: 0,
          started_at: null,
          completed_at: null,
          failure_reason: null,
        })
        .eq('session_id', sessionId)
        .eq('phase', 'qa')
        .like('behaviour_id', `${behaviourId}/%`);
      if (qaResetErr) {
        console.warn('[entry] retry_leaf qa-reset failed (non-fatal):', qaResetErr.message);
      }

      // Restore session to 'running' so the dispatcher cascade doesn't
      // immediately re-mark it failed. Only flips when currently 'failed'.
      await adminClient
        .from('threat_research_sessions')
        .update({ status: 'running', failure_reason: null, completed_at: null, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('status', 'failed');

      // Bump model + tool caps so the retry has room to spend. Without this,
      // a leaf retry on a session whose original run already consumed the
      // entire cap (the common case — that's why we're retrying) will
      // instantly hit consumeBudget's allowed:false path on the FIRST model
      // call and emit qa_error: 'model_budget_exhausted' in milliseconds.
      // Sizing for single-pass QA: one retry = ~3 engineer calls + 1-2 QA
      // calls + 0-1 revision calls ≈ 6 model calls + ~6 tool calls. We bump
      // by 10/8 to give ~50% headroom in case the first attempt also dies.
      // The tr_bump_caps RPC caps absolute ceiling at 2000/2000 so a
      // misbehaving caller can't run the meter up indefinitely.
      const { error: bumpErr } = await adminClient.rpc('tr_bump_caps', {
        p_session_id: sessionId,
        p_model_delta: 10,
        p_tool_delta: 8,
      });
      if (bumpErr) {
        console.warn('[entry] retry_leaf cap bump failed (non-fatal):', bumpErr.message);
      }

      const { error: dispatchErr } = await adminClient.rpc('threat_research_dispatch_job', {
        p_job_id: jobId,
      });
      if (dispatchErr) {
        console.warn('[entry] retry_leaf dispatch failed (cron will retry):', dispatchErr.message);
      }

      return corsJsonResponse({ ok: true, job_id: jobId }, req);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Resume a failed session. Inserts fresh pending jobs for each failed
    // job in the session (preserving phase + behaviour_id), restores
    // session.status to 'running', and asks the cap-aware dispatcher to
    // fire one job per phase. Cron picks up the rest within a minute.
    // ──────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'resume_session') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
      if (!sessionId) return corsErrorResponse('session_id is required', req, 400);

      // Need tree to detect planner_status='degraded' below.
      const { data: ownedSession } = await userClient
        .from('threat_research_sessions')
        .select('id, tree')
        .eq('id', sessionId)
        .maybeSingle();
      if (!ownedSession) return corsErrorResponse('Session not found', req, 404);

      const { data: failed, error: failedErr } = await adminClient
        .from('threat_research_jobs')
        .select('id, phase, behaviour_id')
        .eq('session_id', sessionId)
        .eq('status', 'failed');
      if (failedErr) {
        console.error('[entry] resume_session query failed:', failedErr.message);
        return corsErrorResponse('Failed to read failed jobs', req, 500);
      }

      const retried = failed?.length ?? 0;
      if (retried > 0) {
        // Reset failed rows back to pending in-place. INSERT'ing new rows
        // collides with the unique (session_id, phase, behaviour_id) index
        // since the failed rows still occupy those slots. attempt_count
        // resets to 0 so the reaper gives the retry a clean budget.
        const ids = (failed ?? []).map(j => j.id);
        const { error: updateErr } = await adminClient
          .from('threat_research_jobs')
          .update({
            status: 'pending',
            attempt_count: 0,
            started_at: null,
            completed_at: null,
            failure_reason: null,
          })
          .in('id', ids);
        if (updateErr) {
          console.error('[entry] resume_session update failed:', updateErr.message);
          return corsErrorResponse('Failed to reset retry jobs', req, 500);
        }
      }

      // Planner-degraded recovery: when the Opportunity Planner failed and
      // the orchestrator fell back to 1:1 behaviour→opportunity, simply
      // re-running the failed detection jobs would preserve the degraded
      // (un-clustered) opportunities — defeating the planner's purpose.
      // Detect this and ALSO reset the opportunity_planning job back to
      // pending. The planner re-runs from scratch; new canonical
      // opportunities replace the 1:1 ones; the existing detection jobs
      // (now in pending) pick up against the proper clusters.
      //
      // We also clear tree.planner_status so a clean re-run can flip it
      // back to 'completed' on success.
      const treeAny = (ownedSession as { tree: unknown }).tree as
        | { planner_status?: string | null }
        | null;
      let plannerReset = 0;
      if (treeAny?.planner_status === 'degraded') {
        // Reset opportunity_planning back to pending so the planner re-runs
        // from scratch. CRITICAL: also DELETE downstream detection + qa
        // jobs. Their composite behaviour_ids (e.g. "b1/o1") were keyed off
        // the degraded-mode 1:1 opportunities. After the planner re-runs,
        // canonical opportunities will be renumbered — old composite IDs
        // would no longer match any tree entry and detection workers would
        // throw "opportunity not in tree". Deleting clears the slate so
        // promote_phase('detection') after re-planning creates fresh jobs
        // against the new opportunity IDs.
        const { error: deleteErr } = await adminClient
          .from('threat_research_jobs')
          .delete()
          .eq('session_id', sessionId)
          .in('phase', ['detection', 'qa', 'finalise']);
        if (deleteErr) {
          console.warn('[entry] resume_session detection/qa delete failed (non-fatal):', deleteErr.message);
        }

        const { data: plannerJobs, error: plannerErr } = await adminClient
          .from('threat_research_jobs')
          .update({
            status: 'pending',
            attempt_count: 0,
            started_at: null,
            completed_at: null,
            failure_reason: null,
          })
          .eq('session_id', sessionId)
          .eq('phase', 'opportunity_planning')
          .select('id');
        if (plannerErr) {
          console.warn('[entry] resume_session planner-reset failed (non-fatal):', plannerErr.message);
        } else {
          plannerReset = plannerJobs?.length ?? 0;
          // Clear the degraded flag and any partial opportunities in the
          // tree so the re-run can write fresh state. We don't touch
          // behaviours/subject/preflight/actor_coverage_seed — those are
          // valid output from upstream phases.
          const patchedTree = { ...(treeAny as Record<string, unknown>) };
          delete (patchedTree as { planner_status?: unknown }).planner_status;
          // Strip per-behaviour opportunities (the degraded 1:1 ones) so
          // the planner re-run writes against a clean slate.
          if (Array.isArray((patchedTree as { behaviours?: unknown }).behaviours)) {
            const behaviours = (patchedTree as { behaviours: Array<Record<string, unknown>> }).behaviours;
            for (const b of behaviours) {
              b.opportunities = [];
              delete b.merged_into_opportunity_ids;
            }
          }
          await adminClient
            .from('threat_research_sessions')
            .update({ tree: patchedTree })
            .eq('id', sessionId);
        }
      }

      await adminClient
        .from('threat_research_sessions')
        .update({ status: 'running', failure_reason: null, completed_at: null, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .in('status', ['failed', 'cancelled']);

      // Bump caps proportional to the retry workload BEFORE dispatching.
      // The first failed run almost always exhausted the cap (that's the
      // typical reason jobs failed in the first place); resuming without a
      // bump means every retry's first model call instantly trips
      // consumeBudget and emits qa_error: 'model_budget_exhausted' before
      // the worker even loads its prompt. Sizing for single-pass QA:
      // 10 model + 8 tool per retried job covers one full single-pass
      // detection+qa (~6 model + ~6 tool) plus ~50% headroom for one
      // worker death. Planner reset re-runs the planner and cascades to
      // detection + qa for every behaviour — but handleOpportunityPlanning
      // bumps its own caps when it fans out, so we only need to cover the
      // planner call itself (~5 model + ~5 tool). The RPC's hard ceiling
      // (2000/2000) prevents runaway accumulation.
      if (retried > 0 || plannerReset > 0) {
        const modelDelta = (retried * 10) + (plannerReset > 0 ? 10 : 0);
        const toolDelta = (retried * 8) + (plannerReset > 0 ? 8 : 0);
        const { error: bumpErr } = await adminClient.rpc('tr_bump_caps', {
          p_session_id: sessionId,
          p_model_delta: modelDelta,
          p_tool_delta: toolDelta,
        });
        if (bumpErr) {
          console.warn('[entry] resume_session cap bump failed (non-fatal):', bumpErr.message);
        }
      }

      // Kick the cap-aware dispatcher per distinct phase. Cron picks up
      // anything we don't dispatch here within a minute. Include
      // opportunity_planning in the phase list when we reset it above so
      // it fires immediately rather than waiting for cron.
      const phaseSet = new Set<string>((failed ?? []).map(j => j.phase));
      if (plannerReset > 0) phaseSet.add('opportunity_planning');
      for (const p of phaseSet) {
        await adminClient.rpc('threat_research_dispatch_next_in_phase', {
          p_session_id: sessionId,
          p_phase: p,
        });
      }

      return corsJsonResponse({ ok: true, retried, planner_reset: plannerReset }, req);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Complete QA on a session. Scans tree.behaviours[*].opportunities and
    // enqueues a `qa` phase job per opportunity that has detection.qa==null.
    // Each qa job processes ONE opportunity (~10-30s) and patches the result.
    // Used to recover sessions where handleDetection persisted opportunities
    // but never reached the QA emit (worker died mid-loop). Uses no Tavily —
    // QA tools are feasibility_lookup, environment_context, library_search.
    // ──────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'complete_qa') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
      if (!sessionId) return corsErrorResponse('session_id is required', req, 400);

      const { data: ownedSession } = await userClient
        .from('threat_research_sessions')
        .select('id, tree')
        .eq('id', sessionId)
        .maybeSingle();
      if (!ownedSession) return corsErrorResponse('Session not found', req, 404);

      const tree = (ownedSession as { tree: unknown }).tree as
        | { behaviours?: Array<{ id: string; opportunities?: Array<{ id: string; detection?: { qa?: unknown } }> }> }
        | null;
      const candidates: string[] = [];
      for (const b of tree?.behaviours ?? []) {
        for (const o of b.opportunities ?? []) {
          if (o.detection && (o.detection.qa === null || o.detection.qa === undefined)) {
            candidates.push(`${b.id}/${o.id}`);
          }
        }
      }

      if (candidates.length === 0) {
        return corsJsonResponse({ ok: true, enqueued: 0, message: 'No opportunities awaiting QA' }, req);
      }

      // Insert one qa job per candidate. ON CONFLICT DO NOTHING so re-running
      // complete_qa is idempotent — duplicate (session_id, phase, behaviour_id)
      // hits the unique index and silently skips.
      const rows = candidates.map(compositeId => ({
        session_id: sessionId, phase: 'qa', behaviour_id: compositeId,
      }));
      const { error: insertErr } = await adminClient
        .from('threat_research_jobs')
        .upsert(rows, { onConflict: 'session_id,phase,behaviour_id', ignoreDuplicates: true });
      if (insertErr) {
        console.error('[entry] complete_qa insert failed:', insertErr.message);
        return corsErrorResponse('Failed to enqueue qa jobs', req, 500);
      }

      // Restore session to 'running' so the dispatcher cascade keeps firing.
      // Only flips when currently failed/cancelled — running stays running.
      await adminClient
        .from('threat_research_sessions')
        .update({ status: 'running', failure_reason: null, completed_at: null, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .in('status', ['failed', 'cancelled']);

      // Dispatch the first qa job. Cron picks up the rest within a minute,
      // and each completing qa job dispatches the next via dispatchNextInPhase.
      await adminClient.rpc('threat_research_dispatch_next_in_phase', {
        p_session_id: sessionId,
        p_phase: 'qa',
      });

      return corsJsonResponse({ ok: true, enqueued: candidates.length }, req);
    }

    return corsErrorResponse('Bad request', req, 400);
  } catch (e) {
    console.error('[entry]:', e);
    return corsErrorResponse('Internal server error', req, 500);
  }
});
