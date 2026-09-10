-- E5: give Microsoft Sentinel rule documents their own label.
--
-- A rule's language is derived once, at fetch time, from whatever code was
-- deployed that day, and stored. Nothing re-derives it. Sentinel analytics and
-- hunting YAML had no name of its own, so the same kind of file landed under
-- two different labels depending only on which branch the detector reached
-- first:
--
--   .yaml extension fallback  -> 'sigma'   (2 rules)
--   KQL pipe-operator test    -> 'kql'     (3 rules)
--
-- Neither is right. The file is not Sigma -- it has no `logsource:` and no
-- `detection:` -- and it is not raw KQL either; it is a rule document whose
-- `query:` field holds KQL. `sentinel` is now a query language in
-- `_shared/rule-type.ts`, with `query:` as its required content token, and the
-- fetch-time detector recognises it before the KQL test.
--
-- Predicate, verified against the full corpus before writing: a top-level
-- `query:` key, no `logsource:` (which would make it Sigma), and at least one
-- of the document keys a Sentinel rule file carries (`id`, `tactics`,
-- `requiredDataConnectors`, `queryFrequency`, `queryPeriod`,
-- `triggerOperator`). It matches exactly 5 rules and nothing else.
--
-- TWO ROWS CHANGE MORE THAN THEIR LABEL. "SharePointFileOperation via devices
-- with previously unseen user agents" and "NRT Multiple users email forwarded
-- to same destination" are stored `kind: reference` -- not deployable -- while
-- being 3,530 and 2,377 characters of real Sentinel rule carrying live KQL
-- under `query:`. `kind` follows content shape (E2), and their content has the
-- shape, so they become `query`. This makes them offer a draft in the UI where
-- they did not before. That is the correction, not a side effect, and it is
-- called out here so it is not read later as an unexplained change.
--
-- Idempotent: re-running finds nothing left to relabel.

-- 1. Snapshot, then lock it down immediately -- CREATE TABLE AS inherits this
--    project's legacy default grants.
CREATE TABLE IF NOT EXISTS public._backup_rules_e5_20260908 AS
SELECT r.id, r.rules, now() AS snapshot_at
FROM public.threat_intel_reports r
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.rules, '[]'::jsonb)) e
  WHERE e->>'type' IN ('sigma', 'kql')
    AND (e->>'content') ~ '(^|\n)[ \t]*query[ \t]*:'
    AND (e->>'content') !~* '(^|\n)[ \t]*logsource[ \t]*:'
    AND (e->>'content') ~* '(^|\n)[ \t]*(id|requiredDataConnectors|queryFrequency|queryPeriod|triggerOperator|tactics)[ \t]*:'
);

ALTER TABLE public._backup_rules_e5_20260908 ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public._backup_rules_e5_20260908 FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public._backup_rules_e5_20260908 FROM service_role;
GRANT SELECT ON TABLE public._backup_rules_e5_20260908 TO service_role;
DROP POLICY IF EXISTS backup_snapshot_service_select ON public._backup_rules_e5_20260908;
CREATE POLICY backup_snapshot_service_select ON public._backup_rules_e5_20260908
  FOR SELECT TO service_role USING (true);

-- 2. Relabel. Array order preserved through WITH ORDINALITY. Only `type` and
--    `kind` are written; every other key rides through the `i ||` merge rather
--    than being reconstructed.
UPDATE public.threat_intel_reports r
SET rules = (
  SELECT jsonb_agg(
           CASE WHEN i->>'type' IN ('sigma', 'kql')
                     AND (i->>'content') ~ '(^|\n)[ \t]*query[ \t]*:'
                     AND (i->>'content') !~* '(^|\n)[ \t]*logsource[ \t]*:'
                     AND (i->>'content') ~* '(^|\n)[ \t]*(id|requiredDataConnectors|queryFrequency|queryPeriod|triggerOperator|tactics)[ \t]*:'
             THEN i || jsonb_build_object('type', 'sentinel', 'kind', 'query')
             ELSE i END
           ORDER BY ord)
  FROM jsonb_array_elements(r.rules) WITH ORDINALITY AS t(i, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.rules, '[]'::jsonb)) e
  WHERE e->>'type' IN ('sigma', 'kql')
    AND (e->>'content') ~ '(^|\n)[ \t]*query[ \t]*:'
    AND (e->>'content') !~* '(^|\n)[ \t]*logsource[ \t]*:'
    AND (e->>'content') ~* '(^|\n)[ \t]*(id|requiredDataConnectors|queryFrequency|queryPeriod|triggerOperator|tactics)[ \t]*:'
);

