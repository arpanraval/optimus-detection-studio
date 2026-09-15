-- Milestone 3: "Select all N matching rules" has to name a number the server would actually
-- freeze. The filter chips answer a different question -- what is this rule's RELATIONSHIP to the
-- library -- so `not_in_library` is the wrong number for the selection bar: a rule the last scan
-- could not read, or one that has since been deleted in CrowdStrike, is still "not in library"
-- but siem_start_import will skip it.
--
-- Emitted as an extra row rather than an extra column so the RETURNS TABLE signature is unchanged:
-- CREATE OR REPLACE genuinely replaces the function in place, no DROP, no ACL loss. 'importable'
-- is deliberately not a member of InventoryRelationship, and the chip list is explicit, so it
-- cannot render as a sixth chip.
CREATE OR REPLACE FUNCTION public.siem_inventory_counts(p_integration uuid, p_search text DEFAULT NULL)
RETURNS TABLE(relationship text, rules bigint) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT v.relationship, count(*)
    FROM siem_inventory_rows v
   WHERE v.integration_id = p_integration
     AND (p_search IS NULL OR p_search = ''
          OR v.display_name ILIKE '%' || p_search || '%'
          OR v.vendor_rule_id ILIKE '%' || p_search || '%')
   GROUP BY v.relationship
  UNION ALL
  -- The same three conditions siem_start_import requires before it will freeze a row as 'pending'.
  SELECT 'importable', count(*)
    FROM siem_inventory_rows v
   WHERE v.integration_id = p_integration
     AND (p_search IS NULL OR p_search = ''
          OR v.display_name ILIKE '%' || p_search || '%'
          OR v.vendor_rule_id ILIKE '%' || p_search || '%')
     AND v.relationship = 'not_in_library'
     AND v.availability = 'present'
     AND v.latest_snapshot_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.siem_inventory_counts(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siem_inventory_counts(uuid,text) TO authenticated, service_role;
