import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { escapePostgrestFilter } from '../lib/sanitize';
import { DetectionPack, Detection } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface PackWithDetections extends DetectionPack {
  detections: Detection[];
  detection_count: number;
  technique_count: number;
}

export interface PackFilters {
  search: string;
  source: string;
  platform: string;
  sortBy: 'name' | 'rule_count' | 'created_at' | 'updated_at';
  sortOrder: 'asc' | 'desc';
}

// =============================================================================
// HOOK: useDetectionPacks
// =============================================================================

export const useDetectionPacks = () => {
  const [packs, setPacks] = useState<DetectionPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<PackFilters>({
    search: '',
    source: '',
    platform: '',
    sortBy: 'name',
    sortOrder: 'asc',
  });

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('detection_packs')
        .select('*')
        .eq('is_active', true);

      // Apply search filter
      if (filters.search) {
        const esc = escapePostgrestFilter(filters.search);
        query = query.or(`name.ilike.%${esc}%,description.ilike.%${esc}%`);
      }

      // Apply source filter
      if (filters.source) {
        query = query.eq('source', filters.source);
      }

      // Apply platform filter
      if (filters.platform) {
        query = query.contains('platforms', [filters.platform]);
      }

      // Apply sorting
      const VALID_SORT_COLUMNS = ['name', 'rule_count', 'created_at', 'updated_at'] as const;
      const safeSortBy = (VALID_SORT_COLUMNS as readonly string[]).includes(filters.sortBy) ? filters.sortBy : 'created_at';
      query = query.order(safeSortBy, { ascending: filters.sortOrder === 'asc' });

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setPacks(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch packs'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  return {
    packs,
    loading,
    error,
    filters,
    setFilters,
    refetch: fetchPacks,
  };
};

// =============================================================================
// HOOK: usePackDetail
// =============================================================================

