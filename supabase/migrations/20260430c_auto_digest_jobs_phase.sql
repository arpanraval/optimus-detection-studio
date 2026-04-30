-- 20260430c_auto_digest_jobs_phase.sql
-- Continuation pattern: per-phase state machine on auto_digest_jobs.
--
-- Why: the orchestrator currently runs harvest → classify → rank → digest
-- inline within a single HTTP invocation. The digest loop is sequential
-- (one article at a time, 30-60s each) and easily blows the 270s
-- TIME_BUDGET_MS leaving any unprocessed articles stranded as
-- timeout_partial. To match the threat-research-orchestrator pattern,
-- each phase now runs in its own edge-function invocation, with the
-- worker self-dispatching the next phase via ?action=run_phase. The
-- digesting phase processes one article per hop and re-dispatches
-- itself until pending_entry_ids is drained.
--
-- status flow remains: pending → processing → {completed, failed, timeout_partial}
-- phase is meaningful only while status='processing' and walks:
--   harvesting → classifying → ranking → digesting → finalising

ALTER TABLE auto_digest_jobs
  ADD COLUMN IF NOT EXISTS phase text
    CHECK (phase IS NULL OR phase IN (
      'harvesting', 'classifying', 'ranking', 'digesting', 'finalising'
    )),
  ADD COLUMN IF NOT EXISTS pending_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN auto_digest_jobs.phase IS
  'Sub-state of status=processing. Walked by the orchestrator one HTTP invocation per phase. NULL outside processing.';
COMMENT ON COLUMN auto_digest_jobs.pending_entry_ids IS
  'Article entry IDs the digesting phase still has to process. Populated at end of ranking, drained one-per-hop during digesting.';
