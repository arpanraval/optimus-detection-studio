-- 20260430_threat_research.sql
-- Threat Research feature — sessions, event timeline, and library FK.

-- ── Sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threat_research_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,

  input_text           text NOT NULL,
  input_classification text,

  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  failure_reason       text,
  duration_ms          int,

  tree                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  environment_snapshot jsonb,

  coverage_impact      numeric,

  total_tokens         int,
  total_cost_usd       numeric,
  tool_calls_used      int,
  model_versions       jsonb
);

CREATE INDEX IF NOT EXISTS threat_research_sessions_user_idx
  ON threat_research_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS threat_research_sessions_status_idx
  ON threat_research_sessions (status, created_at DESC)
  WHERE status IN ('pending', 'running');

ALTER TABLE threat_research_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY trs_self_select ON threat_research_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY trs_admin_select ON threat_research_sessions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')
  ));
CREATE POLICY trs_self_insert ON threat_research_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY trs_self_update ON threat_research_sessions
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY trs_self_delete ON threat_research_sessions
  FOR DELETE USING (user_id = auth.uid());

-- ── Events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threat_research_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES threat_research_sessions(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  agent        text NOT NULL CHECK (agent IN
               ('orchestrator','preflight','research','attack-researcher','detection-engineer','qa')),
  event_type   text NOT NULL,
  message      text,
  duration_ms  int,
  payload      jsonb,
  narration    text
);

CREATE INDEX IF NOT EXISTS threat_research_events_session_idx
  ON threat_research_events (session_id, created_at);

ALTER TABLE threat_research_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tre_self_select ON threat_research_events;

CREATE POLICY tre_self_select ON threat_research_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM threat_research_sessions s
      WHERE s.id = threat_research_events.session_id
        AND s.user_id = auth.uid()
    )
  );
CREATE POLICY tre_admin_select ON threat_research_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')
  ));
-- Inserts are service-role only (orchestrator); no user-level INSERT policy.

-- ── Detections FK ───────────────────────────────────────────────────────
ALTER TABLE detections
  ADD COLUMN IF NOT EXISTS research_session_id uuid REFERENCES threat_research_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_node_id    text;

CREATE INDEX IF NOT EXISTS detections_research_session_idx
  ON detections (research_session_id) WHERE research_session_id IS NOT NULL;

-- Ensure research_node_id is cleared whenever research_session_id is cleared,
-- so detections don't keep stale breadcrumb node IDs after a session is deleted
-- (ON DELETE SET NULL only nulls the FK column).
CREATE OR REPLACE FUNCTION clear_research_node_on_session_clear()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.research_session_id IS NULL AND OLD.research_session_id IS NOT NULL THEN
    NEW.research_node_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS detections_clear_research_node_trigger ON detections;
CREATE TRIGGER detections_clear_research_node_trigger
  BEFORE UPDATE OF research_session_id ON detections
  FOR EACH ROW
  EXECUTE FUNCTION clear_research_node_on_session_clear();

-- ── Realtime ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'threat_research_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE threat_research_events';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'threat_research_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE threat_research_sessions';
  END IF;
END $$;
