-- 20260430d_drop_ai_model_check.sql
-- Drop the CHECK (ai_model IN (...)) constraint on auto_digest_settings.
--
-- Why: the original migration hard-coded an enum-style CHECK so the
-- database actively rejected any new model id (e.g. when Gemini 1.5 Pro,
-- Claude 4.6, GPT-5.4 land). Adding a model would require a new migration
-- + edge-function deploy in lockstep — gratuitous coupling. The frontend
-- ModelSelector and the orchestrator's allowlist already gate which
-- models are reachable; the DB constraint added no real safety, only
-- friction.
--
-- Same reasoning would apply to classification_model and digest_model if
-- they had constraints (they don't — only ai_model did).

ALTER TABLE auto_digest_settings
  DROP CONSTRAINT IF EXISTS auto_digest_settings_ai_model_check;
