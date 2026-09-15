-- "Import as a separate rule" IS the user resolving the ambiguity: they reviewed the
-- candidates and rejected them. Clearing the candidate count records that decision, after
-- which the ordinary import path (siem_start_import, applied and unchanged) sees the rule as
-- not_in_library and can adopt it. siem_start_import is NOT touched here: it is already in
-- production, and DROP + CREATE to add a parameter would discard its ACL and let Supabase's
-- default privileges re-grant EXECUTE to PUBLIC.
CREATE OR REPLACE FUNCTION public.siem_dismiss_match_candidates(p_actor uuid, p_integration uuid,
  p_vendor_rule_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE rr siem_remote_rules;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  IF NOT siem_can_edit(p_actor) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  SELECT * INTO rr FROM siem_remote_rules
   WHERE integration_id = p_integration AND vendor_rule_id = p_vendor_rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fetch rules from CrowdStrike before importing'; END IF;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings
              WHERE integration_id = p_integration AND provider_scope = rr.provider_scope
                AND vendor_rule_id = p_vendor_rule_id) THEN
    RAISE EXCEPTION 'This rule is already linked to a library rule.';
  END IF;
  UPDATE siem_remote_rules SET match_candidate_count = 0 WHERE id = rr.id;
END $$;
REVOKE ALL ON FUNCTION public.siem_dismiss_match_candidates(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_dismiss_match_candidates(uuid, uuid, text) TO service_role;
