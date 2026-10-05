-- All queue mutations go through the authenticated Edge API and service-only transactions.
ALTER TABLE public.pack_deploy_jobs
  ADD COLUMN IF NOT EXISTS request_key uuid,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS pack_deploy_request_key ON public.pack_deploy_jobs(created_by, request_key);
ALTER TABLE public.pack_deploy_job_items
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS write_started boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_reconciliation boolean NOT NULL DEFAULT false;
ALTER TABLE public.deployment_history ADD COLUMN IF NOT EXISTS pack_item_id uuid REFERENCES public.pack_deploy_job_items(id);
CREATE INDEX IF NOT EXISTS deployment_history_pack_item ON public.deployment_history(pack_item_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pack_deploy_jobs,
  public.pack_deploy_job_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pack_deploy_jobs, public.pack_deploy_job_items TO authenticated;
DROP POLICY IF EXISTS "Users can create deploy jobs" ON public.pack_deploy_jobs;
DROP POLICY IF EXISTS "Users can update their own deploy jobs" ON public.pack_deploy_jobs;
DROP POLICY IF EXISTS "Users can insert their own deploy job items" ON public.pack_deploy_job_items;

-- Old jobs have no reviewed snapshot and must not be silently replayed after migration.
UPDATE public.pack_deploy_job_items SET status='failed', retryable=false,
  error_message='Legacy job: queue a new deployment to review current rules'
WHERE job_id IN (SELECT id FROM public.pack_deploy_jobs WHERE status IN ('queued','running'))
  AND status IN ('pending','running');
UPDATE public.pack_deploy_jobs SET status='failed', completed_at=now(), current_detection_id=NULL,
  error_message='Legacy job: queue a new deployment to review current rules',
  failed_count=(SELECT count(*) FROM public.pack_deploy_job_items i WHERE i.job_id=pack_deploy_jobs.id AND i.status='failed')
WHERE status IN ('queued','running');

CREATE OR REPLACE FUNCTION public.pack_deploy_recount(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s integer; f integer; k integer; outstanding integer;
BEGIN
  SELECT count(*) FILTER(WHERE status='succeeded'),count(*) FILTER(WHERE status='failed'),
    count(*) FILTER(WHERE status='skipped'),count(*) FILTER(WHERE status IN ('pending','running'))
    INTO s,f,k,outstanding FROM pack_deploy_job_items WHERE job_id=p_job;
  UPDATE pack_deploy_jobs SET succeeded_count=s,failed_count=f,skipped_count=k,
    status=CASE WHEN status='cancelled' THEN status WHEN outstanding>0 THEN status
      WHEN f>0 AND s>0 THEN 'partial' WHEN f>0 THEN 'failed' ELSE 'succeeded' END,
    completed_at=CASE WHEN outstanding=0 OR status='cancelled' THEN coalesce(completed_at,now()) ELSE NULL END,
    current_detection_id=CASE WHEN outstanding=0 OR status='cancelled' THEN NULL ELSE current_detection_id END
    WHERE id=p_job;
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_create(p_actor uuid,p_integration uuid,p_pack uuid,
  p_request uuid,p_config jsonb,p_items jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE jid uuid;
BEGIN
  IF p_request IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 1000
    THEN RAISE EXCEPTION 'Invalid deployment request'; END IF;
  PERFORM 1 FROM integrations WHERE id=p_integration AND user_id=p_actor AND status='connected' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connected integration not found'; END IF;
  SELECT id INTO jid FROM pack_deploy_jobs WHERE created_by=p_actor AND request_key=p_request;
  IF FOUND THEN RETURN jid; END IF;
  IF EXISTS(SELECT 1 FROM pack_deploy_jobs WHERE integration_id=p_integration AND
    (status IN ('queued','running') OR lease_expires_at>now())) THEN
    RAISE EXCEPTION 'A pack deployment is already active on this connection'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x LEFT JOIN detections d ON d.id=x->>'detection_id'
    WHERE d.id IS NULL OR d.user_id<>p_actor) THEN RAISE EXCEPTION 'Detection access denied'; END IF;
  INSERT INTO pack_deploy_jobs(pack_id,integration_id,created_by,request_key,rule_config,total_items)
    VALUES(p_pack,p_integration,p_actor,p_request,p_config,jsonb_array_length(p_items)) RETURNING id INTO jid;
  INSERT INTO pack_deploy_job_items(job_id,detection_id,detection_name,status,error_message,payload)
    SELECT jid,x->>'detection_id',x->>'detection_name',
      CASE WHEN x->>'reason' IS NULL THEN 'pending' ELSE 'skipped' END,x->>'reason',x->'payload'
      FROM jsonb_array_elements(p_items) x;
  PERFORM pack_deploy_recount(jid);
  RETURN jid;
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_claim(p_job uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs; i pack_deploy_job_items;
BEGIN
  SELECT * INTO j FROM pack_deploy_jobs WHERE (p_job IS NULL OR id=p_job)
    AND status IN ('queued','running') AND next_attempt_at<=now()
    AND (lease_expires_at IS NULL OR lease_expires_at<now())
    ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- A worker can live for 400 seconds. The ten-minute lease outlives it. Never replay an uncertain write.
  UPDATE pack_deploy_job_items SET status=CASE WHEN write_started THEN 'failed' ELSE 'pending' END,
    needs_reconciliation=write_started,retryable=NOT write_started,
    error_message=CASE WHEN write_started THEN 'Worker interrupted after dispatch. Check the SIEM before deploying this rule again.' ELSE NULL END
    WHERE job_id=j.id AND status='running';
  -- Recover a committed result if the worker died after integration-ops recorded success.
  UPDATE pack_deploy_job_items recovered SET status='succeeded',needs_reconciliation=false,retryable=false,
    error_message=NULL,vendor_rule_id=h.vendor_rule_id
    FROM deployment_history h WHERE recovered.job_id=j.id AND recovered.needs_reconciliation
      AND h.pack_item_id=recovered.id AND h.status='success' AND h.vendor_rule_id IS NOT NULL;
  PERFORM pack_deploy_recount(j.id);
  SELECT * INTO i FROM pack_deploy_job_items WHERE job_id=j.id AND status='pending' ORDER BY id LIMIT 1;
  IF NOT FOUND THEN
    UPDATE pack_deploy_jobs SET lease_token=NULL,lease_expires_at=NULL,current_detection_id=NULL WHERE id=j.id;
    RETURN NULL;
  END IF;
  UPDATE pack_deploy_jobs SET status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',
    started_at=coalesce(started_at,now()),current_detection_id=i.detection_id WHERE id=j.id RETURNING * INTO j;
  UPDATE pack_deploy_job_items SET status='running',attempted_at=now(),retry_count=retry_count+1,
    write_started=false,error_message=NULL WHERE id=i.id RETURNING * INTO i;
  RETURN jsonb_build_object('job',to_jsonb(j),'item',to_jsonb(i));
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_begin_write(p_job uuid,p_item uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs; i pack_deploy_job_items;
BEGIN
  SELECT * INTO j FROM pack_deploy_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_expires_at<=now()
    THEN RAISE EXCEPTION 'Deployment lease is no longer active'; END IF;
  UPDATE pack_deploy_job_items SET write_started=true WHERE id=p_item AND job_id=p_job AND status='running'
    AND NOT write_started RETURNING * INTO i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item already dispatched or no longer active'; END IF;
  RETURN jsonb_build_object('job',to_jsonb(j),'item',to_jsonb(i));
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_finish(p_job uuid,p_item uuid,p_lease uuid,p_result jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs; i pack_deploy_job_items; next_status text; delay_seconds integer;
BEGIN
  SELECT * INTO j FROM pack_deploy_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_expires_at<=now() THEN RETURN false; END IF;
  SELECT * INTO i FROM pack_deploy_job_items WHERE id=p_item AND job_id=p_job;
  IF NOT FOUND THEN RETURN false; END IF;
  next_status := p_result->>'status';
  IF next_status NOT IN ('succeeded','failed','skipped') THEN RAISE EXCEPTION 'Invalid item outcome'; END IF;
  IF next_status='succeeded' AND nullif(p_result->>'vendorRuleId','') IS NULL THEN RAISE EXCEPTION 'Missing vendor rule identity'; END IF;
  IF next_status='failed' AND coalesce((p_result->>'retryable')::boolean,false) AND
    NOT coalesce((p_result->>'uncertain')::boolean,false) AND i.retry_count<3 AND j.status<>'cancelled' THEN
    next_status := 'pending';
  END IF;
  UPDATE pack_deploy_job_items SET status=next_status,vendor_rule_id=p_result->>'vendorRuleId',
    error_message=p_result->>'error',retryable=coalesce((p_result->>'retryable')::boolean,false),
    needs_reconciliation=coalesce((p_result->>'uncertain')::boolean,false) WHERE id=p_item;
  delay_seconds := CASE WHEN next_status='pending' THEN greatest(5,least(300,coalesce((p_result->>'retryAfter')::integer,30))) ELSE 0 END;
  UPDATE pack_deploy_jobs SET status=CASE WHEN status='cancelled' THEN status ELSE 'queued' END,
    lease_token=NULL,lease_expires_at=NULL,current_detection_id=NULL,
    next_attempt_at=now()+make_interval(secs=>delay_seconds) WHERE id=p_job;
  PERFORM pack_deploy_recount(p_job);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_control(p_actor uuid,p_job uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs;
BEGIN
  PERFORM 1 FROM integrations WHERE id=(SELECT integration_id FROM pack_deploy_jobs WHERE id=p_job AND created_by=p_actor) FOR UPDATE;
  SELECT * INTO j FROM pack_deploy_jobs WHERE id=p_job AND created_by=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment job not found'; END IF;
  IF p_action='cancel' THEN
    IF j.status NOT IN ('queued','running') THEN RETURN; END IF;
    UPDATE pack_deploy_jobs SET status='cancelled',completed_at=now(),current_detection_id=NULL WHERE id=p_job;
    UPDATE pack_deploy_job_items SET status='skipped',error_message='Cancelled before deployment'
      WHERE job_id=p_job AND status='pending';
    UPDATE pack_deploy_job_items SET status='failed',needs_reconciliation=write_started,retryable=false,
      error_message=CASE WHEN write_started THEN 'Cancelled during deployment. The in-flight request may still finish; check the SIEM.'
        ELSE 'Cancelled before deployment' END WHERE job_id=p_job AND status='running';
  ELSIF p_action='retry' THEN
    IF j.status NOT IN ('failed','partial') OR j.lease_expires_at>now() THEN RAISE EXCEPTION 'Job is not ready to retry'; END IF;
    IF EXISTS(SELECT 1 FROM pack_deploy_jobs WHERE integration_id=j.integration_id AND id<>j.id AND
      (status IN ('queued','running') OR lease_expires_at>now())) THEN RAISE EXCEPTION 'Another pack deployment is active'; END IF;
    UPDATE pack_deploy_job_items SET status='pending',retry_count=0,error_message=NULL,write_started=false
      WHERE job_id=p_job AND status='failed' AND retryable AND NOT needs_reconciliation AND payload IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'No safely retryable items. Review the item errors and queue a new deployment.'; END IF;
    UPDATE pack_deploy_jobs SET status='queued',completed_at=NULL,error_message=NULL,next_attempt_at=now(),
      lease_token=NULL,lease_expires_at=NULL,current_detection_id=NULL WHERE id=p_job;
  ELSE RAISE EXCEPTION 'Unknown job action'; END IF;
  PERFORM pack_deploy_recount(p_job);
END $$;

REVOKE ALL ON FUNCTION public.pack_deploy_recount(uuid),public.pack_deploy_create(uuid,uuid,uuid,uuid,jsonb,jsonb),
  public.pack_deploy_claim(uuid),public.pack_deploy_begin_write(uuid,uuid,uuid),
  public.pack_deploy_finish(uuid,uuid,uuid,jsonb),public.pack_deploy_control(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pack_deploy_recount(uuid),public.pack_deploy_create(uuid,uuid,uuid,uuid,jsonb,jsonb),
  public.pack_deploy_claim(uuid),public.pack_deploy_begin_write(uuid,uuid,uuid),
  public.pack_deploy_finish(uuid,uuid,uuid,jsonb),public.pack_deploy_control(uuid,uuid,text) TO service_role;

-- The latest successful lifecycle action describes remote presence. Failed updates do not delete rules.
CREATE OR REPLACE VIEW public.v_pack_deployment_status WITH (security_invoker=true) AS
WITH latest_attempt AS (
  SELECT DISTINCT ON(detection_id,integration_id) * FROM deployment_history ORDER BY detection_id,integration_id,created_at DESC,id DESC
), latest_success AS (
  SELECT DISTINCT ON(detection_id,integration_id) * FROM deployment_history WHERE status='success'
    ORDER BY detection_id,integration_id,created_at DESC,id DESC
), targets AS (
  SELECT DISTINCT pd.pack_id,dh.integration_id FROM pack_detections pd JOIN deployment_history dh ON dh.detection_id=pd.detection_id
)
SELECT t.pack_id,t.integration_id,count(DISTINCT pd.detection_id) AS total_detections,
  count(DISTINCT pd.detection_id) FILTER(WHERE s.action IN ('create','update','enable','disable')) AS deployed_count,
  count(DISTINCT pd.detection_id) FILTER(WHERE a.status='failed') AS failed_count,
  max(a.created_at) AS last_deployed_at
FROM targets t JOIN pack_detections pd ON pd.pack_id=t.pack_id
LEFT JOIN latest_attempt a ON a.detection_id=pd.detection_id AND a.integration_id=t.integration_id
LEFT JOIN latest_success s ON s.detection_id=pd.detection_id AND s.integration_id=t.integration_id
GROUP BY t.pack_id,t.integration_id;

-- Existing installations already use these Vault values for Threat Research. No JWTs are persisted.
CREATE OR REPLACE FUNCTION public.pack_deploy_ready() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE configured boolean; scheduled boolean;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regclass('cron.job') IS NULL OR
    NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN false; END IF;
  EXECUTE 'SELECT count(*)=2 FROM vault.decrypted_secrets WHERE name IN (''tr_supabase_url'',''tr_service_role_key'') AND length(decrypted_secret)>0' INTO configured;
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname=''pack-deploy-dispatcher'' AND active)' INTO scheduled;
  RETURN configured AND scheduled;
END $$;
REVOKE ALL ON FUNCTION public.pack_deploy_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pack_deploy_ready() TO service_role;

CREATE OR REPLACE FUNCTION public.pack_deploy_dispatch() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base_url text; service_key text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pack_deploy_jobs WHERE status IN ('queued','running')
    AND next_attempt_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<now())) THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN; END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1 LIMIT 1' INTO base_url USING 'tr_supabase_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1 LIMIT 1' INTO service_key USING 'tr_service_role_key';
  IF base_url IS NULL OR service_key IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
    USING base_url||'/functions/v1/pack-deploy-worker',
      jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),'{"action":"tick"}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.pack_deploy_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pack_deploy_dispatch() TO service_role;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule('pack-deploy-dispatcher','* * * * *','select public.pack_deploy_dispatch()');
  END IF;
END $$;
