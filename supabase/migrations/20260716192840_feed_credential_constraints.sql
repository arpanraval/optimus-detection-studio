DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'threat_intel_feeds_taxii_credential_id_fkey'
       AND conrelid = 'public.threat_intel_feeds'::regclass
  ) THEN
    ALTER TABLE public.threat_intel_feeds
      ADD CONSTRAINT threat_intel_feeds_taxii_credential_id_fkey
      FOREIGN KEY (taxii_credential_id) REFERENCES public.integration_credentials(id) ON DELETE SET NULL;
  END IF;
END;
$$;

ALTER TABLE public.threat_intel_feeds
  DROP CONSTRAINT IF EXISTS threat_intel_feeds_max_items_per_fetch_check;
ALTER TABLE public.threat_intel_feeds
  ADD CONSTRAINT threat_intel_feeds_max_items_per_fetch_check
  CHECK (max_items_per_fetch BETWEEN 1 AND 200);
