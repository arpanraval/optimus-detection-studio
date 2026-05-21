-- 20260518120400_threat_research_observability.sql
--
-- Observability upgrades for the threat-research orchestrator:
--   1. tr_promote_finalise_if_ready now returns a jsonb diagnostic so the
--      orchestrator can emit a finalise_gate_checked event with the actual
--      pending counts. Pre-fix, the RPC returned NULL on blocked and the
--      orchestrator had no visibility into why finalise wasn't firing.
--   2. New tr_session_debug(uuid) function returns a single jsonb with
--      session row + budget + tree counts (behaviours / opportunities /
--      library_matches / qa verdicts / engineer_failed / merged-into) +
--      job list with per-job duration + ai_usage rollup with cache hit %.
--      One query, full post-mortem.
--
-- Both functions are SECURITY DEFINER and granted to service_role +
-- authenticated. tr_session_debug filters AI usage by user_id + time
-- window + feature prefix 'tr-' so a user reading their own session
-- can't see another user's usage (RLS-equivalent at the function level).
-- KNOWN LIMITATION: ai_usage_events has no session_id FK; the time-window
-- filter approximates the join. A user running two concurrent threat-
-- research sessions would see merged usage. Documented; fix later by
-- threading session_id into ai_usage_events.metadata at the call site.

-- ─── 1. Extended finalise gate ──────────────────────────────────────────
-- Return type changed from uuid to jsonb. Postgres doesn't allow return-
-- type change via CREATE OR REPLACE; must DROP first. The previous
-- function was created in 20260518120300 (return uuid).
DROP FUNCTION IF EXISTS public.tr_promote_finalise_if_ready(uuid);

CREATE OR REPLACE FUNCTION public.tr_promote_finalise_if_ready(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_detection_pending int;
  v_detection_total   int;
  v_qa_pending        int;
  v_qa_total          int;
  v_finalise_id       uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tr-finalise-' || p_session_id::text));

  SELECT
    count(*) FILTER (WHERE status NOT IN ('completed','failed')),
    count(*)
    INTO v_detection_pending, v_detection_total
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id AND phase = 'detection';

  SELECT
    count(*) FILTER (WHERE status NOT IN ('completed','failed')),
    count(*)
    INTO v_qa_pending, v_qa_total
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id AND phase = 'qa';

  IF v_detection_pending > 0 OR v_qa_pending > 0 THEN
    RETURN jsonb_build_object(
      'fired', false,
      'reason', 'blocked',
      'detection_pending', v_detection_pending,
      'detection_total', v_detection_total,
      'qa_pending', v_qa_pending,
      'qa_total', v_qa_total
    );
  END IF;

  -- Idempotency: another concurrent worker may have already inserted
  -- finalise after the advisory lock was released. Bail with diagnostic.
  SELECT id INTO v_finalise_id
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id AND phase = 'finalise'
   LIMIT 1;
  IF v_finalise_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'fired', false,
      'reason', 'already_exists',
      'finalise_job_id', v_finalise_id,
      'detection_total', v_detection_total,
      'qa_total', v_qa_total
    );
  END IF;

  INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id)
  VALUES (p_session_id, 'finalise', NULL)
  RETURNING id INTO v_finalise_id;

  UPDATE public.threat_research_jobs
     SET status = 'running', started_at = now()
   WHERE id = v_finalise_id;

  PERFORM public.threat_research_dispatch_job(v_finalise_id);

  RETURN jsonb_build_object(
    'fired', true,
    'reason', 'gate_cleared',
    'finalise_job_id', v_finalise_id,
    'detection_total', v_detection_total,
    'qa_total', v_qa_total
  );
END;
$function$;

COMMENT ON FUNCTION public.tr_promote_finalise_if_ready(uuid) IS
  'Atomically gates detection+qa -> finalise. Returns diagnostic jsonb: {fired, reason, detection_pending/total, qa_pending/total, finalise_job_id?}. Idempotent via session advisory lock + existing-row check.';

GRANT EXECUTE ON FUNCTION public.tr_promote_finalise_if_ready(uuid) TO service_role;

-- ─── 2. One-shot session debug snapshot ─────────────────────────────────
-- Usage:
--   SELECT public.tr_session_debug('11111111-2222-3333-4444-555555555555'::uuid);
-- Returns a single jsonb document. Designed for post-mortem inspection;
-- the UI activity console still pulls live events from threat_research_events.

