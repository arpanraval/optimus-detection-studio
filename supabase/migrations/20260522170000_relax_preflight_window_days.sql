-- Allow a custom backtest window (any 1–90 days) for SIEM query pre-flight,
-- not just the original 7/14/30 presets.
ALTER TABLE detection_preflight_runs
  DROP CONSTRAINT IF EXISTS detection_preflight_runs_window_days_check;

ALTER TABLE detection_preflight_runs
  ADD CONSTRAINT detection_preflight_runs_window_days_check
  CHECK (window_days BETWEEN 1 AND 90);
