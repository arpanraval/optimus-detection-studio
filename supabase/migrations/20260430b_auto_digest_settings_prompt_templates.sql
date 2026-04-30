-- 20260430b_auto_digest_settings_prompt_templates.sql
-- Per-user prompt-template cache for the background orchestrator.
--
-- Why this exists: threat-intel-digest-v2 strictly requires promptTemplates
-- in its request body and throws on a missing template. The frontend has
-- always sent these (they live in src/lib/ai/prompts/threat-intel/), but
-- the auto-digest-orchestrator runs server-side and has no access to them
-- — so every background digest call would fail with "Missing summary
-- prompt template" the moment an article actually passed classification.
--
-- The orchestrator can't fetch the prompts itself (frontend is the source
-- of truth, by user policy). Instead, the trigger-auto-digest function
-- accepts promptTemplates in its body and writes them here. The
-- orchestrator reads from this column on the user's settings row when
-- processing the job.
--
-- For pg_cron triggers (no UI in the loop), we use whatever templates
-- the user last sent via a manual run. Stale-but-working beats broken.
-- If a user has never triggered a manual run, prompt_templates is null
-- and the orchestrator emits a clear error event telling them to.

ALTER TABLE auto_digest_settings
  ADD COLUMN IF NOT EXISTS prompt_templates jsonb;

COMMENT ON COLUMN auto_digest_settings.prompt_templates IS
  'Cache of frontend-resident threat-intel prompt templates (system, summary, classification, ttps, iocsAndRules). Written by trigger-auto-digest from the request body so the background orchestrator can pass them to threat-intel-digest-v2. Frontend remains the canonical source.';
