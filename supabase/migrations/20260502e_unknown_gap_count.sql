-- 20260502e_unknown_gap_count.sql
--
-- Add unknown_gap_count to both reports and campaigns. The previous
-- feasibility-enricher counted "no MITRE mapping" / "no recorded data
-- sources" as feasible, which made the UI show 100% feasibility on data
-- it never checked. Splitting unknown into its own bucket lets the UI
-- show "X feasible / Y infeasible / Z unknown" honestly.

ALTER TABLE public.threat_intel_reports
  ADD COLUMN IF NOT EXISTS unknown_gap_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.auto_digest_campaigns
  ADD COLUMN IF NOT EXISTS unknown_gap_count integer NOT NULL DEFAULT 0;
