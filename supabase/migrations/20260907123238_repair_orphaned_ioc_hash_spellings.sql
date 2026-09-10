-- D3b: repair the indicator hash spellings written between the D3 backfill and
-- the D3 deploy.
--
-- D3 canonicalised indicator types in code (sha-256 -> sha256) and backfilled
-- 546 stored indicators on 2026-08-07. The corrected extractor did not reach
-- production until 2026-08-11 11:22 UTC, and the auto-digest runs daily at
-- ~06:05 -- so three runs inside that four-day window wrote the old spelling
-- behind the backfill that had just corrected it. E4b recorded exactly this
-- ordering failure ("backfill and deploy have to be ordered, or the backfill is
-- overtaken by the bug it just fixed") and repaired the RULE rows it produced.
-- The INDICATOR rows were never revisited, so D3 has read as closed while nine
-- of them were not.
--
-- Export is unaffected: getStixPattern canonicalises on read, so these nine
-- already export as file hashes. What is wrong is the stored `category`, which
-- drives the Indicators tab filter chips -- nine real hashes sit under OTHER
-- instead of HASHES on three reports.
--
-- Scope verified against the full corpus before writing: 'sha-256' is the only
-- non-canonical indicator type remaining. No uppercase variants, no other
-- separator spellings, nothing adjacent to hit by accident.
--
-- Idempotent: re-running finds no 'sha-256' to change and leaves the existing
-- snapshot in place.

-- 1. Snapshot, then lock it down immediately. CREATE TABLE AS inherits this
--    project's legacy default grants, which is what made the Aug 7/11
--    snapshots anonymously readable until 20260811201133 closed it. Same
--    treatment here rather than leaving a seventh one open.
CREATE TABLE IF NOT EXISTS public._backup_iocs_d3b_20260907 AS
SELECT r.id, r.iocs, now() AS snapshot_at
FROM public.threat_intel_reports r
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.iocs, '[]'::jsonb)) e
  WHERE e->>'type' = 'sha-256'
);

ALTER TABLE public._backup_iocs_d3b_20260907 ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public._backup_iocs_d3b_20260907 FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public._backup_iocs_d3b_20260907 FROM service_role;
GRANT SELECT ON TABLE public._backup_iocs_d3b_20260907 TO service_role;
DROP POLICY IF EXISTS backup_snapshot_service_select ON public._backup_iocs_d3b_20260907;
CREATE POLICY backup_snapshot_service_select ON public._backup_iocs_d3b_20260907
  FOR SELECT TO service_role USING (true);

-- 2. Repair. Array order is preserved through WITH ORDINALITY. Only `type` is
--    rewritten, plus `category` where it currently reads 'other' -- so a row
--    that was already categorised correctly is not overwritten on the strength
--    of its type alone. Every other key on every indicator (value, context,
--    severity, evidenceSupported, potentialFalsePositive) is carried through by
--    the `i ||` merge rather than being reconstructed.
UPDATE public.threat_intel_reports r
SET iocs = (
  SELECT jsonb_agg(
           CASE WHEN i->>'type' = 'sha-256'
             THEN i
                  || jsonb_build_object('type', 'sha256')
                  || CASE WHEN i->>'category' = 'other'
                          THEN jsonb_build_object('category', 'hashes')
                          ELSE '{}'::jsonb END
             ELSE i END
           ORDER BY ord)
  FROM jsonb_array_elements(r.iocs) WITH ORDINALITY AS t(i, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.iocs, '[]'::jsonb)) e
  WHERE e->>'type' = 'sha-256'
);

-- 3. Prove it, and abort the whole migration if any part fails.
--
--    The middle assertion is the strong one: rather than checking "only these
--    fields changed", it rebuilds what each report's `iocs` SHOULD be by
--    applying the intended transform to the snapshot, and requires the stored
--    array to equal that exactly -- position by position, key by key. Anything
--    this migration touched that it did not intend to touch fails here.
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
  WHERE i->>'type' = 'sha-256';
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'D3b aborted: % legacy sha-256 indicator(s) still present', v_remaining;
  END IF;

  SELECT count(*) INTO v_mismatch
  FROM public._backup_iocs_d3b_20260907 b
  JOIN public.threat_intel_reports r ON r.id = b.id
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
             CASE WHEN s->>'type' = 'sha-256'
               THEN s
                    || jsonb_build_object('type', 'sha256')
                    || CASE WHEN s->>'category' = 'other'
                            THEN jsonb_build_object('category', 'hashes')
                            ELSE '{}'::jsonb END
               ELSE s END
             ORDER BY ord) AS expected
    FROM jsonb_array_elements(b.iocs) WITH ORDINALITY AS e(s, ord)
  ) x
  WHERE r.iocs IS DISTINCT FROM x.expected;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'D3b aborted: % report(s) do not match the expected transform of their snapshot', v_mismatch;
  END IF;

  SELECT count(*) INTO v_countdrift
  FROM public._backup_iocs_d3b_20260907 b
  JOIN public.threat_intel_reports r ON r.id = b.id
  WHERE jsonb_array_length(r.iocs) <> jsonb_array_length(b.iocs);
  IF v_countdrift <> 0 THEN
    RAISE EXCEPTION 'D3b aborted: indicator count changed on % report(s)', v_countdrift;
  END IF;

  SELECT count(*), count(DISTINCT b.id) INTO v_repaired, v_reports
  FROM public._backup_iocs_d3b_20260907 b,
       jsonb_array_elements(b.iocs) s
  WHERE s->>'type' = 'sha-256';

  RAISE NOTICE 'D3b: repaired % indicator(s) across % report(s); 0 legacy spellings remain', v_repaired, v_reports;
END
$verify$;
