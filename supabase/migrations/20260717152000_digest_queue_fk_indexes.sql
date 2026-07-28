-- Cover the queue and story foreign keys used by claims, reconciliation, and deletes.
-- These indexes are additive and safe to apply to existing data.
CREATE INDEX IF NOT EXISTS auto_digest_job_entries_feed_entry_idx
  ON public.auto_digest_job_entries (feed_entry_id);

CREATE INDEX IF NOT EXISTS auto_digest_job_entries_job_owner_idx
  ON public.auto_digest_job_entries (job_id, user_id);

CREATE INDEX IF NOT EXISTS auto_digest_job_entries_report_idx
  ON public.auto_digest_job_entries (report_id);

CREATE INDEX IF NOT EXISTS auto_digest_jobs_active_entry_idx
  ON public.auto_digest_jobs (active_entry_id);

CREATE INDEX IF NOT EXISTS auto_digest_jobs_cancelled_by_idx
  ON public.auto_digest_jobs (cancelled_by);

CREATE INDEX IF NOT EXISTS auto_digest_campaign_articles_report_idx
  ON public.auto_digest_campaign_articles (report_id);

CREATE INDEX IF NOT EXISTS auto_digest_campaigns_reviewed_by_idx
  ON public.auto_digest_campaigns (reviewed_by);
