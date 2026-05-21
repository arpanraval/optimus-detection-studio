-- ============================================================================
-- 20260514 — Drop Confidence & Maturity columns from detections
--
-- Both fields were ambiguous in the UI and duplicated logic that's better
-- captured by Status (workflow stage) and Severity (impact). They've been
-- removed from the form/detail pages, the data model, the dashboard widget,
-- exports, and the priority scoring engine; this migration finishes the kill
-- at the database level.
--
-- Functions that previously copied `maturity` / `confidence` between
-- libraries (lab_to_production clone, promotion approval, approve-as-new)
-- are re-defined in supabase/setup/06_functions.sql without those columns
-- and must be redeployed alongside this migration.
-- ============================================================================

BEGIN;

ALTER TABLE public.detections
  DROP COLUMN IF EXISTS maturity,
  DROP COLUMN IF EXISTS confidence;

COMMIT;
