-- A stable, order-independent description of the native-SIEM database surface.
--
-- Used to prove that two ways of arriving at the schema agree: a FRESH INSTALL (supabase/schema.sql
-- on an empty database) and an UPGRADE (the previously deployed schema plus every native_siem
-- migration in order). CI already proves the fresh install stands up, but it never applies the
-- migrations — so the one mistake the schema.sql mirror exists to prevent, a migration whose text
-- drifted from its mirrored copy, was exactly the case nothing ran.
--
-- Covers what a migration can silently get wrong:
--   fn   function bodies AND their grants (a DROP+CREATE discards the ACL, and Supabase's default
--        privileges then re-grant EXECUTE to PUBLIC — invisible to a body-only comparison)
--   col  column types, nullability and defaults
--   con  constraint definitions, including the CHECK vocabularies that widen over time
--   pol  RLS policies and their USING clauses
--
-- Carriage returns are stripped before hashing: git's autocrlf leaves the working tree with
-- platform-dependent line endings, so the same body can be byte-different between a Windows
-- checkout and CI. This guard is for semantic divergence; CRLF noise would make it cry wolf
-- locally and stay silent on CI, which is the worst of both.
SELECT 'fn  ' || p.oid::regprocedure::text || ' :: ' || md5(replace(p.prosrc, chr(13), ''))
       || ' :: anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
       || ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
       || ' svc=' || has_function_privilege('service_role', p.oid, 'EXECUTE') AS line
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'siem\_%'
UNION ALL
SELECT 'col ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
       || ' notnull=' || a.attnotnull || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE n.nspname = 'public' AND c.relname LIKE 'siem\_%' AND a.attnum > 0 AND NOT a.attisdropped
UNION ALL
SELECT 'con ' || c.relname || ' ' || k.conname || ' ' || pg_get_constraintdef(k.oid)
  FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname LIKE 'siem\_%'
UNION ALL
SELECT 'pol ' || tablename || ' ' || policyname || ' ' || coalesce(qual, '-')
  FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'siem\_%'
ORDER BY 1;
