-- Follow-up hardening for the durable auto-digest queue.

DO $$
BEGIN
  IF to_regnamespace('pgmq') IS NOT NULL THEN
    BEGIN
      PERFORM pgmq.create('auto-digest-work');
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END;
$$;

-- A security-definer request function legitimately enqueues on behalf of an
-- authenticated caller. Direct Data API execution remains revoked below.
CREATE OR REPLACE FUNCTION public.auto_digest_enqueue(
  p_kind text, p_job_id uuid, p_entry_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb, p_delay_seconds integer DEFAULT 0
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE
  v_message_id bigint;
  v_payload jsonb;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND current_setting('request.jwt.claim.role', true) NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'auto_digest_enqueue is internal only' USING ERRCODE = '42501';
  END IF;
  v_payload := jsonb_build_object(
    'kind', p_kind,
    'job_id', p_job_id,
    'entry_id', p_entry_id,
    'payload', COALESCE(p_payload, '{}'::jsonb),
    'enqueued_at', now()
  );
  IF to_regnamespace('pgmq') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT pgmq.send($1, $2, $3)'
    INTO v_message_id
    USING 'auto-digest-work', v_payload, GREATEST(0, COALESCE(p_delay_seconds, 0));
  RETURN v_message_id;
END;
$$;

CREATE POLICY auto_digest_job_entries_select_own
  ON public.auto_digest_job_entries FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY auto_digest_job_entries_service_all
  ON public.auto_digest_job_entries FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.auto_digest_job_entries FROM anon, authenticated;
GRANT SELECT ON public.auto_digest_job_entries TO authenticated;

