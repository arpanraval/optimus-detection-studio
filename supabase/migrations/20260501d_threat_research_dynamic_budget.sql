-- 20260501d_threat_research_dynamic_budget.sql
--
-- Per-session budget caps. Walk-every-tactic Research can emit 20-30
-- behaviours; the prior static caps (model=40, tool=30) were sized when
-- Research was capped at 6 behaviours and starve every detection-engineer
-- leaf with `model_budget_exhausted`.
--
-- Once Research completes, the orchestrator writes computed caps to the
-- session row (formula: 5 + 8*N, capped at 300, where N = behaviour count).
-- tr_consume_budget reads the per-session caps and falls back to the prior
-- 40/30 defaults when NULL (so in-flight sessions keep their old behaviour).

ALTER TABLE public.threat_research_sessions
  ADD COLUMN IF NOT EXISTS model_call_cap integer,
  ADD COLUMN IF NOT EXISTS tool_call_cap  integer;

COMMENT ON COLUMN public.threat_research_sessions.model_call_cap IS
  'Per-session model-call hard cap; NULL means use default (40). Set by orchestrator after Research completes, sized to behaviour count.';
COMMENT ON COLUMN public.threat_research_sessions.tool_call_cap IS
  'Per-session tool-call hard cap; NULL means use default (30). Set by orchestrator after Research completes, sized to behaviour count.';

CREATE OR REPLACE FUNCTION public.tr_consume_budget(
  p_session_id uuid,
  p_tool_calls integer DEFAULT 0,
  p_model_calls integer DEFAULT 0,
  p_tokens integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_tool int;
  v_model int;
  v_tokens int;
  v_cap_tool int;
  v_cap_model int;
  -- Defaults used when the session row hasn't had its caps sized yet
  -- (i.e. before Research completes). Match prior behaviour.
  c_default_tool  constant int := 30;
  c_default_model constant int := 40;
  -- Tokens are alarm-only (alarm at 400K), never blocking.
BEGIN
  SELECT COALESCE(tool_calls_used, 0),
         COALESCE(model_calls_used, 0),
         COALESCE(total_tokens, 0),
         COALESCE(tool_call_cap,  c_default_tool),
         COALESCE(model_call_cap, c_default_model)
    INTO v_tool, v_model, v_tokens, v_cap_tool, v_cap_model
    FROM public.threat_research_sessions
   WHERE id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'session not found');
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
