-- Resumable per-job conversation checkpoints.
--
-- Today the agent conversation lives only in a local array inside
-- runAgentLoop. When the reaper resets a job, the retry starts from message
-- zero: every tool call runs again and every prior turn is regenerated. The
-- `agent_post_response_checkpoint` events are observability -- truncated to
-- 4,000 characters (lib/events.ts) -- not resumable state.
--
-- Production cost of that: session 50a93d11 burned 519 model calls over 9.5
-- hours, and e86db9af spent 959s across three research attempts producing
-- nothing at all. Each attempt rediscovered what the last one already knew.
--
-- The saving is real but specific, and worth stating honestly: Anthropic bills
-- the full input context on every call regardless, so resuming does not make
-- the expensive tail cheaper. What it buys is (a) not re-running tool calls,
-- (b) not regenerating turns already paid for, and (c) convergence -- a job
-- that makes progress across attempts instead of looping. The prompt cache
-- (1h TTL, anthropic-raw.ts) sits comfortably outside the 450s reaper reset,
-- so a resumed job can still hit a warm prefix.
--
-- Three failure modes are designed against explicitly:
--
--   SIZE      A research conversation carries 12KB-capped tool results across
--             several turns and can run to hundreds of KB. Oversized
--             checkpoints are skipped, not truncated -- a half-written
--             conversation is worse than none, because it would resume into a
--             message list the model cannot make sense of. The job simply
--             restarts, which is exactly today's behaviour.
--
--   VERSION   `schema_version` is checked on load. Code that changes the
--             message shape bumps it and old checkpoints are discarded rather
--             than replayed into a parser that no longer understands them.
--
--   POISON    `restore_count` caps how often one checkpoint may be resumed. If
--             a conversation is itself what makes the job fail -- a malformed
--             turn, a tool result the model chokes on -- resuming it forever
--             would burn every attempt on the same wall. After the cap the job
--             starts clean.

CREATE TABLE IF NOT EXISTS public.threat_research_job_checkpoints (
  job_id         uuid PRIMARY KEY
                 REFERENCES public.threat_research_jobs(id) ON DELETE CASCADE,
  session_id     uuid NOT NULL
                 REFERENCES public.threat_research_sessions(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  agent          text NOT NULL,
  schema_version integer NOT NULL,
  iteration      integer NOT NULL,
  restore_count  integer NOT NULL DEFAULT 0,
  messages       jsonb NOT NULL,
  bytes          integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.threat_research_job_checkpoints IS
  'Resumable agent conversation state, one row per job. Written after each loop iteration, deleted on success. Contains the user''s environment profile and library rule bodies, so it is service-role only and cascades with the session.';
COMMENT ON COLUMN public.threat_research_job_checkpoints.restore_count IS
  'How many times this checkpoint has been resumed. Capped in code so a conversation that is itself the cause of failure cannot consume every retry.';
COMMENT ON COLUMN public.threat_research_job_checkpoints.schema_version IS
  'Message-shape version. A checkpoint whose version does not match the running code is discarded, never replayed.';

CREATE INDEX IF NOT EXISTS trjc_session_idx
  ON public.threat_research_job_checkpoints(session_id);

-- Checkpoints carry the full model conversation: the user's environment
-- profile, their library rule bodies, and intermediate agent reasoning. No
-- end-user role gets access. RLS on with no policies denies every non-service
-- role; the orchestrator uses the service role, which bypasses RLS.
ALTER TABLE public.threat_research_job_checkpoints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.threat_research_job_checkpoints FROM PUBLIC, anon, authenticated;

-- Realtime is deliberately NOT enabled on this table: it is machinery, it is
-- large, and it holds content no browser should receive.
