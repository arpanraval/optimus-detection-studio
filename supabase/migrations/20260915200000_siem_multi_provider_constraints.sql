-- Widens the database boundary to admit the six providers the import engine's provider registry
-- (supabase/functions/_shared/siem-providers.ts) already recognises. Nothing here grants a new
-- provider any write/mutation capability -- production deploy/edit paths remain CrowdStrike-only.
-- provider_scope, not provider, is what the unique indexes key identity on; that is untouched.

ALTER TABLE public.siem_rule_bindings DROP CONSTRAINT siem_rule_bindings_provider_check;
ALTER TABLE public.siem_rule_bindings ADD CONSTRAINT siem_rule_bindings_provider_check
  CHECK (provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle']));

ALTER TABLE public.siem_rule_bindings DROP CONSTRAINT siem_rule_bindings_query_language_check;
ALTER TABLE public.siem_rule_bindings ADD CONSTRAINT siem_rule_bindings_query_language_check
  CHECK (query_language = ANY (ARRAY['SPL','KQL','Kuery','Sigma','EQL','ESQL','CQL','SQL','YARA',
    'YARA-L','Lucene','Carbon Black','Datadog','Elasticsearch DSL']));

ALTER TABLE public.siem_remote_rules DROP CONSTRAINT siem_remote_rules_provider_check;
ALTER TABLE public.siem_remote_rules ADD CONSTRAINT siem_remote_rules_provider_check
  CHECK (provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle']));

-- Front gate every native RPC and edge action calls (native-siem-service.ts:182,:460,:531).
-- Only the provider test widens; ownership, not-archived, not-deactivated and the role/override
-- predicates are byte-for-byte unchanged.
CREATE OR REPLACE FUNCTION public.siem_can_import(p_actor uuid, p_integration uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM integrations i JOIN profiles p ON p.id = i.user_id
    WHERE i.id = p_integration AND i.user_id = p_actor AND i.archived_at IS NULL
      AND i.provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle'])
      AND coalesce(p.status,'active') <> 'deactivated'
      AND ((p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:import')
           AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:import')
      AND ((p.role IN ('owner','admin','lead','analyst') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'detection:create')
           AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'detection:create')
  );
$$;

-- Retention now sweeps every supported provider's connections, not CrowdStrike alone.
CREATE OR REPLACE FUNCTION public.siem_run_retention(p_keep integer DEFAULT 5)
RETURNS public.siem_maintenance_runs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE run siem_maintenance_runs; conn record; removed integer; total integer := 0;
  ok integer := 0; bad integer := 0; last_error text;
BEGIN
  INSERT INTO siem_maintenance_runs(task) VALUES('snapshot_retention') RETURNING * INTO run;

  FOR conn IN SELECT id FROM integrations
    WHERE provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle']) LOOP
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
