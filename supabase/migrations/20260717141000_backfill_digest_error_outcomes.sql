-- Correct legacy run projections without changing result summaries, reports,
-- article records, or analyst-owned fields.
UPDATE public.auto_digest_jobs
   SET status = 'partial',
       outcome = 'partial'
 WHERE status = 'completed'
   AND outcome = 'complete'
   AND jsonb_array_length(COALESCE(result_summary->'errors', '[]'::jsonb)) > 0;
