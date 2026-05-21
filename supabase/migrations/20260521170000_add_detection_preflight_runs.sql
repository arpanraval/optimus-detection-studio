-- SIEM query pre-flight runs: one row per validation/backtest executed against a SIEM.
-- See docs/plans/2026-05-21-siem-query-preflight-design.md

CREATE TABLE IF NOT EXISTS detection_preflight_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  integration_id    uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  detection_id      text NOT NULL,
  provider          text NOT NULL,
  window_days       integer NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  validation_passed boolean NOT NULL DEFAULT false,
  hit_count         bigint,
  window_applied    boolean NOT NULL DEFAULT true,
  error_message     text,
  error_guidance    text,
  schema_warnings   jsonb,
  query_text        text,
  query_language    text DEFAULT 'KQL',
  sample            jsonb,
  breakdown         jsonb,
  duration_ms       integer,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT detection_preflight_runs_provider_check
    CHECK (provider IN ('defender_xdr')),
  CONSTRAINT detection_preflight_runs_window_days_check
    CHECK (window_days IN (7, 14, 30)),
  CONSTRAINT detection_preflight_runs_status_check
    CHECK (status IN ('pending','success','query_error','connection_error','timeout','permission_denied'))
);

CREATE INDEX IF NOT EXISTS detection_preflight_runs_detection_idx
  ON detection_preflight_runs (detection_id, created_at DESC);

ALTER TABLE detection_preflight_runs ENABLE ROW LEVEL SECURITY;

-- No UPDATE policy: rows are written atomically by the edge function (service_role),
-- which bypasses RLS. Client code should never UPDATE a run directly.

CREATE POLICY "Users can create own preflight runs" ON detection_preflight_runs
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own preflight runs" ON detection_preflight_runs
  AS PERMISSIVE FOR SELECT TO public
  USING (auth.uid() = user_id);
