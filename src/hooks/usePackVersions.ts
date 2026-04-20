/**
 * usePackVersions — fetches version history for a pack.
 */

import { useState, useEffect, useCallback } from 'react';
import { getPackVersions, PackVersion } from './useDetectionPacks';

export function usePackVersions(packId: string | null) {
  const [versions, setVersions] = useState<PackVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!packId) {
      setVersions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getPackVersions(packId);
      setVersions(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load versions'));
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { versions, loading, error, refresh };
}

export interface VersionDiff {
  added: string[];   // detection IDs present in newer but not older
  removed: string[]; // detection IDs present in older but not newer
}

/**
 * Compute added/removed detection IDs between two pack version snapshots.
 * `older` is the reference; `newer` is the target (so added = newer minus older).
 *
 * Accepts either full PackVersion objects or any object shape with a `.snapshot`
 * field, so it can also be used to diff a published version against a not-yet-
 * published virtual snapshot built from the current pack's detections.
 */
export function computeVersionDiff(
  older: { snapshot: unknown },
  newer: { snapshot: unknown },
): VersionDiff {
  const extractIds = (snap: unknown): Set<string> => {
    const s = snap as { detections?: { id?: string }[] } | null;
    return new Set((s?.detections ?? []).map(d => d.id).filter((x): x is string => !!x));
  };
  const a = extractIds(older.snapshot);
  const b = extractIds(newer.snapshot);
  return {
    added: [...b].filter(x => !a.has(x)),
    removed: [...a].filter(x => !b.has(x)),
  };
}
