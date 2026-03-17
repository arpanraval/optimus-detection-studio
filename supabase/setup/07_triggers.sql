-- ============================================================
-- 07_triggers.sql - All trigger definitions
-- Run after: 06_functions.sql
-- Generated from live Supabase database (PostgreSQL 17)
-- ============================================================

-- ============================================================
-- Auth schema trigger
-- ============================================================

-- Create user profile in public.profiles when a new auth user signs up
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Public schema triggers - updated_at auto-setters
-- ============================================================

-- bulk_import_jobs: set updated_at on row update
CREATE OR REPLACE TRIGGER bulk_import_jobs_updated_at
  BEFORE UPDATE ON public.bulk_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_bulk_import_jobs_updated_at();

-- environment_profiles: set updated_at on row update
CREATE OR REPLACE TRIGGER trg_environment_profiles_updated_at
  BEFORE UPDATE ON public.environment_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_environment_profiles_updated_at();

-- integration_credentials: set updated_at on row update
CREATE OR REPLACE TRIGGER integration_credentials_updated_at
  BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_integrations_updated_at();

-- integrations: set updated_at on row update
CREATE OR REPLACE TRIGGER integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_integrations_updated_at();

-- scoring_profiles: set updated_at on row update
CREATE OR REPLACE TRIGGER scoring_profiles_updated_at
  BEFORE UPDATE ON public.scoring_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_scoring_profiles_updated_at();

-- user_dashboards: set updated_at on row update
CREATE OR REPLACE TRIGGER trg_user_dashboards_updated_at
  BEFORE UPDATE ON public.user_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION update_user_dashboards_updated_at();

-- workspace_detections: set updated_at on row update
CREATE OR REPLACE TRIGGER workspace_detections_updated_at
  BEFORE UPDATE ON public.workspace_detections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- workspace_members: set updated_at on row update
CREATE OR REPLACE TRIGGER workspace_members_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- workspaces: set updated_at on row update
CREATE OR REPLACE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Public schema triggers - full-text search
-- ============================================================

-- detections: rebuild FTS tsvector on insert or update
CREATE OR REPLACE TRIGGER detection_fts_update
  BEFORE INSERT OR UPDATE ON public.detections
  FOR EACH ROW
  EXECUTE FUNCTION update_detection_fts_trigger();

-- ============================================================
-- Public schema triggers - business logic
-- ============================================================

-- user_dashboards: ensure only one default dashboard per user
-- Fires on INSERT or UPDATE of is_default column, only when is_default = true
CREATE OR REPLACE TRIGGER trg_enforce_single_default
  AFTER INSERT OR UPDATE OF is_default ON public.user_dashboards
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION enforce_single_default_dashboard();
