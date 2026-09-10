-- Restore IoC severity extraction.
--
-- ai-extractor.ts:467 reads `item.severity` from the model and accepts only
-- 'malicious' | 'suspicious' | 'unknown', defaulting to 'unknown' otherwise.
-- Neither the shipped default template nor this live override has ever asked
-- the model for a severity field, so `item.severity` is always undefined and
-- every indicator falls to 'unknown'.
--
-- Measured: before 2026-07-17 06:02 UTC, 0 indicators are 'unknown'. After it,
-- 100% are -- 1,337 indicators across 48 reports, 31% of the corpus. The prompt
-- was rewritten in a992dda (durable-queue rebuild) with version constant
-- threat-intel-digest-2026-07-17.1, the same date. Severity was not carried
-- across.
--
-- Scope: add the severity field and nothing else. The three-value vocabulary is
-- unchanged, and matches the extractor's allow-list exactly.
--
-- The value criteria are written to be discriminating rather than merely
-- present: D2 records that when this field did work it was 87.5% 'suspicious',
-- so the instruction defines each value against evidence in the article and
-- explicitly forbids applying one value to the whole list.

-- 1. Snapshot for a one-statement revert, locked down like the other snapshots
--    (CREATE TABLE AS inherits this project's legacy public grants).
CREATE TABLE IF NOT EXISTS public._backup_prompt_templates_20260907 AS
SELECT user_id, prompt_templates, now() AS snapshot_at FROM public.auto_digest_settings;

ALTER TABLE public._backup_prompt_templates_20260907 ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public._backup_prompt_templates_20260907 FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public._backup_prompt_templates_20260907 FROM service_role;
GRANT SELECT ON TABLE public._backup_prompt_templates_20260907 TO service_role;
DROP POLICY IF EXISTS backup_snapshot_service_select ON public._backup_prompt_templates_20260907;
CREATE POLICY backup_snapshot_service_select ON public._backup_prompt_templates_20260907
  FOR SELECT TO service_role USING (true);

-- 2. Surgical edits. Five anchors, each verified unique beforehand, rewritten by
--    replace() rather than by restating the 7,198-character template -- retyping
--    it is how an unrelated line gets changed by accident.
UPDATE public.auto_digest_settings s
SET prompt_templates =
  jsonb_set(
    jsonb_set(
      s.prompt_templates,
      '{iocsAndRules}',
      to_jsonb(
        replace(replace(replace(replace(replace(
          s.prompt_templates->>'iocsAndRules',
$old1$6. **Deduplication**: If the same IoC appears multiple times, include it only once in the output$old1$,
$new1$6. **Deduplication**: If the same IoC appears multiple times, include it only once in the output

7. **Severity**: Assign every IoC a "severity" of exactly one of "malicious", "suspicious", or "unknown", based only on what this article states:
   - "malicious" - the article attributes the indicator to the attacker: C2 infrastructure, payload delivery, attacker-registered domains, a hash of the malware itself, an attacker-controlled account, mailbox or wallet.
   - "suspicious" - the article associates the indicator with the activity but not as attacker-owned: a legitimate service or platform the malware abuses, a dual-use tool or living-off-the-land binary used in the intrusion, a targeted or victim-side asset.
   - "unknown" - the article gives no basis to judge the indicator, or it appears only as background, comparison, or reference material.
   Decide each indicator on its own evidence. Do not apply one value to the whole list, and do not guess: if the article does not say what role an indicator played, use "unknown".$new1$),
$old2$"potential_false_positive": false}
    ],
    "ipv6_addresses"$old2$,
$new2$"severity": "malicious", "potential_false_positive": false}
    ],
    "ipv6_addresses"$new2$),
$old3${"value": "malicious-domain.com", "context": "Command and control domain", "potential_false_positive": false}$old3$,
$new3${"value": "malicious-domain.com", "context": "Command and control domain", "severity": "malicious", "potential_false_positive": false}$new3$),
$old4${"value": "5d41402abc4b2a76b9719d911017c592", "hash_type": "MD5", "context": "Hash of payload", "potential_false_positive": false}$old4$,
$new4${"value": "5d41402abc4b2a76b9719d911017c592", "hash_type": "MD5", "context": "Hash of payload", "severity": "malicious", "potential_false_positive": false}$new4$),
$old5$- Flag potential false positives with explanation$old5$,
$new5$- Flag potential false positives with explanation
- Assign every IoC a severity of "malicious", "suspicious", or "unknown", decided per indicator$new5$)
      )
    ),
    '{version}',
    '"threat-intel-digest-2026-09-07.1"'::jsonb
  );

-- 3. Prove exactly what changed, and abort on anything unexpected.
DO $verify$
DECLARE
  p          text;
  v_other    int;
  v_examples int;
BEGIN
  SELECT prompt_templates->>'iocsAndRules' INTO p FROM public.auto_digest_settings LIMIT 1;

  IF p NOT LIKE '%7. **Severity**%' THEN
    RAISE EXCEPTION 'severity: instruction block not inserted';
  END IF;
  IF p NOT LIKE '%- Assign every IoC a severity of%' THEN
    RAISE EXCEPTION 'severity: critical-reminders line not inserted';
  END IF;

  -- all three populated JSON examples must now carry the field, or the model
  -- sees an instruction with no shape to copy
  v_examples := (length(p) - length(replace(p, '"severity": "malicious"', ''))) / length('"severity": "malicious"');
  IF v_examples <> 3 THEN
    RAISE EXCEPTION 'severity: expected 3 JSON examples carrying the field, found %', v_examples;
  END IF;

  IF p LIKE '%"context": "C2 server for malware", "potential_false_positive"%' THEN
    RAISE EXCEPTION 'severity: ipv4 example was not rewritten';
  END IF;

  IF (SELECT prompt_templates->>'version' FROM public.auto_digest_settings LIMIT 1)
     IS DISTINCT FROM 'threat-intel-digest-2026-09-07.1' THEN
    RAISE EXCEPTION 'severity: prompt version not stamped';
  END IF;

  -- nothing outside iocsAndRules and version may have moved
  SELECT count(*) INTO v_other
  FROM public._backup_prompt_templates_20260907 b
  JOIN public.auto_digest_settings s ON s.user_id = b.user_id
  CROSS JOIN LATERAL jsonb_each(b.prompt_templates) AS old(k, v)
  WHERE old.k NOT IN ('iocsAndRules', 'version')
    AND s.prompt_templates->old.k IS DISTINCT FROM old.v;
  IF v_other <> 0 THEN
    RAISE EXCEPTION 'severity: % unrelated template key(s) changed', v_other;
  END IF;

  RAISE NOTICE 'severity: iocsAndRules updated and version stamped';
END
$verify$;