export const usePackDetail = (packId: string) => {
  const [pack, setPack] = useState<PackWithDetections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPackDetail = useCallback(async () => {
    if (!packId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch pack metadata
      const { data: packData, error: packError } = await supabase
        .from('detection_packs')
        .select('*')
        .eq('id', packId)
        .single();

      if (packError) throw packError;

      // Fetch pack detections via junction table with nested select
      const { data: packDetections, error: pdError } = await supabase
        .from('pack_detections')
        .select('detection_id, detections(*)')
        .eq('pack_id', packId);

      if (pdError) throw pdError;

      const detections: Detection[] = (packDetections || [])
        .map(pd => pd.detections as unknown as Detection)
        .filter(Boolean);

      // Compute technique count
      const allTechniques = new Set<string>();
      detections.forEach(d => {
        (d.mitreAttackIds || []).forEach(id => allTechniques.add(id));
      });

      const packWithDetections: PackWithDetections = {
        ...packData,
        detections,
        detection_count: detections.length,
        technique_count: allTechniques.size,
      };

      setPack(packWithDetections);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch pack details'));
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    fetchPackDetail();
  }, [fetchPackDetail]);

  return {
    pack,
    loading,
    error,
    refetch: fetchPackDetail,
  };
};

// =============================================================================
// PACK OPERATIONS
// =============================================================================

export const createPack = async (pack: Partial<DetectionPack>): Promise<DetectionPack> => {
  const { data: user } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('detection_packs')
    .insert({
      name: pack.name,
      description: pack.description || null,
      icon: pack.icon || '📦',
      tags: pack.tags || [],
      platforms: pack.platforms || [],
      source: pack.source || 'custom',
      is_active: true,
      created_by: user?.user?.id || null,
      mitre_technique_ids: [],
      rule_count: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updatePack = async (packId: string, updates: Partial<DetectionPack>): Promise<DetectionPack> => {
  const { data, error } = await supabase
    .from('detection_packs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deletePack = async (packId: string): Promise<void> => {
  const { error } = await supabase
    .from('detection_packs')
    .delete()
    .eq('id', packId);

  if (error) throw error;
};

export const addDetectionsToPack = async (packId: string, detectionIds: string[]): Promise<void> => {
  if (detectionIds.length === 0) return;

  const records = detectionIds.map(detectionId => ({
    pack_id: packId,
    detection_id: detectionId,
  }));

  const { error } = await supabase
    .from('pack_detections')
    .upsert(records, { onConflict: 'pack_id,detection_id' });

  if (error) throw error;

  // Update MITRE technique IDs on pack
  await updatePackMitreTechniques(packId);
};

export const removeDetectionFromPack = async (packId: string, detectionId: string): Promise<void> => {
  const { error } = await supabase
    .from('pack_detections')
    .delete()
    .eq('pack_id', packId)
    .eq('detection_id', detectionId);

  if (error) throw error;

  // Update MITRE technique IDs on pack
  await updatePackMitreTechniques(packId);
};

export const updatePackMitreTechniques = async (packId: string): Promise<void> => {
  try {
    // Fetch all detections in pack
    const { data: packDetections, error: pdError } = await supabase
      .from('pack_detections')
      .select('detection_id')
      .eq('pack_id', packId);

    if (pdError) throw pdError;

    if (!packDetections || packDetections.length === 0) {
      const { error: updateError } = await supabase
        .from('detection_packs')
        .update({ mitre_technique_ids: [], rule_count: 0 })
        .eq('id', packId);
      if (updateError) throw updateError;
      return;
    }

    const detectionIds = packDetections.map(pd => pd.detection_id);

    const { data: detections, error: detError } = await supabase
      .from('detections')
      .select('mitreAttackIds')
      .in('id', detectionIds);

    if (detError) throw detError;

    const allTechniques = new Set<string>();
    (detections || []).forEach(d => {
      (d.mitreAttackIds || []).forEach((id: string) => allTechniques.add(id));
    });

    const { error: finalUpdateError } = await supabase
      .from('detection_packs')
      .update({
        mitre_technique_ids: Array.from(allTechniques),
        rule_count: detectionIds.length,
      })
      .eq('id', packId);

    if (finalUpdateError) throw finalUpdateError;
  } catch (err) {
    console.error('Failed to update pack MITRE techniques:', err);
    throw err instanceof Error ? err : new Error('Failed to update pack MITRE techniques');
  }
};

// =============================================================================
// PACK VERSIONING
// =============================================================================

export interface PackVersion {
  id: string;
  pack_id: string | null;
  pack_name: string;
  version_number: number;
  label: string | null;
  notes: string | null;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

/**
 * Create an immutable snapshot of a pack at its current state.
 *
 * Implementation: calls the publish_pack_version Postgres function which uses
 * pg_advisory_xact_lock to serialize concurrent publishes on the same pack,
 * eliminating the MAX(version_number) TOCTOU race. The RPC returns the newly
 * inserted pack_versions row.
 */
export const publishPackVersion = async (
  packId: string,
  label?: string,
  notes?: string
): Promise<PackVersion> => {
  const { data, error } = await supabase.rpc('publish_pack_version', {
    p_pack_id: packId,
    p_label: label ?? null,
    p_notes: notes ?? null,
  });

  if (error) throw error;
  if (!data) throw new Error('publish_pack_version returned no row');

  return data as PackVersion;
};

/**
 * Rollback a pack to a specific version. Replaces current detection list with
 * detection IDs from that version's snapshot.
 *
 * Implementation: calls the rollback_pack_to_version Postgres function which
 * runs pre-rollback snapshot + delete + re-insert atomically in one transaction.
 * Partial failure leaves the pack untouched instead of empty. Missing detections
 * (deleted since the snapshot was taken) are silently skipped.
 */
export const rollbackToVersion = async (packId: string, versionId: string): Promise<void> => {
  const { error } = await supabase.rpc('rollback_pack_to_version', {
    p_pack_id: packId,
    p_version_id: versionId,
  });

  if (error) throw error;

  // RPC handles pack_detections but not mitre_technique_ids aggregate.
  // The trigger that syncs MITRE IDs only fires on detection.mitreAttackIds
  // changes, not pack_detections membership changes, so recompute manually.
  await updatePackMitreTechniques(packId);
};

/**
 * Fetch all versions for a pack, ordered newest first.
 */
export const getPackVersions = async (packId: string): Promise<PackVersion[]> => {
  const { data, error } = await supabase
    .from('pack_versions')
    .select('*')
    .eq('pack_id', packId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data || []) as PackVersion[];
};

// =============================================================================
// PACK EXPORT
// =============================================================================

/**
 * Export a pack as a JSON bundle containing pack metadata and all detection definitions.
 * Returns a filename + downloadable Blob.
 */
export const exportPack = async (packId: string): Promise<{ filename: string; blob: Blob }> => {
  const { data: pack, error: packError } = await supabase
    .from('detection_packs')
    .select('*')
    .eq('id', packId)
    .single();

  if (packError) throw packError;

  const { data: junctionData, error: junctionError } = await supabase
    .from('pack_detections')
    .select('detections(*)')
    .eq('pack_id', packId);

  if (junctionError) throw junctionError;

  const detections = (junctionData || [])
    .map((row: { detections: unknown }) => row.detections)
    .filter(Boolean);

  const bundle = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    pack: {
      name: pack.name,
      description: pack.description,
      icon: pack.icon,
      tags: pack.tags,
      platforms: pack.platforms,
      source: pack.source,
      pack_type: pack.pack_type,
    },
    detections,
  };

  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const safeName = pack.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${safeName}_pack_${new Date().toISOString().split('T')[0]}.json`;

  return { filename, blob };
};
