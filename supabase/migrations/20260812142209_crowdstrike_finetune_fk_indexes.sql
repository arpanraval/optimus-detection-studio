-- Cover the two parent-side foreign keys used by deletion and run lookup paths.

CREATE INDEX IF NOT EXISTS crowdstrike_finetune_runs_integration_idx
  ON public.crowdstrike_finetune_runs (integration_id);

CREATE INDEX IF NOT EXISTS crowdstrike_finetune_runs_preflight_idx
  ON public.crowdstrike_finetune_runs (preflight_run_id);
