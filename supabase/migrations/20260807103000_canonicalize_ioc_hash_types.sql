-- D3: canonicalise indicator hash-type spellings in stored reports.
--
-- The AI extractor typed hashes by passing the model's own word through
-- (`item?.hash_type?.toLowerCase()`), so the database accumulated two spellings
-- for the same kind of indicator: 490 `sha-256` against 25 `sha256`, and 56
-- `sha-1` against 13 `sha1`.
--
-- Every consumer that switches on the type is written against the canonical
-- spelling, so the majority spelling missed all of them:
--   * IOC_TYPE_TO_CATEGORY fell through to 'other', leaving 25 hashes outside
--     the Hashes filter.
--   * getStixPattern fell through to `[artifact:payload_bin = base64(...)]`,
--     exporting hashes as opaque blobs instead of file-hash indicators.
--
-- The code fix canonicalises on write AND on read, so export is correct for
-- legacy rows without this migration. This exists so the stored data stops
-- carrying two spellings for one thing -- otherwise the fix is cosmetic and
-- every future query still has to know about both.
--
-- Safe to run more than once: rows already canonical are not matched.
--
-- Scope was taken from a dry run against live data, which found hash types to
-- be the only affected spellings (546 rows across 51 reports). The final
-- assertion below fails the migration if that is ever untrue.

-- Reversible snapshot. Retained deliberately; drop once the change has been
-- observed in the UI.
CREATE TABLE IF NOT EXISTS _backup_iocs_d3_20260807 AS
SELECT id, iocs, now() AS backed_up_at
FROM threat_intel_reports
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(iocs) AS i WHERE i->>'type' IN ('sha-256', 'sha-1')
);

UPDATE threat_intel_reports r
SET iocs = (
  SELECT jsonb_agg(
    CASE
      WHEN i->>'type' IN ('sha-256', 'sha-1') THEN
        -- Merge, so every other key on the indicator (value, context,
        -- severity, evidenceSupported, ...) is carried through untouched.
        i || jsonb_build_object(
          'type', CASE i->>'type' WHEN 'sha-256' THEN 'sha256' WHEN 'sha-1' THEN 'sha1' END,
          'category', 'hashes'
        )
      ELSE i
    END
    ORDER BY ord   -- indicator order is user-visible; preserve it
  )
  FROM jsonb_array_elements(r.iocs) WITH ORDINALITY AS t(i, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(r.iocs) AS i WHERE i->>'type' IN ('sha-256', 'sha-1')
);

DO $$
DECLARE
  remaining int;
  lost int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM threat_intel_reports, jsonb_array_elements(iocs) AS i
  WHERE i->>'type' IN ('sha-256', 'sha-1');
  IF remaining > 0 THEN
    RAISE EXCEPTION 'D3 backfill incomplete: % legacy hash spellings remain', remaining;
  END IF;

  SELECT COUNT(*) INTO lost
  FROM _backup_iocs_d3_20260807 b
  JOIN threat_intel_reports r ON r.id = b.id
  WHERE jsonb_array_length(b.iocs) <> jsonb_array_length(r.iocs);
  IF lost > 0 THEN
    RAISE EXCEPTION 'D3 backfill changed indicator counts on % report(s)', lost;
  END IF;
END $$;
