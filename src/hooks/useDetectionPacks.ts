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

      // For each pack, count actual detections from pack_detections
      const packsWithCounts = await Promise.all(
        (data || []).map(async (pack) => {
          const { count } = await supabase
            .from('pack_detections')
            .select('*', { count: 'exact', head: true })
            .eq('pack_id', pack.id);
          
          return {
            ...pack,
            rule_count: count || 0,
          };
        })
      );

      setPacks(packsWithCounts);
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

      // Fetch pack detections via junction table
      const { data: packDetections, error: pdError } = await supabase
        .from('pack_detections')
        .select('detection_id')
        .eq('pack_id', packId);

      if (pdError) throw pdError;

      const detectionIds = packDetections?.map(pd => pd.detection_id) || [];

      let detections: Detection[] = [];
      
      if (detectionIds.length > 0) {
        const { data: detectionsData, error: detError } = await supabase
          .from('detections')
          .select('*')
          .in('id', detectionIds);

        if (detError) throw detError;
        detections = detectionsData || [];
      }

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
  // First delete all pack_detections entries
  const { error: pdError } = await supabase
    .from('pack_detections')
    .delete()
    .eq('pack_id', packId);

  if (pdError) throw pdError;

  // Then delete the pack itself
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
  // Fetch all detections in pack
  const { data: packDetections } = await supabase
    .from('pack_detections')
    .select('detection_id')
    .eq('pack_id', packId);

  if (!packDetections || packDetections.length === 0) {
    await supabase
      .from('detection_packs')
      .update({ mitre_technique_ids: [], rule_count: 0 })
      .eq('id', packId);
    return;
  }

  const detectionIds = packDetections.map(pd => pd.detection_id);

  const { data: detections } = await supabase
    .from('detections')
    .select('mitreAttackIds')
    .in('id', detectionIds);

  const allTechniques = new Set<string>();
  (detections || []).forEach(d => {
    (d.mitreAttackIds || []).forEach((id: string) => allTechniques.add(id));
  });

  await supabase
    .from('detection_packs')
    .update({
      mitre_technique_ids: Array.from(allTechniques),
      rule_count: detectionIds.length,
    })
    .eq('id', packId);
};