-- 3. Prove it, and abort the whole migration if any part fails. The middle
--    assertion rebuilds what each report's `rules` SHOULD be by applying the
--    intended transform to the snapshot and requires byte equality.
DO $verify$
DECLARE
  v_remaining  int;
  v_mismatch   int;
  v_relabelled int;
  v_reports    int;
  v_countdrift int;
  v_sentinel   int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.threat_intel_reports r,
       jsonb_array_elements(COALESCE(r.rules, '[]'::jsonb)) i
  WHERE i->>'type' IN ('sigma', 'kql')
    AND (i->>'content') ~ '(^|\n)[ \t]*query[ \t]*:'
    AND (i->>'content') !~* '(^|\n)[ \t]*logsource[ \t]*:'
    AND (i->>'content') ~* '(^|\n)[ \t]*(id|requiredDataConnectors|queryFrequency|queryPeriod|triggerOperator|tactics)[ \t]*:';
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'E5 aborted: % Sentinel document(s) still mislabelled', v_remaining;
  END IF;

  SELECT count(*) INTO v_mismatch
  FROM public._backup_rules_e5_20260908 b
  JOIN public.threat_intel_reports r ON r.id = b.id
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
             CASE WHEN s->>'type' IN ('sigma', 'kql')
                       AND (s->>'content') ~ '(^|\n)[ \t]*query[ \t]*:'
                       AND (s->>'content') !~* '(^|\n)[ \t]*logsource[ \t]*:'
                       AND (s->>'content') ~* '(^|\n)[ \t]*(id|requiredDataConnectors|queryFrequency|queryPeriod|triggerOperator|tactics)[ \t]*:'
               THEN s || jsonb_build_object('type', 'sentinel', 'kind', 'query')
               ELSE s END
             ORDER BY ord) AS expected
    FROM jsonb_array_elements(b.rules) WITH ORDINALITY AS e(s, ord)
  ) x
  WHERE r.rules IS DISTINCT FROM x.expected;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'E5 aborted: % report(s) do not match the expected transform of their snapshot', v_mismatch;
  END IF;

  SELECT count(*) INTO v_countdrift
  FROM public._backup_rules_e5_20260908 b
  JOIN public.threat_intel_reports r ON r.id = b.id
  WHERE jsonb_array_length(r.rules) <> jsonb_array_length(b.rules);
  IF v_countdrift <> 0 THEN
    RAISE EXCEPTION 'E5 aborted: rule count changed on % report(s)', v_countdrift;
  END IF;

  SELECT count(*) INTO v_sentinel
  FROM public.threat_intel_reports r, jsonb_array_elements(COALESCE(r.rules, '[]'::jsonb)) i
  WHERE i->>'type' = 'sentinel';

  SELECT count(*), count(DISTINCT b.id) INTO v_relabelled, v_reports
  FROM public._backup_rules_e5_20260908 b, jsonb_array_elements(b.rules) s
  WHERE s->>'type' IN ('sigma', 'kql')
    AND (s->>'content') ~ '(^|\n)[ \t]*query[ \t]*:'
    AND (s->>'content') !~* '(^|\n)[ \t]*logsource[ \t]*:'
    AND (s->>'content') ~* '(^|\n)[ \t]*(id|requiredDataConnectors|queryFrequency|queryPeriod|triggerOperator|tactics)[ \t]*:';

  RAISE NOTICE 'E5: relabelled % rule(s) across % report(s); % sentinel rules now stored', v_relabelled, v_reports, v_sentinel;
END
$verify$;
