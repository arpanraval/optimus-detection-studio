-- Milestone 4: operational readiness.
--
-- siem_prune_remote_snapshots has existed since 20260915132000 but nothing ever called it, so the
-- retention policy was a function, not a policy: every observation of every rule accumulated
-- forever. This schedules it, records each run's outcome so a silent failure is visible, and gives
-- operators a way to see a stalled job -- the exit gate for this milestone is that they can
-- identify and recover one.

-- Outcome log. Deliberately holds counts and error text only: no rule content, no vendor payloads,
-- no credentials. Retention that leaks what it pruned would defeat its own purpose.
CREATE TABLE IF NOT EXISTS public.siem_maintenance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL CHECK (task IN ('snapshot_retention')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  connections_processed integer NOT NULL DEFAULT 0,
  connections_failed integer NOT NULL DEFAULT 0,
  snapshots_removed integer NOT NULL DEFAULT 0,
  error_message text
);
CREATE INDEX IF NOT EXISTS siem_maintenance_runs_recent
  ON public.siem_maintenance_runs(task, started_at DESC);

ALTER TABLE public.siem_maintenance_runs ENABLE ROW LEVEL SECURITY;
-- No policy for authenticated on purpose: these rows span every connection in the installation,
-- so there is no owner to scope them to. Operators read them as service_role.
REVOKE ALL ON public.siem_maintenance_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siem_maintenance_runs TO service_role;

-- Prunes superseded catalog observations across every connection, one connection at a time.
--
-- A failure on one connection must not abort the rest: the loop records it and carries on, and the
-- run is reported as partially failed rather than silently half-done. p_keep is passed through to
-- siem_prune_remote_snapshots, which already refuses to touch the snapshot a catalog row points
-- at, any snapshot belonging to a rule with a pending import, or any binding snapshot.
CREATE OR REPLACE FUNCTION public.siem_run_retention(p_keep integer DEFAULT 5)
RETURNS public.siem_maintenance_runs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE run siem_maintenance_runs; conn record; removed integer; total integer := 0;
  ok integer := 0; bad integer := 0; last_error text;
BEGIN
  INSERT INTO siem_maintenance_runs(task) VALUES('snapshot_retention') RETURNING * INTO run;

  FOR conn IN SELECT id FROM integrations WHERE provider = 'crowdstrike' LOOP
    BEGIN
      removed := siem_prune_remote_snapshots(conn.id, p_keep);
      total := total + coalesce(removed, 0);
      ok := ok + 1;
    EXCEPTION WHEN OTHERS THEN
      -- SQLERRM only: a vendor payload must never reach this table.
      bad := bad + 1;
      last_error := SQLERRM;
    END;
  END LOOP;

  UPDATE siem_maintenance_runs
     SET finished_at = now(), connections_processed = ok, connections_failed = bad,
         snapshots_removed = total, error_message = last_error
   WHERE id = run.id
  RETURNING * INTO run;
  RETURN run;
END $$;
REVOKE ALL ON FUNCTION public.siem_run_retention(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_run_retention(integer) TO service_role;

-- What an operator needs to answer "is anything stuck, and what do I do about it".
--
-- A job holds a 45-second lease (siem_claim_sync) and is requeued by the worker's fenced catch on
-- failure. The states that need a human are: a run whose lease expired without the worker coming
-- back, and a run that has exhausted its attempts. Both are invisible in the product UI, which
-- only ever shows the LATEST run for a connection.
CREATE OR REPLACE VIEW public.siem_worker_health WITH (security_invoker = true) AS
SELECT r.id AS run_id, r.integration_id, i.name AS connection_name, r.kind, r.status, r.phase,
       r.attempts, r.created_at, r.heartbeat_at, r.next_attempt_at, r.error_message,
       (SELECT count(*) FROM siem_sync_items s WHERE s.run_id = r.id AND s.status = 'pending') AS pending_items,
       CASE
         WHEN r.status = 'running' AND r.lease_expires_at IS NOT NULL AND r.lease_expires_at <= now()
           THEN 'lease expired; the dispatcher will reclaim it, or retry the import'
         WHEN r.status = 'failed'
           THEN 'gave up after repeated failures; retry the import to resume its pending rules'
         WHEN r.status = 'queued' AND r.next_attempt_at > now()
           THEN 'backing off before the next attempt'
         ELSE 'healthy'
       END AS diagnosis
  FROM siem_sync_runs r
  JOIN integrations i ON i.id = r.integration_id
 WHERE r.status IN ('queued', 'running', 'failed');
REVOKE ALL ON public.siem_worker_health FROM PUBLIC, anon;
GRANT SELECT ON public.siem_worker_health TO authenticated, service_role;

-- Nightly, off the minute the sync dispatcher runs. Plain SQL with no vendor calls, so it is a
-- direct function call like ai_usage_rollup rather than a round trip through the Edge Function.
-- Guarded the same way native-siem-sync is: a database without pg_cron (a fresh clone, or the CI
-- Postgres image) must still apply this file cleanly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('native-siem-retention','17 3 * * *',
      $job$ SELECT public.siem_run_retention(5) $job$);
  END IF;
END $$;
