-- Lock down one-off rollback snapshots created by the Aug 7/11 data repairs.
--
-- These tables contain complete IOC and detection-rule JSON copied from
-- threat_intel_reports. Because public is exposed through the Data API and the
-- project still has legacy default table grants, CREATE TABLE AS made every
-- snapshot anonymously readable and writable. They are migration recovery
-- artifacts, not application API resources.
--
-- Keep the snapshots intact, but remove every end-user privilege and enable
-- RLS as defense in depth. The service role retains read-only access for
-- controlled recovery/inspection; migrations and SQL Editor recovery run as
-- the owning postgres role and are unaffected.

DO $lockdown$
DECLARE
  backup_table text;
BEGIN
  FOREACH backup_table IN ARRAY ARRAY[
    '_backup_iocs_d3_20260807',
    '_backup_rules_e2_20260807',
    '_backup_rules_e3_20260807',
    '_backup_rules_e4_20260807',
    '_backup_rules_e4b_20260811',
    '_backup_rules_e4c_20260811'
  ]
  LOOP
    IF to_regclass(format('public.%I', backup_table)) IS NULL THEN
      RAISE EXCEPTION 'Expected backup table public.% is missing', backup_table;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      backup_table
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      backup_table
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role',
      backup_table
    );
    EXECUTE format(
      'GRANT SELECT ON TABLE public.%I TO service_role',
      backup_table
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS backup_snapshot_service_select ON public.%I',
      backup_table
    );
    EXECUTE format(
      'CREATE POLICY backup_snapshot_service_select ON public.%I FOR SELECT TO service_role USING (true)',
      backup_table
    );
  END LOOP;
END
$lockdown$;
