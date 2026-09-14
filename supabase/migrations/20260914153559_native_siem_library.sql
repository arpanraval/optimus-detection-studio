-- Native SIEM inventory. All operational writes are performed by the authorized backend.
ALTER TABLE public.detections ADD COLUMN IF NOT EXISTS native_provenance jsonb;
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE public.siem_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  provider_scope text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','partial','failed','cancelled')),
  phase text NOT NULL DEFAULT 'discovery' CHECK (phase IN ('discovery','hydration')),
  cursor_offset integer NOT NULL DEFAULT 0,
  discovery_complete boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz,
  completed_at timestamptz
);
CREATE UNIQUE INDEX siem_sync_one_active ON public.siem_sync_runs(integration_id) WHERE status IN ('queued','running');
CREATE INDEX siem_sync_due ON public.siem_sync_runs(next_attempt_at) WHERE status IN ('queued','running');

CREATE TABLE public.siem_sync_items (
  run_id uuid NOT NULL REFERENCES public.siem_sync_runs(id) ON DELETE CASCADE,
  vendor_rule_id text NOT NULL CHECK (length(vendor_rule_id) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','imported','linked','unchanged','changed','ignored','unsupported','ambiguous','failed')),
  error_message text,
  PRIMARY KEY (run_id, vendor_rule_id)
);

CREATE TABLE public.siem_rule_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id text NOT NULL REFERENCES public.detections(id) ON DELETE RESTRICT,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = 'crowdstrike'),
  provider_scope text NOT NULL,
  vendor_rule_id text NOT NULL CHECK (length(vendor_rule_id) > 0),
  selected_query_id text NOT NULL,
  query_language text NOT NULL CHECK (query_language = 'CQL'),
  binding_status text NOT NULL DEFAULT 'active' CHECK (binding_status IN ('active','detached','ignored','tombstone')),
  availability text NOT NULL DEFAULT 'present' CHECK (availability IN ('present','missing','unknown')),
  observed_enabled boolean,
  desired_content jsonb NOT NULL,
  baseline_snapshot_id uuid,
  latest_remote_snapshot_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sync_run_id uuid REFERENCES public.siem_sync_runs(id),
  UNIQUE (integration_id, provider_scope, vendor_rule_id),
  UNIQUE (id, detection_id)
);
CREATE INDEX siem_binding_detection ON public.siem_rule_bindings(detection_id);
ALTER TABLE public.deployment_history ADD COLUMN IF NOT EXISTS native_binding_id uuid REFERENCES public.siem_rule_bindings(id);
ALTER TABLE public.siem_rule_bindings ADD COLUMN pending_operation_id uuid REFERENCES public.deployment_history(id);

