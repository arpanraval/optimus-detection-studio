-- Budget in tokens, reserved per phase.
--
-- The session budget counts MODEL CALLS. Calls are not money:
--
--   session     model calls   tokens
--   bc5804b3            169   1,175,033
--   048fdd12             28     165,745
--
-- Six times the calls, seven times the tokens -- the ratio is unstable because
-- one 16K-token call costs roughly fifty times a 300-token one. tr_consume_budget
-- already tracks tokens and its own comment calls them "alarm-only, never
-- blocking". That comment is the defect: a call-count cap cannot bound spend.
--
-- Two changes here.
--
-- 1. TOKENS ARE THE CURRENCY, with reserve-then-settle.
--
--    Actual usage is unknown until the response returns, so a pre-call check
--    against `total_tokens` alone lets N concurrent workers each pass the gate
--    and then collectively blow the cap. Instead the caller RESERVES its
--    worst case (max_tokens plus an input estimate) before the call and
--    SETTLES the reservation against real usage afterwards. The gate tests
--    `used + reserved + this reservation`, so concurrent workers see each
--    other's in-flight spend.
--
--    Reservations are released on settle. A worker killed mid-call leaks its
--    reservation for the life of the session -- deliberately conservative: an
--    over-tight budget fails a leaf, an under-tight one spends real money.
--
-- 2. PHASES GET FLOORS.
--
--    199 production failures read "model-call budget exhausted". Because the
--    budget is one session-wide counter drawn down by leaves running in
--    parallel, whichever leaves ran last were starved -- and those are the
--    detection and QA leaves, i.e. the only ones that produce output the user
--    can act on. Session a6cfb090 used exactly 257/257 and ce6be6cf exactly
--    203/203, then failed everything remaining.
--
--    A phase with a floor cannot be starved by an earlier phase overrunning.
--    Research and attack_research share what is left over; detection and QA
--    are guaranteed. Sizing policy lives in TypeScript (lib/budget-policy.ts)
--    where it can be unit tested; this migration only enforces it.

ALTER TABLE public.threat_research_sessions
  ADD COLUMN IF NOT EXISTS token_cap       integer,
  ADD COLUMN IF NOT EXISTS tokens_reserved integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.threat_research_sessions.token_cap IS
  'Hard session spend bound in tokens. NULL means unbounded (pre-sizing, i.e. before research completes). Model/tool call caps remain as a secondary runaway guard.';
COMMENT ON COLUMN public.threat_research_sessions.tokens_reserved IS
  'Tokens reserved by in-flight calls that have not yet settled. Makes concurrent workers visible to each other''s pre-call budget check.';

CREATE TABLE IF NOT EXISTS public.threat_research_phase_budgets (
  session_id      uuid NOT NULL
                  REFERENCES public.threat_research_sessions(id) ON DELETE CASCADE,
  phase           text NOT NULL,
  token_cap       integer NOT NULL,
  tokens_used     integer NOT NULL DEFAULT 0,
  tokens_reserved integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, phase)
);

COMMENT ON TABLE public.threat_research_phase_budgets IS
  'Per-phase token floors. A phase with a floor cannot be starved by an earlier phase overrunning -- the failure that left detection and QA leaves dead in 199 recorded agent failures.';

ALTER TABLE public.threat_research_phase_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.threat_research_phase_budgets FROM PUBLIC, anon;

-- Users may read their own phase budgets so the UI can show remaining spend.
DROP POLICY IF EXISTS trpb_self_select ON public.threat_research_phase_budgets;
CREATE POLICY trpb_self_select ON public.threat_research_phase_budgets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.threat_research_sessions s
     WHERE s.id = threat_research_phase_budgets.session_id
       AND s.user_id = (SELECT auth.uid())
  ));
GRANT SELECT ON TABLE public.threat_research_phase_budgets TO authenticated;

-- ---------------------------------------------------------------------------
-- tr_consume_budget: adds token reserve/settle and the phase gate.
--
-- Body is the live definition plus the abort check from 20260729140000, with
-- the token logic added. New parameters all default, so an older deployed
-- worker calling the four-argument form keeps working unchanged -- important
-- because this lands BEFORE the edge function is redeployed.
--
-- The DROP is load-bearing, not tidying. Postgres identifies a function by its
-- full argument list, so CREATE OR REPLACE with three extra parameters creates
-- a SECOND overload rather than replacing the first. Both would then match a
-- four-argument call -- the old one exactly, the new one through its defaults
-- -- and Postgres would reject it as ambiguous (42725). Every budget check
-- happens immediately before a model call, so the result would be that no
-- agent in any session could make one.
--
-- Dropping first is safe for the running v84 worker: PostgREST resolves its
-- four named arguments against the new function's defaults.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tr_consume_budget(uuid, integer, integer, integer);

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

-- ---------------------------------------------------------------------------
-- tr_set_phase_budgets: install the sizing computed in TypeScript.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_set_phase_budgets(
  p_session_id uuid,
  p_token_cap  integer,
  p_phases     jsonb          -- {"detection": 300000, "qa": 120000, ...}
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_phase text;
  v_cap   int;
  v_count int := 0;
BEGIN
  UPDATE public.threat_research_sessions
     SET token_cap  = p_token_cap,
         updated_at = now()
   WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session not found');
  END IF;

  FOR v_phase, v_cap IN SELECT key, value::int FROM jsonb_each_text(p_phases) LOOP
    INSERT INTO public.threat_research_phase_budgets (session_id, phase, token_cap)
    VALUES (p_session_id, v_phase, v_cap)
    ON CONFLICT (session_id, phase) DO UPDATE
      -- Re-sizing may only raise a floor. Lowering one mid-session could
      -- retroactively starve a phase that has already spent against it.
      SET token_cap = GREATEST(public.threat_research_phase_budgets.token_cap, EXCLUDED.token_cap);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'phases', v_count, 'token_cap', p_token_cap);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tr_set_phase_budgets(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
