-- Reconcile legacy rows whose completion projection contradicted persisted section errors.
-- Report content, review fields, and legacy processing_stage remain unchanged.
UPDATE public.threat_intel_reports
   SET outcome = 'partial',
       updated_at = now()
 WHERE outcome = 'complete'
   AND section_errors IS NOT NULL
   AND section_errors <> '{}'::jsonb;
