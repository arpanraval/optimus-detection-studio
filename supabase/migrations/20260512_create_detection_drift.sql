-- 20260512_create_detection_drift.sql
-- Upstream drift tracking for detections imported from GitHub vendor repos.
--
-- One row per local detection that has a known upstream source. Caches the
-- last-seen upstream content snapshot + hashes so the drift UI renders without
-- a network call, and persists review decisions (kept-mine / dismissed) so a
-- re-check doesn't resurface them. Recomputed by the drift comparator on each
-- "Check for updates" run.
--
-- Refs: src/services/drift/*, src/components/sync/VendorDriftSection, ROUTES.DATA_SYNC.

BEGIN;

CREATE TABLE IF NOT EXISTS public.detection_drift (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id          text NOT NULL REFERENCES public.detections(id) ON DELETE CASCADE,  -- detections.id is text
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- mirrors detections.user_id
  -- Source coordinates (denormalised so a check can group without joining bulk_import_jobs)
  source_url            text NOT NULL,
  source_vendor         text NOT NULL,
  target_library        text NOT NULL,
  external_id           text NOT NULL,
  upstream_path         text,                          -- last-known file path within the repo
  upstream_blob_sha     text,                          -- git blob SHA of that file at last check
  -- Content snapshots / hashes (line-ending / trailing-ws / BOM normalised before hashing)
  baseline_hash         text,                          -- sha256(normalised vendor_metadata.rawContent) at last sync/import
  upstream_hash         text,                          -- sha256(normalised latest upstream raw content)
  upstream_raw_snapshot text,                          -- latest upstream raw content (diff view w/o re-fetch)
  -- Drift state
  drift_state           text NOT NULL DEFAULT 'unknown'
    CHECK (drift_state IN ('unknown','in_sync','upstream_changed','upstream_removed','conflict','dismissed')),
  field_diffs           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- FieldDiff[] when changed / conflict
  -- Review-decision bookkeeping
  last_checked_at       timestamptz,
  resolved_at           timestamptz,
  resolved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution            text CHECK (resolution IN ('accepted','kept_mine','dismissed','reverted')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detection_drift_detection_id_key UNIQUE (detection_id)
);

CREATE INDEX IF NOT EXISTS detection_drift_user_state_idx
  ON public.detection_drift (user_id, drift_state);
CREATE INDEX IF NOT EXISTS detection_drift_source_idx
  ON public.detection_drift (source_url, source_vendor, target_library);
CREATE INDEX IF NOT EXISTS detection_drift_detection_id_idx
  ON public.detection_drift (detection_id);

-- updated_at auto-setter (mirrors the update_<table>_updated_at pattern used elsewhere)
CREATE OR REPLACE FUNCTION public.update_detection_drift_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS detection_drift_updated_at ON public.detection_drift;
CREATE TRIGGER detection_drift_updated_at
  BEFORE UPDATE ON public.detection_drift
  FOR EACH ROW
  EXECUTE FUNCTION public.update_detection_drift_updated_at();

ALTER TABLE public.detection_drift ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone who can see the detection can see its drift row (production
-- detections are visible to all; development to owner; admins/owners see all).
-- Drives read-only drift badges in the library.
DROP POLICY IF EXISTS detection_drift_select ON public.detection_drift;
CREATE POLICY detection_drift_select ON public.detection_drift
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.detections d
      WHERE d.id = detection_drift.detection_id
        AND (d.library_type = 'production' OR d.user_id = auth.uid())
    )
  );

-- WRITE (insert/update/delete): admins/owners only — drift checks and
-- apply/keep/dismiss/revert are admin-gated (matches the Data Sync page).
DROP POLICY IF EXISTS detection_drift_write ON public.detection_drift;
CREATE POLICY detection_drift_write ON public.detection_drift
  FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

COMMIT;
