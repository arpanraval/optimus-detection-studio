-- 20260429c_ai_cost_center_grants_hardening.sql
-- Lock down the cost-center RPCs surfaced by Supabase's auto-grants:
--
-- 1. get_current_spend  — was callable by anon. The in-function authz check
--    relied on `auth.uid()` being a UUID; for anon callers it is NULL, and the
--    comparison `scope_value::uuid <> auth.uid()` evaluates to NULL — which the
--    IF treated as false, allowing the call to fall through. Add an explicit
--    NULL guard at the top of the function and REVOKE EXECUTE from anon so
--    only authenticated callers reach it (defense in depth).
--
-- 2. rollup_ai_usage    — was callable by PUBLIC, anon, authenticated. This
--    function is intended to be invoked only by pg_cron (or a privileged
--    operator). REVOKE EXECUTE from PUBLIC, anon, and authenticated so it can
--    no longer be triggered via /rest/v1/rpc/rollup_ai_usage.

-- ============================================================================
-- get_current_spend: harden authz
-- ============================================================================
CREATE OR REPLACE FUNCTION get_current_spend(
  p_scope       text,
  p_scope_value text,
  p_period      text
) RETURNS numeric
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start    timestamptz;
  v_today           date := (now() AT TIME ZONE 'UTC')::date;
  v_rollup_cutoff   date;
  v_total           numeric := 0;
BEGIN
  -- Resolve window start
  IF p_period = 'daily' THEN
    v_window_start := v_today::timestamptz;
  ELSIF p_period = 'monthly' THEN
    v_window_start := date_trunc('month', now() AT TIME ZONE 'UTC');
  ELSIF p_period = 'rolling_30d' THEN
    v_window_start := now() - interval '30 days';
  ELSE
    RAISE EXCEPTION 'invalid period: %', p_period;
  END IF;

  -- Authorization: reject anon callers explicitly. NULL auth.uid() previously
  -- caused the role check below to short-circuit through three-valued logic.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden: authentication required';
  END IF;

  -- Non-admins may only query their own user-scoped spend.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')) THEN
    IF p_scope <> 'user' OR p_scope_value IS NULL OR p_scope_value::uuid <> auth.uid() THEN
      RAISE EXCEPTION 'forbidden: requires owner/admin role for non-self spend queries';
    END IF;
  END IF;

  -- Rollup high-water: max day already aggregated. Default v_today (no rollup yet).
  SELECT COALESCE(MAX(day) + 1, v_today) INTO v_rollup_cutoff
  FROM ai_usage_daily;

  -- Sum from rollup (already-aggregated full days within window)
  SELECT COALESCE(SUM(cost_usd), 0) INTO v_total
  FROM ai_usage_daily
  WHERE day >= v_window_start::date
    AND day <  v_rollup_cutoff
    AND (
      p_scope = 'org' OR
      (p_scope = 'feature' AND feature = p_scope_value) OR
      (p_scope = 'user'    AND user_id = p_scope_value::uuid) OR
      (p_scope = 'model'   AND model = p_scope_value)
    );

  -- Sum raw events for everything not yet rolled up (clamped to window start)
  v_total := v_total + COALESCE((
    SELECT SUM(cost_usd)
    FROM ai_usage_events
    WHERE created_at >= GREATEST(v_window_start, v_rollup_cutoff::timestamptz)
      AND (
        p_scope = 'org' OR
        (p_scope = 'feature' AND feature = p_scope_value) OR
        (p_scope = 'user'    AND user_id = p_scope_value::uuid) OR
        (p_scope = 'model'   AND model = p_scope_value)
      )
  ), 0);

  RETURN v_total;
END;
$$;

-- Strip Supabase's auto-applied grants. Only `authenticated` should reach
-- the function; the in-function gate then enforces admin vs. self.
REVOKE EXECUTE ON FUNCTION get_current_spend(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_current_spend(text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION get_current_spend(text, text, text) TO authenticated;

-- ============================================================================
-- rollup_ai_usage: cron-only
-- ============================================================================
REVOKE EXECUTE ON FUNCTION rollup_ai_usage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rollup_ai_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION rollup_ai_usage() FROM authenticated;
-- service_role retains EXECUTE (it bypasses RLS by design and cron jobs run
-- under postgres-owned schedule). No GRANT needed here.
