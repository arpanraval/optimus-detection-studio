-- Atomic session abort for terminal provider failures.
--
-- Production session 793cafab, 2026-07-28, in 56 seconds:
--
--   22:49:49-54  attack-researcher x5  "credit balance is too low"
--   22:49:55     planner               "credit balance is too low"
--   22:49:55     orchestrator          PLANNER DEGRADED -> 1:1 fallback
--   22:50:03-05  detection-engineer x2 "credit balance is too low"
--                -> session_completed: "5 library matches"
--
-- Every worker discovered the same account-level failure independently, each
-- burning an attempt to learn it, and the pipeline still reported success. The
-- status had to be corrected to 'failed' by hand.
--
-- The fix has two halves. This migration is the control plane:
--
--   1. `aborted_at` / `abort_reason` on the session row.
--   2. tr_consume_budget reports the abort back to every worker. It already
--      takes `FOR UPDATE` on the session row before each model call, so the
--      flag rides along on a query the agent loop makes anyway -- no extra
--      round trip, and the check happens at exactly the point where spending
--      would otherwise occur.
--   3. tr_abort_session: idempotent, and fails every job that has not started
--      so nothing new can be claimed or dispatched.
--
-- What this deliberately does NOT do is stop a worker mid-call. Supabase Edge
-- has no cancellation channel -- EdgeRuntime.waitUntil keeps an isolate alive
-- by design and nothing external can kill it. So abort is COOPERATIVE: a
-- worker inside a 135s model call notices at its next budget check, which
-- bounds worst-case abort latency at roughly one model call. That is still
-- decisively better than the twenty-job cascade above.
--
-- Recovery is deliberate too: `aborted_at` is cleared by resume_session, so
-- topping up credits and resuming is a normal path rather than a dead session.

ALTER TABLE public.threat_research_sessions
  ADD COLUMN IF NOT EXISTS aborted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS abort_reason text;

COMMENT ON COLUMN public.threat_research_sessions.aborted_at IS
  'Set when a terminal, account-scoped provider failure (credit exhaustion, bad key, permission) made further work pointless. Workers observe this via tr_consume_budget and stop at their next checkpoint. Cleared by resume_session.';
COMMENT ON COLUMN public.threat_research_sessions.abort_reason IS
  'Human-readable cause of the abort, surfaced as the session failure_reason.';

-- ---------------------------------------------------------------------------
-- tr_consume_budget: body verbatim from the live definition, with exactly one
-- change -- the abort check immediately after the row is locked, before any
-- cap arithmetic. Placing it first matters: an aborted session must stop even
-- if it still has budget left.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_consume_budget(
  p_session_id uuid,
  p_tool_calls integer DEFAULT 0,
  p_model_calls integer DEFAULT 0,
  p_tokens integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tool int;
  v_model int;
  v_tokens int;
  v_cap_tool int;
  v_cap_model int;
  v_aborted_at timestamptz;
  v_abort_reason text;
  c_default_tool  constant int := 30;
  c_default_model constant int := 40;
BEGIN
  SELECT COALESCE(tool_calls_used, 0),
         COALESCE(model_calls_used, 0),
         COALESCE(total_tokens, 0),
         COALESCE(tool_call_cap,  c_default_tool),
         COALESCE(model_call_cap, c_default_model),
         aborted_at,
         abort_reason
    INTO v_tool, v_model, v_tokens, v_cap_tool, v_cap_model, v_aborted_at, v_abort_reason
    FROM public.threat_research_sessions
   WHERE id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'session not found');
  END IF;

  -- Checked before the caps: an aborted session must stop regardless of how
  -- much budget it has left.
  IF v_aborted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'aborted', true,
      'reason', COALESCE(v_abort_reason, 'session aborted'),
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model,
      'tokens_used', v_tokens
    );
  END IF;

  IF p_tool_calls > 0 AND v_tool + p_tool_calls > v_cap_tool THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('tool-call cap reached (%s/%s)', v_tool, v_cap_tool),
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model,
      'tokens_used', v_tokens
    );
  END IF;
  IF p_model_calls > 0 AND v_model + p_model_calls > v_cap_model THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('model-call cap reached (%s/%s)', v_model, v_cap_model),
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model,
      'tokens_used', v_tokens
    );
  END IF;

  UPDATE public.threat_research_sessions
     SET tool_calls_used  = COALESCE(tool_calls_used,  0) + p_tool_calls,
         model_calls_used = COALESCE(model_calls_used, 0) + p_model_calls,
         total_tokens     = COALESCE(total_tokens,     0) + p_tokens
   WHERE id = p_session_id;

  v_tool   := v_tool   + p_tool_calls;
  v_model  := v_model  + p_model_calls;
  v_tokens := v_tokens + p_tokens;

  RETURN jsonb_build_object(
    'allowed', true,
    'tool_used', v_tool, 'tool_cap', v_cap_tool,
    'model_used', v_model, 'model_cap', v_cap_model,
    'tokens_used', v_tokens
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- tr_abort_session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_abort_session(
  p_session_id uuid,
  p_reason     text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_already   timestamptz;
  v_cancelled int := 0;
BEGIN
  -- Idempotent by construction. Several workers hit the same account failure
  -- within the same second (five did in 793cafab), so the first one to arrive
  -- wins and the rest observe the existing abort rather than overwriting the
  -- reason or re-failing jobs.
  SELECT aborted_at INTO v_already
    FROM public.threat_research_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('aborted', false, 'reason', 'session not found');
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('aborted', true, 'already_aborted', true);
  END IF;

  UPDATE public.threat_research_sessions
     SET aborted_at     = now(),
         abort_reason   = p_reason,
         status         = 'failed',
         failure_reason = p_reason,
         completed_at   = now(),
         updated_at     = now()
   WHERE id = p_session_id;

  -- Fail everything not yet started. A pending job is pure future cost: it
  -- would be dispatched into a fresh worker only to hit the same account error.
  -- Running jobs are left alone -- they stop cooperatively at their next
  -- budget check, and killing their rows here would race with their own
  -- completion writes.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, p_reason),
         completed_at   = now()
   WHERE session_id = p_session_id
     AND status     = 'pending';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  RETURN jsonb_build_object(
    'aborted', true,
    'already_aborted', false,
    'pending_jobs_cancelled', v_cancelled
  );
END;
$function$;

COMMENT ON FUNCTION public.tr_abort_session(uuid, text) IS
  'Atomically abort a threat-research session after a terminal, account-scoped provider failure. Idempotent. Fails all pending jobs so nothing new is claimed; running workers stop cooperatively at their next tr_consume_budget call.';

-- Service-role only: this is orchestrator machinery, not a user action. Users
-- cancel through the existing cancel action, which has its own semantics.
REVOKE EXECUTE ON FUNCTION public.tr_abort_session(uuid, text) FROM PUBLIC, anon, authenticated;