CREATE TABLE public.siem_rule_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES public.siem_rule_bindings(id) ON DELETE RESTRICT,
  adapter_version text NOT NULL,
  content_hash text NOT NULL,
  raw_hash text NOT NULL,
  content jsonb NOT NULL,
  raw_payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(binding_id, adapter_version, content_hash, raw_hash),
  UNIQUE(binding_id, id)
);
ALTER TABLE public.siem_rule_bindings ADD CONSTRAINT siem_baseline_owner
  FOREIGN KEY (id, baseline_snapshot_id) REFERENCES public.siem_rule_snapshots(binding_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.siem_rule_bindings ADD CONSTRAINT siem_latest_owner
  FOREIGN KEY (id, latest_remote_snapshot_id) REFERENCES public.siem_rule_snapshots(binding_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.siem_local_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id text NOT NULL REFERENCES public.detections(id) ON DELETE RESTRICT,
  content jsonb NOT NULL,
  binding_contents jsonb NOT NULL DEFAULT '{}',
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX siem_revision_detection ON public.siem_local_revisions(detection_id, created_at DESC);

CREATE TABLE public.siem_rule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES public.siem_rule_bindings(id) ON DELETE RESTRICT,
  actor_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Revoke Supabase default grants as well as enabling RLS. Clients cannot forge observations or checkpoints.
ALTER TABLE public.siem_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_sync_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_rule_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_rule_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_local_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_rule_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.siem_sync_runs, public.siem_sync_items, public.siem_rule_bindings,
  public.siem_rule_snapshots, public.siem_local_revisions, public.siem_rule_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.siem_sync_runs, public.siem_sync_items, public.siem_rule_bindings,
  public.siem_rule_snapshots, public.siem_local_revisions, public.siem_rule_events TO authenticated;
GRANT ALL ON public.siem_sync_runs, public.siem_sync_items, public.siem_rule_bindings,
  public.siem_rule_snapshots, public.siem_local_revisions, public.siem_rule_events TO service_role;
CREATE POLICY siem_runs_read ON public.siem_sync_runs FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = integration_id AND i.user_id = auth.uid()));
CREATE POLICY siem_items_read ON public.siem_sync_items FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_sync_runs r WHERE r.id = run_id));
CREATE POLICY siem_bindings_read ON public.siem_rule_bindings FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = integration_id AND i.user_id = auth.uid()));
CREATE POLICY siem_snapshots_read ON public.siem_rule_snapshots FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_rule_bindings b WHERE b.id = binding_id));
CREATE POLICY siem_revisions_read ON public.siem_local_revisions FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_rule_bindings b WHERE b.detection_id = siem_local_revisions.detection_id));
CREATE POLICY siem_events_read ON public.siem_rule_events FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_rule_bindings b WHERE b.id = binding_id));

