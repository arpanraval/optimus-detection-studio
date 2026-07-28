BEGIN;
SELECT plan(19);

SELECT has_table('public', 'auto_digest_job_entries', 'per-article durable queue state exists');
SELECT has_column('public', 'auto_digest_jobs', 'outcome', 'jobs expose terminal outcomes');
SELECT has_column('public', 'auto_digest_jobs', 'cancellation_requested', 'jobs expose cancellation state');
SELECT has_column('public', 'auto_digest_job_entries', 'lease_expires_at', 'entries expose leases');
SELECT has_column('public', 'auto_digest_job_entries', 'attempt_count', 'entries expose retry count');
SELECT has_function('public', 'request_auto_digest_job', ARRAY['uuid', 'text'], 'job creation is atomic');
SELECT has_function('public', 'cancel_auto_digest_job', ARRAY['uuid', 'text'], 'cancellation RPC exists');
SELECT has_function('public', 'claim_auto_digest_entry', ARRAY['uuid', 'uuid', 'integer'], 'entry claim RPC exists');
SELECT has_function('public', 'complete_auto_digest_entry', ARRAY['uuid', 'text', 'text', 'text', 'text'], 'entry completion RPC exists');
SELECT has_function('public', 'finalize_auto_digest_job', ARRAY['uuid'], 'job finalization RPC exists');
SELECT ok(
  pg_get_functiondef('public.claim_auto_digest_entry(uuid,uuid,integer)'::regprocedure)
    LIKE '%e.feed_entry_id = p_entry_id%',
  'entry claims match the feed-entry ID carried by pending_entry_ids'
);
SELECT ok(
  pg_get_functiondef('public.complete_auto_digest_entry(uuid,text,text,text,text)'::regprocedure)
    LIKE '%jsonb_build_array(v_entry.feed_entry_id)%',
  'entry retries restore the feed-entry ID to pending_entry_ids'
);
SELECT ok(
  pg_get_functiondef('public.reserve_auto_digest_article_quota(uuid,integer,integer)'::regprocedure)
    LIKE '%auth.jwt() ->> ''role''%',
  'quota authorization recognizes the service-role JWT claims object'
);
SELECT has_column('public', 'threat_intel_feed_entries', 'source_quality', 'feed entries expose source quality');
SELECT has_column('public', 'threat_intel_feed_entries', 'source_content_hash', 'feed entries expose fetched content hash');
SELECT has_column('public', 'threat_intel_reports', 'source_quality', 'reports expose source quality');
SELECT has_column('public', 'threat_intel_reports', 'source_content_length', 'reports expose source content length');
SELECT has_column('public', 'threat_intel_reports', 'quality_warnings', 'reports expose quality warnings');
SELECT has_column('public', 'threat_intel_reports', 'possible_actor_mentions', 'reports separate actor mentions');

SELECT * FROM finish();
ROLLBACK;
