-- 20260428_ai_cost_center.sql
-- GenAI Cost Center: usage events, daily rollup, budgets, overrides, RPCs, RLS, cron.

-- ============================================================================
-- ai_usage_events: raw per-call telemetry, retained 90 days
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  user_id               uuid REFERENCES profiles(id),
  feature               text NOT NULL,
  model                 text NOT NULL,
  provider              text NOT NULL,
  category              text NOT NULL CHECK (category IN ('llm','embedding','image','failed')),
  input_tokens          int  NOT NULL DEFAULT 0,
  output_tokens         int  NOT NULL DEFAULT 0,
  cached_input_tokens   int  NOT NULL DEFAULT 0,
  image_count           int  NOT NULL DEFAULT 0,
  cost_usd              numeric(10,6) NOT NULL DEFAULT 0,
  latency_ms            int,
  status                text NOT NULL CHECK (status IN
                          ('success','provider_error','rate_limit','budget_blocked','timeout')),
  error_code            text,
  request_id            text,
  metadata              jsonb
);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_feature_created_idx
  ON ai_usage_events (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_model_created_idx
  ON ai_usage_events (model, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx
  ON ai_usage_events (created_at DESC);

-- ============================================================================
-- ai_usage_daily: rolled-up aggregates, indefinite retention
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  day                  date NOT NULL,
  user_id              uuid,
  feature              text NOT NULL,
  model                text NOT NULL,
  category             text NOT NULL,
  call_count           int    NOT NULL,
  input_tokens         bigint NOT NULL,
  output_tokens        bigint NOT NULL,
  cached_input_tokens  bigint NOT NULL,
  image_count          bigint NOT NULL,
  cost_usd             numeric(12,4) NOT NULL,
  failure_count        int    NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, user_id, feature, model, category)
);

-- ============================================================================
-- ai_budgets: configured spending limits
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_budgets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN ('org','feature','user','model')),
  scope_value  text,
  period       text NOT NULL CHECK (period IN ('daily','monthly','rolling_30d')),
  limit_usd    numeric(10,2) NOT NULL CHECK (limit_usd > 0),
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES profiles(id),
  CHECK (
    (scope = 'org'  AND scope_value IS NULL) OR
    (scope IN ('feature','user','model') AND scope_value IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_budgets_org_unique
  ON ai_budgets (period) WHERE scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS ai_budgets_scoped_unique
  ON ai_budgets (scope, scope_value, period) WHERE scope != 'org';

-- ============================================================================
-- ai_budget_overrides: 24h override grants
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_budget_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id    uuid NOT NULL REFERENCES ai_budgets(id) ON DELETE CASCADE,
  granted_by   uuid NOT NULL REFERENCES profiles(id),
  granted_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  reason       text
);
CREATE INDEX IF NOT EXISTS ai_budget_overrides_active_idx
  ON ai_budget_overrides (budget_id, expires_at);

-- ============================================================================
-- get_current_spend RPC: spend for (scope, scope_value, period)
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
  v_window_start timestamptz;
  v_today        date := (now() AT TIME ZONE 'UTC')::date;
  v_total        numeric := 0;
BEGIN
  IF p_period = 'daily' THEN
    v_window_start := v_today::timestamptz;
  ELSIF p_period = 'monthly' THEN
    v_window_start := date_trunc('month', now() AT TIME ZONE 'UTC');
  ELSIF p_period = 'rolling_30d' THEN
    v_window_start := now() - interval '30 days';
  ELSE
    RAISE EXCEPTION 'invalid period: %', p_period;
  END IF;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_total
  FROM ai_usage_daily
  WHERE day >= v_window_start::date
    AND day <  v_today
    AND (
      p_scope = 'org' OR
      (p_scope = 'feature' AND feature = p_scope_value) OR
      (p_scope = 'user'    AND user_id = p_scope_value::uuid) OR
      (p_scope = 'model'   AND model = p_scope_value)
    );

  v_total := v_total + COALESCE((
    SELECT SUM(cost_usd)
    FROM ai_usage_events
    WHERE created_at >= GREATEST(v_window_start, v_today::timestamptz)
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

-- ============================================================================
-- rollup_ai_usage RPC: nightly rollup + 90d prune
-- ============================================================================
CREATE OR REPLACE FUNCTION rollup_ai_usage() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO ai_usage_daily (
    day, user_id, feature, model, category,
    call_count, input_tokens, output_tokens, cached_input_tokens,
    image_count, cost_usd, failure_count
  )
  SELECT
    (created_at AT TIME ZONE 'UTC')::date,
    user_id, feature, model, category,
    COUNT(*),
    SUM(input_tokens), SUM(output_tokens), SUM(cached_input_tokens),
    SUM(image_count), SUM(cost_usd),
    SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END)
  FROM ai_usage_events
  WHERE created_at >= (now() AT TIME ZONE 'UTC')::date - interval '1 day'
    AND created_at <  (now() AT TIME ZONE 'UTC')::date
  GROUP BY 1, 2, 3, 4, 5
  ON CONFLICT (day, user_id, feature, model, category) DO UPDATE SET
    call_count          = EXCLUDED.call_count,
    input_tokens        = EXCLUDED.input_tokens,
    output_tokens       = EXCLUDED.output_tokens,
    cached_input_tokens = EXCLUDED.cached_input_tokens,
    image_count         = EXCLUDED.image_count,
    cost_usd            = EXCLUDED.cost_usd,
    failure_count       = EXCLUDED.failure_count,
    updated_at          = now();

  DELETE FROM ai_usage_events
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE ai_usage_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budgets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_events_admin_select ON ai_usage_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')
  ));
CREATE POLICY ai_usage_events_self_select ON ai_usage_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY ai_usage_daily_admin_select ON ai_usage_daily
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')
  ));
CREATE POLICY ai_usage_daily_self_select ON ai_usage_daily
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY ai_budgets_admin_all ON ai_budgets
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')
  ));
CREATE POLICY ai_budgets_user_visible ON ai_budgets
  FOR SELECT USING (
    scope = 'org' OR (scope = 'user' AND scope_value = auth.uid()::text)
  );

CREATE POLICY ai_budget_overrides_admin_all ON ai_budget_overrides
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')
  ));

-- ============================================================================
-- Schedule the rollup nightly at 02:00 UTC
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ai_usage_rollup')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai_usage_rollup');
    PERFORM cron.schedule('ai_usage_rollup', '0 2 * * *', $cron$ SELECT rollup_ai_usage() $cron$);
  END IF;
END $$;