CREATE OR REPLACE FUNCTION public.siem_can_import(p_actor uuid, p_integration uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM integrations i JOIN profiles p ON p.id = i.user_id
    WHERE i.id = p_integration AND i.user_id = p_actor AND i.archived_at IS NULL
      AND i.provider = 'crowdstrike' AND coalesce(p.status,'active') <> 'deactivated'
      AND ((p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:import')
           AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:import')
      AND ((p.role IN ('owner','admin','lead','analyst') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'detection:create')
           AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'detection:create')
  );
$$;

CREATE OR REPLACE FUNCTION public.siem_can_edit(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id=p_actor AND coalesce(p.status,'active')<>'deactivated'
    AND (((p.role IN ('owner','admin','lead','analyst') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'detection:edit_own')
      AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'detection:edit_own')
    OR ((p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'detection:edit_any')
      AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'detection:edit_any')));
$$;
REVOKE ALL ON FUNCTION public.siem_can_edit(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_can_edit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_start_sync(p_actor uuid, p_integration uuid, p_scope text)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;
  IF EXISTS (SELECT 1 FROM deployment_history WHERE integration_id=p_integration AND native_binding_id IS NOT NULL
    AND status='in_progress' AND started_at > now()-interval '90 seconds') THEN RAISE EXCEPTION 'Production operation in progress'; END IF;
  UPDATE deployment_history SET status='failed',error_message='Operation interrupted; sync required to verify production',
    completed_at=now() WHERE integration_id=p_integration AND native_binding_id IS NOT NULL AND status='in_progress';
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE integration_id = p_integration AND provider_scope <> p_scope) THEN
    RAISE EXCEPTION 'Connection scope changed; create a new connection';
  END IF;
  SELECT * INTO r FROM siem_sync_runs WHERE integration_id = p_integration AND status IN ('queued','running');
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO siem_sync_runs(integration_id,actor_id,provider_scope) VALUES(p_integration,p_actor,p_scope) RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.siem_claim_sync()
RETURNS SETOF public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM siem_sync_runs WHERE status IN ('queued','running') AND next_attempt_at <= now()
    AND (lease_expires_at IS NULL OR lease_expires_at < now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF rid IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE siem_sync_runs SET status='running', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '45 seconds', heartbeat_at=now() WHERE id=rid RETURNING *;
END;
$$;

-- One transaction checks the lease, imports all results and advances the durable checkpoint.
CREATE OR REPLACE FUNCTION public.siem_commit_chunk(p_run uuid, p_lease uuid, p_ids text[], p_next integer,
  p_discovery_complete boolean, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; snap uuid; d detections;
  qid text; did text; candidates text[]; c jsonb; outcome text; old_hash text;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id=p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id,r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  IF r.phase='discovery' THEN
    INSERT INTO siem_sync_items(run_id,vendor_rule_id) SELECT r.id, unnest(p_ids) ON CONFLICT DO NOTHING;
    UPDATE siem_sync_runs SET cursor_offset=p_next, discovery_complete=p_discovery_complete,
      phase=CASE WHEN p_discovery_complete THEN 'hydration' ELSE 'discovery' END WHERE id=r.id;
  ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
      IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND vendor_rule_id=item->>'id' AND status='pending') THEN CONTINUE; END IF;
      IF item ? 'error' THEN
        UPDATE siem_sync_items SET status=coalesce(item->>'status','failed'), error_message=item->>'error'
          WHERE run_id=r.id AND vendor_rule_id=item->>'id';
        CONTINUE;
      END IF;
      c := item->'content';
      SELECT * INTO b FROM siem_rule_bindings WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope AND vendor_rule_id=item->>'id' FOR UPDATE;
      outcome := 'unchanged';
      IF FOUND AND b.binding_status <> 'active' THEN
        UPDATE siem_sync_items SET status='ignored' WHERE run_id=r.id AND vendor_rule_id=item->>'id';
        CONTINUE;
      END IF;
      IF b.id IS NULL THEN
        -- A real, current deployment establishes scope. Legacy external_id alone does not.
        SELECT array_agg(DISTINCT h.detection_id) INTO candidates FROM deployment_history h
          JOIN detections x ON x.id=h.detection_id
          WHERE h.integration_id=r.integration_id AND h.vendor_rule_id=item->>'id' AND h.status='success'
          AND x.user_id=r.actor_id AND h.action <> 'delete'
          AND NOT EXISTS (SELECT 1 FROM deployment_history later WHERE later.integration_id=h.integration_id
            AND later.vendor_rule_id=h.vendor_rule_id AND later.status='success' AND later.created_at>h.created_at AND later.action='delete');
        IF cardinality(candidates)>1 OR (coalesce(cardinality(candidates),0)=0 AND EXISTS
          (SELECT 1 FROM detections WHERE user_id=r.actor_id AND external_id=item->>'id' AND native_provenance IS NULL)) THEN
          UPDATE siem_sync_items SET status='ambiguous',error_message='Existing library rule needs explicit connection matching'
            WHERE run_id=r.id AND vendor_rule_id=item->>'id'; CONTINUE;
        END IF;
        did := candidates[1]; qid := NULL;
        IF did IS NOT NULL THEN
          SELECT * INTO d FROM detections WHERE id=did FOR UPDATE;
          SELECT q->>'id' INTO qid FROM jsonb_array_elements(d.queries) q WHERE q->>'language'='CQL'
            AND q->>'query'=c->>'query' LIMIT 1;
          IF qid IS NULL THEN
            UPDATE siem_sync_items SET status='ambiguous',error_message='Existing deployment query differs; review linkage before importing'
              WHERE run_id=r.id AND vendor_rule_id=item->>'id'; CONTINUE;
          END IF;
          outcome := 'linked';
        ELSE
          did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
          INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
            "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
            source,external_id,tags,native_provenance)
          VALUES(did,r.actor_id,1,c->>'name',c->>'description','Draft','Detection',c->>'severity','','',false,'CQL',c->>'query',now(),
            jsonb_build_array(jsonb_build_object('id',qid,'language','CQL','query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
            'production','none','none','crowdstrike',item->>'id',ARRAY['native-siem','crowdstrike'],
            jsonb_build_object('kind','native_siem','provider','crowdstrike','connection_name',
              (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()));
          SELECT * INTO d FROM detections WHERE id=did;
          outcome := 'imported';
        END IF;
        INSERT INTO siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
          VALUES(did,r.integration_id,'crowdstrike',r.provider_scope,item->>'id',qid,'CQL',c) RETURNING * INTO b;
        INSERT INTO siem_local_revisions(detection_id,content,binding_contents,actor_id) VALUES(did,to_jsonb(d),jsonb_build_object(b.id::text,c),r.actor_id);
        INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,r.actor_id,outcome);
      END IF;
      SELECT content_hash INTO old_hash FROM siem_rule_snapshots WHERE id=b.latest_remote_snapshot_id;
      INSERT INTO siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
        VALUES(b.id,item->>'adapter',item->>'hash',item->>'raw_hash',c,item->'raw') ON CONFLICT DO NOTHING;
      SELECT id INTO snap FROM siem_rule_snapshots WHERE binding_id=b.id AND adapter_version=item->>'adapter'
        AND content_hash=item->>'hash' AND raw_hash=item->>'raw_hash';
      UPDATE siem_rule_bindings SET latest_remote_snapshot_id=snap,baseline_snapshot_id=coalesce(baseline_snapshot_id,snap),
        availability='present', observed_enabled=(c->>'enabled')::boolean,last_seen_at=now(),last_sync_run_id=r.id,
        pending_operation_id=NULL WHERE id=b.id;
      IF outcome='unchanged' AND old_hash IS DISTINCT FROM item->>'hash' THEN outcome:='changed'; END IF;
      UPDATE siem_sync_items SET status=outcome,error_message=NULL WHERE run_id=r.id AND vendor_rule_id=item->>'id';
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND status='pending') THEN
      IF EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND status IN ('failed','unsupported','ambiguous')) THEN
        UPDATE siem_sync_runs SET status='partial',completed_at=now() WHERE id=r.id;
      ELSE
        UPDATE siem_sync_runs SET status='complete',completed_at=now() WHERE id=r.id;
        UPDATE siem_rule_bindings SET availability='missing',pending_operation_id=NULL WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
          AND binding_status='active' AND NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND vendor_rule_id=siem_rule_bindings.vendor_rule_id);
      END IF;
    END IF;
  END IF;
  UPDATE siem_sync_runs SET lease_token=NULL,lease_expires_at=NULL,heartbeat_at=now(),attempts=0,error_message=NULL WHERE id=r.id;
END;
$$;

CREATE SCHEMA IF NOT EXISTS siem_private;
REVOKE ALL ON SCHEMA siem_private FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION siem_private.guard_binding() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.provider IS DISTINCT FROM (SELECT provider FROM integrations WHERE id=NEW.integration_id) OR
    (SELECT count(*) FROM detections d, jsonb_array_elements(d.queries) q WHERE d.id=NEW.detection_id
      AND q->>'id'=NEW.selected_query_id) <> 1 OR
    (SELECT count(*) FROM detections d, jsonb_array_elements(d.queries) q WHERE d.id=NEW.detection_id AND d.library_type='production'
      AND q->>'id'=NEW.selected_query_id AND q->>'language'=NEW.query_language AND length(trim(q->>'query'))>0) <> 1 THEN
    RAISE EXCEPTION 'Invalid SIEM query binding';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION siem_private.guard_binding() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER siem_binding_query BEFORE INSERT OR UPDATE OF detection_id,selected_query_id,query_language,provider,integration_id
  ON public.siem_rule_bindings FOR EACH ROW EXECUTE FUNCTION siem_private.guard_binding();
-- Trigger privilege is needed to enforce bindings even when a shared-library editor cannot SELECT them.
CREATE OR REPLACE FUNCTION siem_private.guard_detection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE b siem_rule_bindings;
BEGIN
  IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('service_role','none') THEN RAISE EXCEPTION 'Authentication required'; END IF;
  FOR b IN SELECT * FROM siem_rule_bindings WHERE detection_id=OLD.id AND binding_status='active' LOOP
    IF NEW.library_type <> 'production' OR (SELECT count(*) FROM jsonb_array_elements(NEW.queries) q WHERE q->>'id'=b.selected_query_id) <> 1 OR
      (SELECT count(*) FROM jsonb_array_elements(NEW.queries) q WHERE q->>'id'=b.selected_query_id
      AND q->>'language'=b.query_language AND length(trim(q->>'query'))>0) <> 1 THEN
      RAISE EXCEPTION 'Reassign or detach the SIEM binding before removing its selected query';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE detection_id=OLD.id) AND
    (NEW.version IS DISTINCT FROM OLD.version OR NEW.queries IS DISTINCT FROM OLD.queries OR NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description OR NEW.severity IS DISTINCT FROM OLD.severity) THEN
    NEW.version := greatest(NEW.version,OLD.version+1);
    INSERT INTO siem_local_revisions(detection_id,content,binding_contents,actor_id) VALUES(NEW.id,to_jsonb(NEW),
      coalesce((SELECT jsonb_object_agg(id::text,desired_content) FROM siem_rule_bindings WHERE detection_id=NEW.id),'{}'),auth.uid());
  END IF;
  IF NEW.status='Archived' AND OLD.status IS DISTINCT FROM 'Archived' THEN
    UPDATE siem_rule_bindings SET binding_status='tombstone' WHERE detection_id=OLD.id AND binding_status='active';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION siem_private.guard_detection() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER siem_detection_revision BEFORE UPDATE ON public.detections FOR EACH ROW EXECUTE FUNCTION siem_private.guard_detection();

