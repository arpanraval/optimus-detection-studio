-- 20260518b_threat_research_bump_caps.sql
--
-- Stage-based budget caps: a single helper to atomically raise model/tool
-- call caps on a session row.
--
-- WHY: the original budget sizing was `5 + 18 * N_behaviours` set once after
-- the Research Agent completed. That formula multiplied an estimated per-
-- behaviour cost by behaviour count, which conflated two independent sources
-- of cost:
--   • per-behaviour cost (attack research + initial detection generation),
--     which IS roughly proportional to N
--   • per-opportunity cost (the actor-critic QA loop runs once per
--     opportunity, not per behaviour), which is proportional to the
--     opportunity count — unknown until the Detection Engineer emits its
--     wrapper for each behaviour
--
-- The old formula either over-budgeted shallow sessions (wasted budget head-
-- room) or under-budgeted noisy sessions (QA aborted with budget_exhausted
-- after the first few opportunities, leaving the remainder unprocessed and
-- mis-rendered as detection-quality failures).
--
-- The new model: handleResearch sets an initial cap sized for the
-- pre-opportunity phases only (research + attack + detection initial gen).
-- handleDetection then calls this helper AFTER its wrapper lands in the
-- tree, bumping the caps by the QA cost proportional to opportunity count
-- on that one behaviour. Concurrent handleDetection workers each call this
-- atomically — no last-writer-wins races.

CREATE OR REPLACE FUNCTION public.tr_bump_caps(
  p_session_id  uuid,
  p_model_delta integer,
  p_tool_delta  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_model int;
  v_tool  int;
BEGIN
  -- Hard ceiling so a misbehaving caller can't push caps to absurd values.
  -- 2000 is well above any realistic session (worst-case Volt Typhoon-class
  -- breakdown: ~20 behaviours × ~3 opportunities × ~5 QA calls = 300 calls,
  -- plus another ~100 for research/attack/engineer-gen).
  UPDATE public.threat_research_sessions
     SET model_call_cap = LEAST(2000, COALESCE(model_call_cap, 40) + GREATEST(0, p_model_delta)),
         tool_call_cap  = LEAST(2000, COALESCE(tool_call_cap,  30) + GREATEST(0, p_tool_delta)),
         updated_at     = now()
   WHERE id = p_session_id
   RETURNING model_call_cap, tool_call_cap
        INTO v_model, v_tool;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'model_call_cap', v_model,
    'tool_call_cap',  v_tool
  );
END;
$$;

COMMENT ON FUNCTION public.tr_bump_caps(uuid, integer, integer) IS
  'Atomically raise per-session model/tool call caps. Used by handleDetection after the opportunity wrapper lands, to provision budget for the per-opportunity QA actor-critic. Concurrent-safe.';

GRANT EXECUTE ON FUNCTION public.tr_bump_caps(uuid, integer, integer) TO service_role;
