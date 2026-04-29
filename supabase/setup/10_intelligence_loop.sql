-- ============================================================
-- 10_intelligence_loop.sql - Detection Intelligence Loop tables
-- Run after: 09_indexes.sql (or latest setup file)
-- ============================================================

-- ============================================================
-- TABLE: analysis_reports
-- Stores AI-generated analysis reports (playbook, CVE response,
-- threat digest coverage, manual) with coverage scores and trends.
-- ============================================================

CREATE TABLE analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  playbook_id text,
  title text NOT NULL,
  inputs jsonb DEFAULT '{}',
  step_results jsonb DEFAULT '[]',
  context jsonb DEFAULT '{}',
  generated_sections jsonb DEFAULT '{}',
  report_template jsonb,
  coverage_score numeric,
  score_breakdown jsonb,
  previous_report_id uuid REFERENCES analysis_reports(id) ON DELETE SET NULL,
  score_delta numeric,
  environment_snapshot jsonb,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT analysis_reports_type_check CHECK (
    report_type IN ('playbook', 'cve_response', 'threat_digest_coverage', 'manual')
  )
);

CREATE INDEX idx_reports_user ON analysis_reports(user_id);
CREATE INDEX idx_reports_type ON analysis_reports(report_type);
CREATE INDEX idx_reports_playbook ON analysis_reports(playbook_id);
CREATE INDEX idx_reports_created ON analysis_reports(created_at DESC);
CREATE INDEX idx_reports_trend ON analysis_reports(user_id, playbook_id, created_at DESC);

-- ============================================================
-- TABLE: detection_decisions
-- Immutable audit trail of decisions made on detections or
-- techniques (status changes, tuning, gap acceptance, etc.).
-- No UPDATE or DELETE policies — append-only by design.
-- ============================================================

CREATE TABLE detection_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  detection_id text REFERENCES detections(id) ON DELETE CASCADE,
  technique_id text,
  decision_type text NOT NULL,
  decision_context text NOT NULL,
  reasoning text,
  quick_reason text,
  previous_value text,
  new_value text,
  related_entity_ids text[],
  review_by timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT detection_decisions_type_check CHECK (
    decision_type IN ('status_change', 'query_tuning', 'gap_accepted', 'gap_rejected',
                      'review_decision', 'deprecation', 'priority_change', 'deployment')
  )
);

CREATE INDEX idx_decisions_detection ON detection_decisions(detection_id);
CREATE INDEX idx_decisions_user ON detection_decisions(user_id);
CREATE INDEX idx_decisions_type ON detection_decisions(decision_type);
CREATE INDEX idx_decisions_technique ON detection_decisions(technique_id);
CREATE INDEX idx_decisions_created ON detection_decisions(created_at DESC);

-- ============================================================
-- TABLE: detection_patterns
-- Extracted structural patterns from detections used by the AI
-- for pattern learning and coverage gap analysis.
-- ============================================================

CREATE TABLE detection_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  detection_id text NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  technique_ids text[],
  tactics text[],
  log_sources text[],
  platforms text[],
  query_languages text[],
  source text,
  severity text,
  fields_used text[],
  query_snippet text,
  detection_categories text[],
  extracted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT detection_patterns_unique UNIQUE (user_id, detection_id)
);

CREATE INDEX idx_patterns_user ON detection_patterns(user_id);
CREATE INDEX idx_patterns_techniques ON detection_patterns USING gin(technique_ids);
CREATE INDEX idx_patterns_log_sources ON detection_patterns USING gin(log_sources);
CREATE INDEX idx_patterns_platforms ON detection_patterns USING gin(platforms);
CREATE INDEX idx_patterns_categories ON detection_patterns USING gin(detection_categories);
CREATE INDEX idx_patterns_languages ON detection_patterns USING gin(query_languages);

-- ============================================================
-- RLS: analysis_reports
-- ============================================================

ALTER TABLE analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY analysis_reports_select_own ON analysis_reports
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY analysis_reports_insert ON analysis_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY analysis_reports_update ON analysis_reports
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY analysis_reports_delete ON analysis_reports
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- RLS: detection_decisions
-- No UPDATE policy — decisions are append-only (immutable)
-- No DELETE policy — decisions form an audit trail
-- ============================================================

ALTER TABLE detection_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY detection_decisions_select ON detection_decisions
  FOR SELECT USING (
    user_id = auth.uid()
    OR detection_id IN (SELECT id FROM detections WHERE user_id = auth.uid())
  );

CREATE POLICY detection_decisions_insert ON detection_decisions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS: detection_patterns
-- ============================================================

ALTER TABLE detection_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY detection_patterns_select ON detection_patterns
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY detection_patterns_insert ON detection_patterns
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY detection_patterns_update ON detection_patterns
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY detection_patterns_delete ON detection_patterns
  FOR DELETE USING (user_id = auth.uid());