REVOKE ALL ON FUNCTION public.siem_can_import(uuid,uuid), public.siem_start_sync(uuid,uuid,text), public.siem_claim_sync(),
  public.siem_commit_chunk(uuid,uuid,text[],integer,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_can_import(uuid,uuid), public.siem_start_sync(uuid,uuid,text), public.siem_claim_sync(),
  public.siem_commit_chunk(uuid,uuid,text[],integer,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_accept_remote(p_actor uuid,p_binding uuid,p_snapshot uuid,p_version integer,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections; c jsonb;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT FOUND OR NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) THEN RAISE EXCEPTION 'Only an authorized detection owner can accept production changes'; END IF;
  IF d.version IS DISTINCT FROM p_version OR b.latest_remote_snapshot_id IS DISTINCT FROM p_snapshot OR b.pending_operation_id IS NOT NULL
    OR b.availability<>'present' THEN RAISE EXCEPTION 'Review is stale'; END IF;
  SELECT content INTO c FROM siem_rule_snapshots WHERE id=p_snapshot AND binding_id=b.id AND content_hash=p_hash;
  IF c IS NULL THEN RAISE EXCEPTION 'Review is stale'; END IF;
  UPDATE siem_rule_bindings SET desired_content=c WHERE id=b.id;
  UPDATE detections SET name=c->>'name',description=c->>'description',severity=c->>'severity',"updatedDate"=now(),version=version+1,
    queries=(SELECT jsonb_agg(CASE WHEN q->>'id'=b.selected_query_id THEN q || jsonb_build_object('query',c->>'query','updatedDate',now()) ELSE q END)
      FROM jsonb_array_elements(queries) q),
    "detectionQuery"=CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(queries) q WHERE q->>'id'=b.selected_query_id AND (q->>'isPrimary')::boolean)
      THEN c->>'query' ELSE "detectionQuery" END
    WHERE id=d.id;
  UPDATE siem_rule_bindings SET baseline_snapshot_id=p_snapshot,desired_content=c WHERE id=b.id;
  INSERT INTO siem_rule_events(binding_id,actor_id,action,detail) VALUES(b.id,p_actor,'accepted_remote',jsonb_build_object('snapshot_id',p_snapshot));
END $$;

CREATE OR REPLACE FUNCTION public.siem_begin_deployment(p_actor uuid,p_binding uuid,p_version integer,p_hash text,p_content jsonb,p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections; p profiles; op uuid;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding;
  IF NOT FOUND THEN RAISE EXCEPTION 'Binding not found'; END IF;
  PERFORM 1 FROM integrations WHERE id=b.integration_id FOR UPDATE;
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' OR b.availability<>'present' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO p FROM profiles WHERE id=p_actor;
  IF coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:sync' OR
    NOT (p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:sync') THEN RAISE EXCEPTION 'Deploy permission denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) THEN RAISE EXCEPTION 'Authorized detection owner required'; END IF;
  IF d.library_type<>'production' OR d.status NOT IN ('Review','Testing','Production') THEN RAISE EXCEPTION 'Review this detection before deploying'; END IF;
  IF b.pending_operation_id IS NOT NULL OR EXISTS(SELECT 1 FROM siem_sync_runs WHERE integration_id=b.integration_id AND status IN ('queued','running')) THEN RAISE EXCEPTION 'Sync or production operation in progress'; END IF;
  IF d.version IS DISTINCT FROM p_version OR NOT EXISTS(SELECT 1 FROM siem_rule_snapshots WHERE id=b.latest_remote_snapshot_id AND content_hash=p_hash)
    OR (p_action='update' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.queries) q WHERE q->>'id'=b.selected_query_id AND q->>'query'=p_content->>'query' AND q->>'language'='CQL')) THEN RAISE EXCEPTION 'Review is stale'; END IF;
  IF p_action NOT IN ('update','enable','disable','delete') THEN RAISE EXCEPTION 'Unsupported operation'; END IF;
  INSERT INTO deployment_history(user_id,integration_id,detection_id,native_binding_id,action,status,vendor_rule_id,query_language,deployed_query,rule_config,detection_version,started_at,response)
    VALUES(p_actor,b.integration_id,d.id,b.id,p_action,'in_progress',b.vendor_rule_id,'CQL',p_content->>'query',p_content,p_version,now(),jsonb_build_object('verification','pending')) RETURNING id INTO op;
  UPDATE siem_rule_bindings SET pending_operation_id=op WHERE id=b.id;
  RETURN op;