CREATE OR REPLACE FUNCTION public.tr_session_debug(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_session record;
  v_jobs jsonb;
  v_ai_usage jsonb;
  v_tree_summary jsonb;
BEGIN
  -- 1. Session row.
  SELECT id, user_id, status, failure_reason, input_text, input_classification,
         duration_ms, model_calls_used, model_call_cap, tool_calls_used, tool_call_cap,
         total_tokens, created_at, completed_at, updated_at, tree
    INTO v_session
    FROM public.threat_research_sessions
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'session not found', 'session_id', p_session_id);
  END IF;

  -- 2. Authorization: a user can only inspect their own sessions. Service
  -- role bypasses RLS so this function-level check matters.
  IF v_session.user_id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('owner','admin')
     )
     AND current_setting('role') <> 'service_role'
  THEN
    RETURN jsonb_build_object('error', 'forbidden', 'session_id', p_session_id);
  END IF;

  -- 3. Jobs summary with per-job duration.
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', id,
             'phase', phase,
             'status', status,
             'behaviour_id', behaviour_id,
             'attempt_count', attempt_count,
             'started_at', started_at,
             'completed_at', completed_at,
             'failure_reason', failure_reason,
             'duration_ms', CASE
               WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
                 THEN round(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::int
               ELSE NULL
             END
           )
           ORDER BY created_at
         ) INTO v_jobs
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id;

  -- 4. AI usage rollup (per feature x model) over the session's lifetime.
  -- Approximated by user_id + time window + 'tr-' feature prefix because
  -- ai_usage_events has no session_id FK today. See file header.
  SELECT jsonb_agg(g) INTO v_ai_usage
    FROM (
      SELECT jsonb_build_object(
               'feature', feature,
               'model', model,
               'calls', count(*),
               'success_calls', count(*) FILTER (WHERE status = 'success'),
               'failed_calls', count(*) FILTER (WHERE status <> 'success'),
               'rate_limit_calls', count(*) FILTER (WHERE status = 'rate_limit'),
               'timeout_calls', count(*) FILTER (WHERE status = 'timeout'),
               'input_tokens', sum(input_tokens),
               'cached_input_tokens', sum(cached_input_tokens),
               'output_tokens', sum(output_tokens),
               'cost_usd', round(sum(cost_usd)::numeric, 4),
               'avg_latency_ms', round(avg(latency_ms)::numeric, 0),
               'cache_hit_pct', round(
                 100.0 * sum(cached_input_tokens) /
                 NULLIF(sum(input_tokens + cached_input_tokens), 0),
                 1
               )
             ) AS g
        FROM public.ai_usage_events
       WHERE user_id = v_session.user_id
         AND feature LIKE 'tr-%'
         AND created_at >= v_session.created_at
         AND created_at <= COALESCE(v_session.completed_at, now())
       GROUP BY feature, model
       ORDER BY feature, model
    ) sub;

  -- 5. Tree summary (counts derived from the JSONB tree state).
  WITH tree AS (SELECT v_session.tree AS t),
       behaviours AS (
         SELECT b
           FROM tree, jsonb_array_elements(COALESCE(t->'behaviours', '[]'::jsonb)) b
       ),
       opportunities AS (
         SELECT o, b
           FROM behaviours,
                jsonb_array_elements(COALESCE(b->'opportunities', '[]'::jsonb)) o
       )
  SELECT jsonb_build_object(
    'planner_status', v_session.tree->>'planner_status',
    'subject_classification', v_session.tree->'subject'->>'classification',
    'subject_name', v_session.tree->'subject'->>'subject',
    'behaviour_count', (SELECT count(*) FROM behaviours),
    'opportunity_count', (SELECT count(*) FROM opportunities),
    'detection_with_query', (
      SELECT count(*) FROM opportunities
       WHERE COALESCE(length(o->'detection'->>'query'), 0) > 0
    ),
    'library_match_count', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->>'saved_detection_id' IS NOT NULL
    ),
    'qa_passed', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'verdict' = 'pass'
    ),
    'qa_pass_with_concerns', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'verdict' = 'pass_with_concerns'
    ),
    'qa_failed', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'verdict' = 'fail'
    ),
    'qa_error_count', (
      SELECT count(*) FROM opportunities
       WHERE (o->'detection'->>'qa_error') IS NOT NULL
         AND (o->'detection'->>'qa_error') <> ''
    ),
    'engineer_failed_count', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->>'qa_error' = 'engineer_failed'
    ),
    'behaviours_not_detectable', (
      SELECT count(*) FROM behaviours
       WHERE b->>'detectability' = 'not_detectable'
    ),
    'behaviours_merged_into_others', (
      SELECT count(*) FROM behaviours
       WHERE jsonb_array_length(COALESCE(b->'merged_into_opportunity_ids', '[]'::jsonb)) > 0
    ),
    'duplicates_flagged', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'duplicate_of' IS NOT NULL
    )
  ) INTO v_tree_summary;

  -- 6. Assemble the final document.
  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'failure_reason', v_session.failure_reason,
      'input_text', v_session.input_text,
      'input_classification', v_session.input_classification,
      'duration_ms', v_session.duration_ms,
      'budget', jsonb_build_object(
        'model_calls_used', v_session.model_calls_used,
        'model_call_cap', v_session.model_call_cap,
        'tool_calls_used', v_session.tool_calls_used,
        'tool_call_cap', v_session.tool_call_cap,
        'total_tokens', v_session.total_tokens
      ),
      'created_at', v_session.created_at,
      'completed_at', v_session.completed_at
    ),
    'tree_summary', v_tree_summary,
    'jobs', COALESCE(v_jobs, '[]'::jsonb),
    'ai_usage', COALESCE(v_ai_usage, '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.tr_session_debug(uuid) IS
  'One-shot session debug snapshot. Returns single jsonb: session + budget + tree counts + job list with per-job durations + ai_usage rollup with cache hit %. Designed for post-mortem (Activity Console pulls live events from threat_research_events).';

GRANT EXECUTE ON FUNCTION public.tr_session_debug(uuid) TO service_role, authenticated;
