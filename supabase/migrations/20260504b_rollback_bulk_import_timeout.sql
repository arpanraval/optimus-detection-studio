-- 20260504b_rollback_bulk_import_timeout.sql
-- Raise statement_timeout for rollback_bulk_import only.
--
-- Rollback CASCADE-deletes from detection_embeddings, which has an HNSW
-- pgvector index whose per-row delete cost can push large rollbacks past
-- PostgREST's 2-minute default statement_timeout. This SET clause is
-- function-scoped, so unrelated queries continue to use the global limit.

ALTER FUNCTION public.rollback_bulk_import(uuid, uuid)
  SET statement_timeout = '5min';