END $$;

CREATE OR REPLACE FUNCTION public.siem_save_local(p_actor uuid,p_binding uuid,p_version integer,p_content jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT FOUND OR NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) OR d.version IS DISTINCT FROM p_version OR b.pending_operation_id IS NOT NULL THEN RAISE EXCEPTION 'Local revision changed or access denied'; END IF;
  IF p_content->>'language' <> b.query_language OR length(trim(p_content->>'query'))=0 OR length(trim(p_content->>'name'))=0
    OR p_content->>'severity' NOT IN ('Critical','High','Medium','Low','Informational') THEN RAISE EXCEPTION 'Invalid local rule'; END IF;
  UPDATE siem_rule_bindings SET desired_content=p_content WHERE id=b.id;
  UPDATE detections SET name=p_content->>'name',description=p_content->>'description',severity=p_content->>'severity',
    version=version+1,"updatedDate"=now(),
    queries=(SELECT jsonb_agg(CASE WHEN q->>'id'=b.selected_query_id THEN q || jsonb_build_object('query',p_content->>'query','updatedDate',now()) ELSE q END)
      FROM jsonb_array_elements(queries) q),
    "detectionQuery"=CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(queries) q WHERE q->>'id'=b.selected_query_id AND (q->>'isPrimary')::boolean)
      THEN p_content->>'query' ELSE "detectionQuery" END WHERE id=d.id;
  INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,p_actor,'saved_local_revision');
