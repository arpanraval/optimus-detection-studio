-- Observation catalog: what exists in the connected SIEM, recorded without creating any
-- library detection. Adoption into the library happens only in an import_selection job.

ALTER TABLE public.siem_sync_runs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legacy_import',
  ADD COLUMN IF NOT EXISTS protocol_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_run_id uuid REFERENCES public.siem_sync_runs(id),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.siem_sync_runs DROP CONSTRAINT IF EXISTS siem_sync_runs_kind_check;
ALTER TABLE public.siem_sync_runs ADD CONSTRAINT siem_sync_runs_kind_check
  CHECK (kind IN ('legacy_import','inventory','refresh_tracked','import_selection'));

-- One active run per connection AND kind. The old index allowed one per connection
-- overall, which made an inventory job and an import job mutually exclusive.
DROP INDEX IF EXISTS public.siem_sync_one_active;
CREATE UNIQUE INDEX siem_sync_one_active ON public.siem_sync_runs(integration_id, kind)
  WHERE status IN ('queued','running');
CREATE UNIQUE INDEX siem_import_idempotency ON public.siem_sync_runs(integration_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Widen siem_sync_items.status so an inventory scan can record a successfully-observed rule
-- ('observed') without reusing 'unchanged', which renders as "Already present" and would
-- falsely claim an inventory scan imported something.
ALTER TABLE public.siem_sync_items DROP CONSTRAINT siem_sync_items_status_check;
ALTER TABLE public.siem_sync_items ADD CONSTRAINT siem_sync_items_status_check
  CHECK (status IN ('pending','imported','linked','unchanged','changed','ignored','unsupported',
                    'ambiguous','failed','observed'));

CREATE TABLE public.siem_remote_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = 'crowdstrike'),
  provider_scope text NOT NULL,
  vendor_rule_id text NOT NULL CHECK (length(vendor_rule_id) > 0),
  rule_family text NOT NULL DEFAULT 'correlation',
  display_name text NOT NULL DEFAULT '',
  observed_enabled boolean,
  availability text NOT NULL DEFAULT 'unknown' CHECK (availability IN ('present','missing','unknown')),
  normalization_error text,
  match_candidate_count integer NOT NULL DEFAULT 0,
  latest_snapshot_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_complete_run_id uuid REFERENCES public.siem_sync_runs(id),
  UNIQUE (integration_id, provider_scope, vendor_rule_id),
  UNIQUE (id, integration_id)
);
CREATE INDEX siem_remote_rules_connection ON public.siem_remote_rules(integration_id, display_name);

CREATE TABLE public.siem_remote_rule_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_rule_id uuid NOT NULL REFERENCES public.siem_remote_rules(id) ON DELETE CASCADE,
  adapter_version text NOT NULL,
  content_hash text NOT NULL,
  raw_hash text NOT NULL,
  content jsonb NOT NULL,
  raw_payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (remote_rule_id, adapter_version, content_hash, raw_hash),
  UNIQUE (remote_rule_id, id)
);
ALTER TABLE public.siem_remote_rules ADD CONSTRAINT siem_remote_latest_owner
  FOREIGN KEY (id, latest_snapshot_id)
  REFERENCES public.siem_remote_rule_snapshots(remote_rule_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.siem_remote_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_remote_rule_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.siem_remote_rules, public.siem_remote_rule_snapshots
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.siem_remote_rules, public.siem_remote_rule_snapshots TO authenticated;
GRANT ALL ON public.siem_remote_rules, public.siem_remote_rule_snapshots TO service_role;
CREATE POLICY siem_remote_rules_read ON public.siem_remote_rules FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = integration_id AND i.user_id = auth.uid()));
CREATE POLICY siem_remote_snapshots_read ON public.siem_remote_rule_snapshots FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_remote_rules r WHERE r.id = remote_rule_id));

-- The ONE definition of a rule's relationship to the library. SQL owns it; the browser
-- reads the computed column. Order matters: an adopted rule is "already in library" even
-- if a later adapter version can no longer normalise it.
CREATE OR REPLACE FUNCTION public.siem_inventory_relationship(
  p_binding_status text, p_normalization_error text, p_match_candidate_count integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_binding_status = 'active' THEN 'already_in_library'
    WHEN p_binding_status IS NOT NULL THEN 'archived_in_library'
    WHEN p_normalization_error IS NOT NULL THEN 'unsupported'
    WHEN coalesce(p_match_candidate_count, 0) > 0 THEN 'match_needed'
    ELSE 'not_in_library' END;
$$;

CREATE VIEW public.siem_inventory_rows WITH (security_invoker = true) AS
SELECT r.id, r.integration_id, r.provider_scope, r.vendor_rule_id, r.rule_family, r.display_name,
       r.observed_enabled, r.availability, r.normalization_error, r.match_candidate_count,
       r.latest_snapshot_id, r.last_seen_at, r.first_seen_at,
       b.id AS binding_id, b.binding_status, b.detection_id,
       public.siem_inventory_relationship(b.binding_status, r.normalization_error,
         r.match_candidate_count) AS relationship
  FROM public.siem_remote_rules r
  LEFT JOIN public.siem_rule_bindings b
    ON b.integration_id = r.integration_id
   AND b.provider_scope = r.provider_scope
   AND b.vendor_rule_id = r.vendor_rule_id;
REVOKE ALL ON public.siem_inventory_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.siem_inventory_rows TO authenticated;

-- Classification counts for the filter chips. STABLE and SECURITY INVOKER so the caller's
-- RLS applies; the browser calls this directly rather than paying the Edge Function rate limit.
CREATE OR REPLACE FUNCTION public.siem_inventory_counts(p_integration uuid, p_search text DEFAULT NULL)
RETURNS TABLE(relationship text, rules bigint) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT v.relationship, count(*)
    FROM siem_inventory_rows v
   WHERE v.integration_id = p_integration
     AND (p_search IS NULL OR p_search = ''
          OR v.display_name ILIKE '%' || p_search || '%'
          OR v.vendor_rule_id ILIKE '%' || p_search || '%')
   GROUP BY v.relationship;
$$;
REVOKE ALL ON FUNCTION public.siem_inventory_relationship(text,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.siem_inventory_counts(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siem_inventory_relationship(text,text,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.siem_inventory_counts(uuid,text) TO authenticated, service_role;

-- Backfill catalog identities from rules already adopted, so the inventory does not appear
-- empty on the migration boundary. Observed state comes from the binding's own last
-- observation; availability stays 'unknown' because this backfill read nothing from the
-- vendor. It creates no detection and fabricates no successful import. A real fetch fills
-- in display names, snapshots and availability.
INSERT INTO public.siem_remote_rules(integration_id, provider, provider_scope, vendor_rule_id,
  display_name, observed_enabled, availability, first_seen_at, last_seen_at)
SELECT b.integration_id, b.provider, b.provider_scope, b.vendor_rule_id,
       coalesce(d.name, b.vendor_rule_id), b.observed_enabled, 'unknown', b.first_seen_at, b.last_seen_at
  FROM public.siem_rule_bindings b
  LEFT JOIN public.detections d ON d.id = b.detection_id
ON CONFLICT (integration_id, provider_scope, vendor_rule_id) DO NOTHING;
