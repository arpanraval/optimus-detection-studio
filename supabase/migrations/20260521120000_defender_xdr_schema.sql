-- 20260521120000_defender_xdr_schema.sql
--
-- Defender XDR Advanced Hunting schema reference. Universal data (tenant-
-- agnostic), pulled from Microsoft's internal huntingService API via
-- Get-DefenderSchema.ps1. Lets the Detection Engineer write KQL against
-- documented columns instead of guessing, and gives the QA side a
-- deterministic field-name oracle (no extra LLM call).
--
-- Two tables, normalized:
--   defender_xdr_tables   — 1 row per table (metadata, retention, has_data)
--   defender_xdr_columns  — 1 row per (table, column) pair (1k+ rows)
--
-- has_data is tenant-specific in principle, but we ship it for the import
-- tenant as a hint about Microsoft's typical availability. Real per-user
-- feasibility still flows through environment_profiles.
--
-- column_type is nullable: the huntingService API returns only Name +
-- Description on Fields[]; types live in the public markdown docs. We can
-- backfill from raw-md later without a migration.

CREATE TABLE IF NOT EXISTS public.defender_xdr_tables (
  name                    text PRIMARY KEY,
  description             text,
  table_type              text,
  hot_days                int,
  cold_days               int,
  total_interactive_days  int,
  source_type             text,
  has_data                boolean,
  imported_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.defender_xdr_columns (
  table_name   text NOT NULL REFERENCES public.defender_xdr_tables(name) ON DELETE CASCADE,
  column_name  text NOT NULL,
  column_type  text,
  description  text,
  PRIMARY KEY (table_name, column_name)
);

CREATE INDEX IF NOT EXISTS idx_defender_xdr_columns_name
  ON public.defender_xdr_columns(column_name);

-- RLS: schema reference is universal data, read-only for everyone.
-- No write policy — writes go through migrations / service-role only.
ALTER TABLE public.defender_xdr_tables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defender_xdr_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS defender_xdr_tables_read  ON public.defender_xdr_tables;
DROP POLICY IF EXISTS defender_xdr_columns_read ON public.defender_xdr_columns;

CREATE POLICY defender_xdr_tables_read  ON public.defender_xdr_tables  FOR SELECT USING (true);
CREATE POLICY defender_xdr_columns_read ON public.defender_xdr_columns FOR SELECT USING (true);

-- Lookup one table with its columns inline. Tool target.
CREATE OR REPLACE FUNCTION public.lookup_defender_xdr_table(p_table_name text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'name', t.name,
    'description', t.description,
    'table_type', t.table_type,
    'retention', jsonb_build_object(
      'hot_days', t.hot_days,
      'cold_days', t.cold_days,
      'total_interactive_days', t.total_interactive_days
    ),
    'source_type', t.source_type,
    'has_data', t.has_data,
    'columns', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'name', c.column_name,
          'type', c.column_type,
          'description', c.description
        ) ORDER BY c.column_name
      ) FROM public.defender_xdr_columns c WHERE c.table_name = t.name),
      '[]'::jsonb
    )
  )
  FROM public.defender_xdr_tables t
  WHERE lower(t.name) = lower(p_table_name);
$$;

-- List all tables (compact). For the engineer to pick the right one.
CREATE OR REPLACE FUNCTION public.list_defender_xdr_tables()
RETURNS TABLE(name text, description text, has_data boolean, column_count int)
LANGUAGE sql
STABLE
AS $$
  SELECT t.name, t.description, t.has_data,
    (SELECT count(*)::int FROM public.defender_xdr_columns c WHERE c.table_name = t.name) AS column_count
  FROM public.defender_xdr_tables t
  ORDER BY t.name;
$$;

-- Validator helper: returns the list of column names that DON'T exist on a
-- table (the caller passes a list of names extracted from a query and gets
-- back the unknowns). Deterministic, fast.
CREATE OR REPLACE FUNCTION public.validate_defender_xdr_columns(p_table_name text, p_column_names text[])
RETURNS TABLE(unknown_column text)
LANGUAGE sql
STABLE
AS $$
  SELECT n AS unknown_column
  FROM unnest(p_column_names) AS n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.defender_xdr_columns c
    WHERE lower(c.table_name) = lower(p_table_name)
      AND lower(c.column_name) = lower(n)
  );
$$;

COMMENT ON TABLE public.defender_xdr_tables IS
  'Defender XDR Advanced Hunting table metadata. Imported from Microsoft huntingService internal API via Get-DefenderSchema.ps1. Universal reference data — RLS is on, but the read policy is public.';
COMMENT ON TABLE public.defender_xdr_columns IS
  'Defender XDR Advanced Hunting column reference. Used by Detection Engineer (via tool) and QA (via deterministic validator) to prevent KQL field-name hallucinations.';
COMMENT ON FUNCTION public.lookup_defender_xdr_table(text) IS
  'Tool target: returns full table schema as jsonb. Case-insensitive on table name.';
COMMENT ON FUNCTION public.validate_defender_xdr_columns(text, text[]) IS
  'Deterministic validator: given a table name and a list of column names, returns the ones not found. Case-insensitive. Used by QA to flag KQL hallucinations without a model call.';
