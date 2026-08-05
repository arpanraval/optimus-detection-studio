-- Mark a feed entry processed only after its persisted report belongs to the same user.
CREATE OR REPLACE FUNCTION public.complete_feed_entry_processing(
  p_entry_id uuid,
  p_report_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entry_user_id uuid;
  v_report_user_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT user_id INTO v_entry_user_id
    FROM public.threat_intel_feed_entries
   WHERE id = p_entry_id
   FOR UPDATE;
  IF v_entry_user_id IS NULL OR v_entry_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Feed entry not found' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_report_user_id
    FROM public.threat_intel_reports
   WHERE id = p_report_id;
  IF v_report_user_id IS NULL OR v_report_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Persisted report not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.threat_intel_feed_entries
     SET is_processed = true,
         auto_digest_report_id = p_report_id
   WHERE id = p_entry_id AND user_id = v_user_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_feed_entry_processing(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_feed_entry_processing(uuid, text) TO authenticated, service_role;
