-- Re-lock tr_consume_budget and reject nonsensical input.
--
-- 20260729160000 changed the function's signature, which required dropping the
-- four-argument version first. DROP discards the function's ACL, and Supabase's
-- default privileges then granted EXECUTE to PUBLIC, anon and authenticated on
-- the newly created one -- silently undoing 20260521193600_lock_down_rpc_execute
-- for this function.
--
-- Observed live before this migration:
--   =X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- The function is SECURITY DEFINER and validates no caller, so anyone holding a
-- session UUID could reach it through /rest/v1/rpc/tr_consume_budget and move
-- that session's counters. Supabase's linter flags exactly this shape
-- (0028_anon_security_definer_function_executable).
--
-- Two fixes, because the grant alone is necessary but not sufficient:
--
--   1. Restore service-role-only execution.
--   2. Reject negative arguments. Every parameter is a quantity of work
--      consumed or reserved; none is ever legitimately negative. Without the
--      check a negative p_tokens or p_tokens_release SUBTRACTS from the
--      counters -- so the failure mode was not merely denial of service but
--      silent budget inflation, and these caps are what stand between a
--      runaway session and a real bill.
--
-- Defence in depth: an argument guard inside the function stays correct even if
-- the grants are reset again by a future signature change. That is exactly how
-- this happened, so assuming it cannot recur would be the wrong lesson.
-- schema-check CI now asserts no SECURITY DEFINER function in public is
-- anon-executable.

CREATE OR REPLACE FUNCTION public.tr_consume_budget(
  p_session_id     uuid,
  p_tool_calls     integer DEFAULT 0,
  p_model_calls    integer DEFAULT 0,
  p_tokens         integer DEFAULT 0,
  p_phase          text    DEFAULT NULL,
  p_tokens_reserve integer DEFAULT 0,
  p_tokens_release integer DEFAULT 0
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
  v_token_cap int;
  v_tokens_reserved int;
  v_aborted_at timestamptz;
  v_abort_reason text;
  v_phase_cap int;
  v_phase_used int;
  v_phase_reserved int;
  c_default_tool  constant int := 30;
  c_default_model constant int := 40;
BEGIN
  -- Every parameter is a quantity consumed or reserved. A negative value would
  -- run the accounting backwards and hand out budget that was never earned.
  IF COALESCE(p_tool_calls, 0)     < 0
     OR COALESCE(p_model_calls, 0) < 0
     OR COALESCE(p_tokens, 0)      < 0
     OR COALESCE(p_tokens_reserve, 0) < 0
     OR COALESCE(p_tokens_release, 0) < 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'negative budget arguments are not permitted'
    );
  END IF;
  SELECT COALESCE(tool_calls_used, 0),
         COALESCE(model_calls_used, 0),
         COALESCE(total_tokens, 0),
         COALESCE(tool_call_cap,  c_default_tool),
         COALESCE(model_call_cap, c_default_model),
         token_cap,
         COALESCE(tokens_reserved, 0),
         aborted_at,
         abort_reason
    INTO v_tool, v_model, v_tokens, v_cap_tool, v_cap_model,
         v_token_cap, v_tokens_reserved, v_aborted_at, v_abort_reason
    FROM public.threat_research_sessions
   WHERE id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'session not found');
  END IF;

  -- Before the caps: an aborted session stops regardless of remaining budget.
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

  -- Session token gate. Counts in-flight reservations so concurrent workers
  -- cannot each pass and then collectively overspend.
  IF p_tokens_reserve > 0 AND v_token_cap IS NOT NULL
     AND v_tokens + v_tokens_reserved + p_tokens_reserve > v_token_cap THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('token cap reached (%s used + %s reserved + %s requested > %s)',
                       v_tokens, v_tokens_reserved, p_tokens_reserve, v_token_cap),
      'tokens_used', v_tokens, 'token_cap', v_token_cap,
      'tokens_reserved', v_tokens_reserved,
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model
    );
  END IF;

  -- Phase gate. A phase without a row is unbudgeted and passes.
  IF p_phase IS NOT NULL AND p_tokens_reserve > 0 THEN
    SELECT token_cap, tokens_used, tokens_reserved
      INTO v_phase_cap, v_phase_used, v_phase_reserved
      FROM public.threat_research_phase_budgets
     WHERE session_id = p_session_id AND phase = p_phase
     FOR UPDATE;
    IF FOUND AND v_phase_used + v_phase_reserved + p_tokens_reserve > v_phase_cap THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', format('phase token cap reached for %s (%s used + %s reserved + %s requested > %s)',
                         p_phase, v_phase_used, v_phase_reserved, p_tokens_reserve, v_phase_cap),
        'phase', p_phase,
        'phase_tokens_used', v_phase_used, 'phase_token_cap', v_phase_cap,
        'tokens_used', v_tokens, 'token_cap', v_token_cap
      );
    END IF;
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
         total_tokens     = COALESCE(total_tokens,     0) + p_tokens,
         -- GREATEST(0, ...) so a double settle, or a settle whose reserve was
         -- lost with a killed worker, cannot drive the counter negative and
         -- silently hand out free budget.
         tokens_reserved  = GREATEST(0, COALESCE(tokens_reserved, 0) + p_tokens_reserve - p_tokens_release)
   WHERE id = p_session_id;

  IF p_phase IS NOT NULL AND (p_tokens <> 0 OR p_tokens_reserve <> 0 OR p_tokens_release <> 0) THEN
    UPDATE public.threat_research_phase_budgets
       SET tokens_used     = tokens_used + p_tokens,
           tokens_reserved = GREATEST(0, tokens_reserved + p_tokens_reserve - p_tokens_release)
     WHERE session_id = p_session_id AND phase = p_phase;
  END IF;

  v_tool   := v_tool   + p_tool_calls;
  v_model  := v_model  + p_model_calls;
  v_tokens := v_tokens + p_tokens;

  RETURN jsonb_build_object(
    'allowed', true,
    'tool_used', v_tool, 'tool_cap', v_cap_tool,
    'model_used', v_model, 'model_cap', v_cap_model,
    'tokens_used', v_tokens, 'token_cap', v_token_cap
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.tr_consume_budget(uuid, integer, integer, integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tr_consume_budget(uuid, integer, integer, integer, text, integer, integer)
  TO service_role;

-- Restated so this migration is self-sufficient.
REVOKE ALL ON FUNCTION public.tr_set_phase_budgets(uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tr_set_phase_budgets(uuid, integer, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.tr_abort_session(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tr_abort_session(uuid, text) TO service_role;

COMMENT ON FUNCTION public.tr_consume_budget(uuid, integer, integer, integer, text, integer, integer) IS
  'Atomic budget check-and-spend for a threat-research session. SECURITY DEFINER, service-role only: it validates no caller identity, so end-user execution must stay revoked. Any future signature change must re-apply these grants -- DROP discards the ACL and Supabase default privileges re-grant anon/authenticated.';
