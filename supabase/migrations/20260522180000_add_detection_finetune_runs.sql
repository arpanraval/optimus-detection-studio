-- AI-assisted detection finetuning runs: one row per agentic finetuning session.
-- See docs/plans/2026-05-22-ai-finetuning-helper-design.md

CREATE TABLE IF NOT EXISTS detection_finetune_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  detection_id         text NOT NULL,
  integration_id       uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  preflight_run_id     uuid REFERENCES detection_preflight_runs(id) ON DELETE SET NULL,
  provider             text NOT NULL DEFAULT 'defender_xdr',
  anthropic_session_id text,
  status               text NOT NULL DEFAULT 'running',
  window_days          integer NOT NULL,
  original_query       text NOT NULL,
  baseline_hit_count   bigint,
  query_count          integer NOT NULL DEFAULT 0,
  nudged               boolean NOT NULL DEFAULT false,
  result               jsonb,
  error_message        text,
  usage                jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,

  CONSTRAINT detection_finetune_runs_provider_check
    CHECK (provider IN ('defender_xdr')),
  CONSTRAINT detection_finetune_runs_window_days_check
    CHECK (window_days BETWEEN 1 AND 30),
  CONSTRAINT detection_finetune_runs_status_check
    CHECK (status IN ('running','completed','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS detection_finetune_runs_detection_idx
  ON detection_finetune_runs (detection_id, created_at DESC);

-- At most one in-progress run per (detection, user) — prevents double-click /
-- concurrent-start races from creating duplicate running rows.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_finetune_run
  ON detection_finetune_runs (detection_id, user_id)
  WHERE (status = 'running');

ALTER TABLE detection_finetune_runs ENABLE ROW LEVEL SECURITY;

-- INSERT/UPDATE are performed only by the edge function via service_role (bypasses RLS).
-- Clients only ever SELECT their own rows.
CREATE POLICY "Users can view own finetune runs" ON detection_finetune_runs
  AS PERMISSIVE FOR SELECT TO public
  USING (auth.uid() = user_id);

-- Atomic budget reservation: increments query_count iff it is still under budget.
-- Returns the new count, or NULL when the budget is already spent.
CREATE OR REPLACE FUNCTION reserve_finetune_query_slot(p_run_id uuid, p_budget int)
RETURNS int
LANGUAGE sql
AS $$
  UPDATE detection_finetune_runs
     SET query_count = query_count + 1,
         updated_at  = now()
   WHERE id = p_run_id
     AND query_count < p_budget
  RETURNING query_count;
$$;

-- The RPC must only be callable by the edge function (service_role), never by clients.
REVOKE ALL ON FUNCTION reserve_finetune_query_slot(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_finetune_query_slot(uuid, int) TO service_role;
