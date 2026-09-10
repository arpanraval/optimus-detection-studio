-- E2: rules whose declared type is a real language but whose content is not
-- a rule.
--
-- E3 gave every rule a `kind`, decided from the declared type alone. That
-- cannot catch a rule whose type tells the truth and whose content does not,
-- and the corpus is full of exactly that:
--
--   type: snort   content: "66788"                            (a SID)
--   type: clamav  content: "Win.Trojan.CloudZRAT-10059935-0"  (a signature name)
--   type: yara    content: "MAL_RANSOM_INC_Aug24"             (a rule name)
--   type: sigma   content: "404: Not Found"                   (a failed fetch)
--
-- All were marked kind='query' -- deployable -- because their language is
-- real. `isDeployableRule` said yes over a five-digit number.
--
-- Each rule is now checked against a token its own language's grammar
-- REQUIRES, rather than against a list of ways content can be wrong. Failing
-- that test demotes the rule to `reference`; it is never dropped. The
-- identifier is the point -- 66788 tells you Cisco ships coverage, and E1
-- exists to resolve exactly these.
--
-- Dropping short rules was rejected as the fix: `66788` is five characters and
-- meaningful, while a 200-character prose blob is long and still not a rule.
-- Length correlates with the problem without being it.
--
-- METHOD NOTE. Unlike the E4 backfill, these predicates are plain regexes and
-- are mirrored here from supabase/functions/_shared/rule-type.ts rather than
-- generated from it. The equivalence was checked by dry-running this SQL
-- against the corpus and reconciling the result with the module's own corpus
-- test (411 total, 147 non-query by type, 57 demoted by content, leaving 207
-- queries). Two false positives were caught that way and fixed in the module
-- BEFORE this migration was written:
--   * Microsoft Sentinel analytics YAML, labelled `sigma` by the extension
--     fallback, carries `query:` rather than `detection:` and is deployable.
--   * Wiz filter syntax is URL-encoded and contains no whitespace, so the
--     single-token fallback demoted every real Wiz query.
--
-- Safe to re-run: rows already demoted are rewritten with the same values.

CREATE TABLE IF NOT EXISTS _backup_rules_e2_20260807 AS
SELECT id, rules, now() AS backed_up_at
FROM threat_intel_reports
WHERE jsonb_array_length(COALESCE(rules, '[]'::jsonb)) > 0;

UPDATE threat_intel_reports r
SET rules = (
  SELECT jsonb_agg(
    CASE
      WHEN ru->>'kind' = 'query' AND NOT (
        CASE ru->>'type'
          WHEN 'sigma'    THEN ru->>'content' ~* '\m(detection|query)\s*:'
          WHEN 'yara'     THEN ru->>'content' ~* 'condition\s*:'
          WHEN 'snort'    THEN ru->>'content' ~* '^\s*(alert|drop|reject|pass|log|sdrop)\s'
          WHEN 'suricata' THEN ru->>'content' ~* '^\s*(alert|drop|reject|pass|log|sdrop)\s'
          WHEN 'clamav'   THEN ru->>'content' LIKE '%:%'
          WHEN 'wiz_cloud_event_query' THEN ru->>'content' LIKE '%~%'
          -- Everything else: a query has more than one token. A bare
          -- identifier is a name, not something you can run.
          ELSE ru->>'content' ~ '\s'
        END
      )
      THEN ru || jsonb_build_object('kind', 'reference', 'demotedByContent', true)
      ELSE ru
    END
    ORDER BY ord   -- rule order is user-visible; preserve it
  )
  FROM jsonb_array_elements(r.rules) WITH ORDINALITY AS t(ru, ord)
)
WHERE jsonb_array_length(COALESCE(r.rules, '[]'::jsonb)) > 0;

DO $$
DECLARE
  bad_queries int;
  lost int;
  queries int;
BEGIN
  -- No rule may still claim to be a deployable query while failing its own
  -- language's shape test.
  SELECT COUNT(*) INTO bad_queries
  FROM threat_intel_reports, jsonb_array_elements(rules) AS ru
  WHERE ru->>'kind' = 'query' AND NOT (
    CASE ru->>'type'
      WHEN 'sigma'    THEN ru->>'content' ~* '\m(detection|query)\s*:'
      WHEN 'yara'     THEN ru->>'content' ~* 'condition\s*:'
      WHEN 'snort'    THEN ru->>'content' ~* '^\s*(alert|drop|reject|pass|log|sdrop)\s'
      WHEN 'suricata' THEN ru->>'content' ~* '^\s*(alert|drop|reject|pass|log|sdrop)\s'
      WHEN 'clamav'   THEN ru->>'content' LIKE '%:%'
      WHEN 'wiz_cloud_event_query' THEN ru->>'content' LIKE '%~%'
      ELSE ru->>'content' ~ '\s'
    END
  );
  IF bad_queries > 0 THEN
    RAISE EXCEPTION 'E2 backfill incomplete: % rule(s) still claim to be deployable queries', bad_queries;
  END IF;

  SELECT COUNT(*) INTO lost
  FROM _backup_rules_e2_20260807 b
  JOIN threat_intel_reports r ON r.id = b.id
  WHERE jsonb_array_length(b.rules) <> jsonb_array_length(r.rules);
  IF lost > 0 THEN
    RAISE EXCEPTION 'E2 backfill changed rule counts on % report(s)', lost;
  END IF;

  -- Reconciles with the module's corpus test: 411 - 147 - 57 = 207.
  SELECT COUNT(*) INTO queries
  FROM threat_intel_reports, jsonb_array_elements(rules) AS ru
  WHERE ru->>'kind' = 'query';
  IF queries <> 207 THEN
    RAISE WARNING 'E2: expected 207 deployable queries, found % -- corpus may have changed since this migration was written', queries;
  END IF;
END $$;