END $$;
REVOKE ALL ON FUNCTION public.siem_save_local(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_save_local(uuid,uuid,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_finish_deployment(p_operation uuid,p_actor uuid,p_content jsonb,p_raw jsonb,p_hash text,p_raw_hash text,p_adapter text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE op deployment_history; b siem_rule_bindings; snap uuid;
BEGIN
  SELECT * INTO op FROM deployment_history WHERE id=p_operation AND user_id=p_actor AND status='in_progress' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operation no longer active'; END IF;
  SELECT * INTO b FROM siem_rule_bindings WHERE id=op.native_binding_id AND pending_operation_id=op.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operation superseded'; END IF;
  IF p_content IS NOT NULL THEN
    INSERT INTO siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
      VALUES(b.id,p_adapter,p_hash,p_raw_hash,p_content,p_raw) ON CONFLICT DO NOTHING;
    SELECT id INTO snap FROM siem_rule_snapshots WHERE binding_id=b.id AND adapter_version=p_adapter AND content_hash=p_hash AND raw_hash=p_raw_hash;
    UPDATE siem_rule_bindings SET baseline_snapshot_id=snap,latest_remote_snapshot_id=snap,desired_content=p_content,
      observed_enabled=(p_content->>'enabled')::boolean,last_seen_at=now(),pending_operation_id=NULL WHERE id=b.id;
  ELSE
    UPDATE siem_rule_bindings SET availability='missing',pending_operation_id=NULL WHERE id=b.id;
  END IF;
  UPDATE deployment_history SET status='success',completed_at=now(),response=jsonb_build_object('verification','verified'),detection_hash=p_hash WHERE id=op.id;
  INSERT INTO siem_rule_events(binding_id,actor_id,action,detail) VALUES(b.id,p_actor,op.action,jsonb_build_object('deployment_id',op.id,'verification','verified'));
END $$;

CREATE OR REPLACE FUNCTION public.siem_fail_deployment(p_operation uuid,p_actor uuid,p_uncertain boolean,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE op deployment_history;
BEGIN
  UPDATE deployment_history SET status='failed',completed_at=now(),error_message=p_error,
    response=jsonb_build_object('verification',CASE WHEN p_uncertain THEN 'unverified' ELSE 'not_applied' END)
    WHERE id=p_operation AND user_id=p_actor AND status='in_progress' RETURNING * INTO op;
  IF FOUND THEN
    UPDATE siem_rule_bindings SET pending_operation_id=CASE WHEN p_uncertain THEN p_operation ELSE NULL END
      WHERE id=op.native_binding_id AND pending_operation_id=p_operation;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.siem_accept_remote(uuid,uuid,uuid,integer,text),
  public.siem_begin_deployment(uuid,uuid,integer,text,jsonb,text), public.siem_finish_deployment(uuid,uuid,jsonb,jsonb,text,text,text),
  public.siem_fail_deployment(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_accept_remote(uuid,uuid,uuid,integer,text),
  public.siem_begin_deployment(uuid,uuid,integer,text,jsonb,text), public.siem_finish_deployment(uuid,uuid,jsonb,jsonb,text,text,text),
  public.siem_fail_deployment(uuid,uuid,boolean,text) TO service_role;

-- Reuse the existing installation's Vault dispatcher secrets. Fresh installs can configure them later.
CREATE OR REPLACE FUNCTION public.siem_disconnect(p_actor uuid,p_integration uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p profiles;
BEGIN
  PERFORM 1 FROM integrations WHERE id=p_integration AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection access denied'; END IF;
  SELECT * INTO p FROM profiles WHERE id=p_actor;
  IF p.status='deactivated' OR coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:configure' OR
    NOT (p.role IN ('owner','admin') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:configure') THEN RAISE EXCEPTION 'Configure permission required'; END IF;
  IF EXISTS (SELECT 1 FROM deployment_history WHERE integration_id=p_integration AND native_binding_id IS NOT NULL
    AND status='in_progress' AND started_at > now()-interval '90 seconds') THEN RAISE EXCEPTION 'Production operation in progress'; END IF;
  UPDATE integrations SET archived_at=now(),is_default=false,status='disabled',config=config-'_dev_credentials' WHERE id=p_integration;
  DELETE FROM integration_credentials WHERE integration_id=p_integration;
  UPDATE siem_sync_runs SET status='cancelled',completed_at=now(),lease_token=NULL,lease_expires_at=NULL
    WHERE integration_id=p_integration AND status IN ('queued','running');
END $$;
REVOKE ALL ON FUNCTION public.siem_disconnect(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_disconnect(uuid,uuid) TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') AND EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net')
    AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    PERFORM cron.schedule('native-siem-sync','* * * * *',$job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='tr_supabase_url') || '/functions/v1/integration-ops',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='tr_service_role_key')),
        body := '{"action":"native_sync_tick"}'::jsonb
      ) WHERE EXISTS (SELECT 1 FROM public.siem_sync_runs WHERE status IN ('queued','running'))
        AND (SELECT count(*) FROM vault.decrypted_secrets WHERE name IN ('tr_supabase_url','tr_service_role_key'))=2;
    $job$);
  END IF;
END $$;
