-- pgmq.read exposes read_ct as integer. Keep the wrapper signature aligned so
-- the queue consumer can read messages on installed PGMQ versions.

DROP FUNCTION IF EXISTS public.auto_digest_read_queue(integer, integer);

CREATE FUNCTION public.auto_digest_read_queue(
  p_visibility_seconds integer DEFAULT 600,
  p_quantity integer DEFAULT 10
)
RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role','postgres')
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'auto_digest_read_queue is internal only' USING ERRCODE = '42501';
  END IF;
  IF to_regnamespace('pgmq') IS NULL THEN RETURN; END IF;
  RETURN QUERY EXECUTE 'SELECT msg_id, read_ct, enqueued_at, vt, message FROM pgmq.read($1, $2, $3)'
    USING 'auto-digest-work', GREATEST(30, p_visibility_seconds), LEAST(50, GREATEST(1, p_quantity));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_digest_read_queue(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_digest_read_queue(integer, integer) TO service_role;
