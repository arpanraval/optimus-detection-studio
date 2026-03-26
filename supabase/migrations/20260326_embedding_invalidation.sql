-- Invalidate detection embeddings when text content changes
-- This ensures semantic search stays accurate as detections are edited

CREATE OR REPLACE FUNCTION public.invalidate_detection_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- Only invalidate if text content actually changed
  IF (OLD.name IS DISTINCT FROM NEW.name)
     OR (OLD.description IS DISTINCT FROM NEW.description)
     OR (OLD."detectionQuery" IS DISTINCT FROM NEW."detectionQuery") THEN

    -- Clear the embedding so it gets re-generated on next batch run
    DELETE FROM public.detection_embeddings
    WHERE detection_id = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS invalidate_embedding_on_update ON public.detections;

CREATE TRIGGER invalidate_embedding_on_update
  AFTER UPDATE ON public.detections
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_detection_embedding();

COMMENT ON FUNCTION public.invalidate_detection_embedding() IS
  'Deletes stale embeddings when detection text fields change, triggering re-embedding on next batch run';
