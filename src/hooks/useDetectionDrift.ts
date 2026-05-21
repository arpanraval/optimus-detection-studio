/**
 * useDetectionDrift — drift state for a single detection (detail-page banner).
 * `canRevert` is true when (a) the pre-sync content is stored
 * (vendor_metadata.previousRawContent) AND (b) the detection hasn't been
 * edited by anyone since the sync — otherwise reverting would silently destroy
 * those follow-up edits.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getDriftForDetection } from '../services/drift/driftService';
import type { DriftRow } from '../services/drift/types';

/** applyUpstream stamps updatedDate ≈ lastSyncedAt; tolerate small clock skew. */
const REVERT_EDIT_GRACE_MS = 5_000;

export function useDetectionDrift(detectionId: string | null) {
  const [drift, setDrift] = useState<DriftRow | null>(null);
  const [canRevert, setCanRevert] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [editedSinceSync, setEditedSinceSync] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!detectionId) {
      setDrift(null);
      setCanRevert(false);
      setLastSyncedAt(null);
      setEditedSinceSync(false);
      return;
    }
    setLoading(true);
    try {
      const [d, detRes] = await Promise.all([
        getDriftForDetection(detectionId),
        supabase.from('detections').select('vendor_metadata, "updatedDate"').eq('id', detectionId).maybeSingle(),
      ]);
      setDrift(d);
      const detRow = (detRes.data ?? {}) as { vendor_metadata?: Record<string, unknown>; updatedDate?: string };
      const vm = (detRow.vendor_metadata ?? {}) as Record<string, unknown>;
      const hasPrev = typeof vm.previousRawContent === 'string' && (vm.previousRawContent as string).length > 0;
      const lastSync = typeof vm.lastSyncedAt === 'string' ? (vm.lastSyncedAt as string) : null;
      const wasEditedAfterSync =
        !!lastSync && !!detRow.updatedDate &&
        new Date(detRow.updatedDate).getTime() - new Date(lastSync).getTime() > REVERT_EDIT_GRACE_MS;
      setLastSyncedAt(lastSync);
      setEditedSinceSync(wasEditedAfterSync);
      setCanRevert(hasPrev && !wasEditedAfterSync);
    } catch (e) {
      console.warn('[useDetectionDrift] failed to load:', e);
    } finally {
      setLoading(false);
    }
  }, [detectionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { drift, canRevert, lastSyncedAt, editedSinceSync, loading, refresh };
}
