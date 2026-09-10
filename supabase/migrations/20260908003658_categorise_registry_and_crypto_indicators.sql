-- D3c: file the `registry` and `crypto` indicators the v2 rebuild left under OTHER.
--
-- The durable-queue rebuild (a992dda, live 2026-08-11 11:22 UTC) moved indicator
-- category derivation from the model's bucket name to the indicator type:
-- before it, every category came from `mapIoCCategory('registry_keys') = 'windows'`;
-- after it, from `getIoCCategory('registry')`, which had no key for `registry` or
-- `crypto` and so returned the default 'other'. Same indicator kind, two chips,
-- split on the deploy date:
--
--   registry -> windows   20 rows, 11 reports, 2026-01-21 .. 2026-07-17
--   registry -> other     10 rows,  6 reports, 2026-08-11 .. 2026-09-03
--   crypto   -> crypto     7 rows,  4 reports, 2026-05-12 .. 2026-07-16
--   crypto   -> other      5 rows,  3 reports, 2026-08-06 .. 2026-08-11
--
-- The target values are not invented: they are what the bucket map already
-- assigns for the same source bucket, and what the pre-August rows already
-- hold. `type` is deliberately NOT rewritten -- `registry` and `registry_key`
-- stay distinct types, since whether they should be one type is D3's open
-- taxonomy question and this is only a question about which category they
-- belong to.
--
-- Ordering: the corrected extractor was deployed BEFORE this ran, so the
-- ~06:05 UTC auto-digest cannot overtake the backfill. That is the failure
-- E4b named and D3b then repeated.
--
-- Idempotent: re-running finds no 'other'-categorised registry/crypto rows and
-- leaves the existing snapshot in place.

-- 1. Snapshot, then lock it down immediately -- CREATE TABLE AS inherits this
--    project's legacy default grants.
CREATE TABLE IF NOT EXISTS public._backup_iocs_d3c_20260908 AS
SELECT r.id, r.iocs, now() AS snapshot_at
FROM public.threat_intel_reports r
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.iocs, '[]'::jsonb)) e
  WHERE e->>'type' IN ('registry', 'crypto') AND e->>'category' = 'other'
);

ALTER TABLE public._backup_iocs_d3c_20260908 ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public._backup_iocs_d3c_20260908 FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public._backup_iocs_d3c_20260908 FROM service_role;
GRANT SELECT ON TABLE public._backup_iocs_d3c_20260908 TO service_role;
DROP POLICY IF EXISTS backup_snapshot_service_select ON public._backup_iocs_d3c_20260908;
CREATE POLICY backup_snapshot_service_select ON public._backup_iocs_d3c_20260908
  FOR SELECT TO service_role USING (true);

-- 2. Repair. Array order is preserved through WITH ORDINALITY. Only `category`
--    is rewritten, and only where it currently reads 'other' -- a row already
--    categorised correctly is not overwritten on the strength of its type
--    alone. Every other key on every indicator is carried through by the
--    `i ||` merge rather than being reconstructed.
UPDATE public.threat_intel_reports r
SET iocs = (
  SELECT jsonb_agg(
           CASE WHEN i->>'category' = 'other' AND i->>'type' IN ('registry', 'crypto')
             THEN i || jsonb_build_object(
                    'category',
                    CASE i->>'type' WHEN 'registry' THEN 'windows' ELSE 'crypto' END)
             ELSE i END
           ORDER BY ord)
  FROM jsonb_array_elements(r.iocs) WITH ORDINALITY AS t(i, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.iocs, '[]'::jsonb)) e
  WHERE e->>'type' IN ('registry', 'crypto') AND e->>'category' = 'other'
);

-- 3. Prove it, and abort the whole migration if any part fails. The middle
--    assertion is the strong one: it rebuilds what each report's `iocs` SHOULD
--    be by applying the intended transform to the snapshot and requires the
--    stored array to equal that exactly -- position by position, key by key.
DO $verify$
DECLARE
  v_remaining  int;
  v_mismatch   int;
  v_repaired   int;
  v_reports    int;
  v_countdrift int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.threat_intel_reports r,
       jsonb_array_elements(COALESCE(r.iocs, '[]'::jsonb)) i
  WHERE i->>'type' IN ('registry', 'crypto') AND i->>'category' = 'other';
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'D3c aborted: % registry/crypto indicator(s) still categorised as other', v_remaining;
  END IF;

  SELECT count(*) INTO v_mismatch
  FROM public._backup_iocs_d3c_20260908 b
  JOIN public.threat_intel_reports r ON r.id = b.id
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
             CASE WHEN s->>'category' = 'other' AND s->>'type' IN ('registry', 'crypto')
               THEN s || jsonb_build_object(
                      'category',
                      CASE s->>'type' WHEN 'registry' THEN 'windows' ELSE 'crypto' END)
               ELSE s END
             ORDER BY ord) AS expected
    FROM jsonb_array_elements(b.iocs) WITH ORDINALITY AS e(s, ord)
  ) x
  WHERE r.iocs IS DISTINCT FROM x.expected;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'D3c aborted: % report(s) do not match the expected transform of their snapshot', v_mismatch;
  END IF;

  SELECT count(*) INTO v_countdrift
  FROM public._backup_iocs_d3c_20260908 b
  JOIN public.threat_intel_reports r ON r.id = b.id
  WHERE jsonb_array_length(r.iocs) <> jsonb_array_length(b.iocs);
  IF v_countdrift <> 0 THEN
    RAISE EXCEPTION 'D3c aborted: indicator count changed on % report(s)', v_countdrift;
  END IF;

  SELECT count(*), count(DISTINCT b.id) INTO v_repaired, v_reports
  FROM public._backup_iocs_d3c_20260908 b,
       jsonb_array_elements(b.iocs) s
  WHERE s->>'type' IN ('registry', 'crypto') AND s->>'category' = 'other';

  RAISE NOTICE 'D3c: recategorised % indicator(s) across % report(s)', v_repaired, v_reports;
END
$verify$;
