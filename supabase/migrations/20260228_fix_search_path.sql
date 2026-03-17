-- Fix search_path for SECURITY DEFINER functions to prevent search_path hijacking
ALTER FUNCTION find_similar_detections SET search_path = public, pg_temp;
ALTER FUNCTION rollback_bulk_import SET search_path = public, pg_temp;
ALTER FUNCTION check_detection_write_permission SET search_path = public, pg_temp;
ALTER FUNCTION update_targeting_intel SET search_path = public, pg_temp;
ALTER FUNCTION remove_targeting_intel SET search_path = public, pg_temp;
