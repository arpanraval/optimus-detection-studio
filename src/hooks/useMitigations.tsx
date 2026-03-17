import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toError } from '../lib/errors';

export interface Mitigation {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  deprecated: boolean;
  revoked: boolean;
  data: {
    external_references?: Array<{
      source_name: string;
      url?: string;
      external_id?: string;
      description?: string;
    }>;
    x_mitre_version?: string;
    created?: string;
    modified?: string;
  };
  created: string;
  modified: string;
  technique_count: number;
  impact_score?: number; // From v_mitigation_impact
}

export interface MitigationFilters {
  search: string;
  sortBy: 'name' | 'technique_count' | 'modified' | 'impact_score';
  sortOrder: 'asc' | 'desc';
}

export function useMitigations() {
  const [mitigations, setMitigations] = useState<Mitigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<MitigationFilters>({
    search: '',
    sortBy: 'impact_score',
    sortOrder: 'desc'
  });

  useEffect(() => {
    loadMitigations();
  }, []);

  async function loadMitigations() {
    setLoading(true);
    setError(null);

    try {
      // Fetch mitigations
      const { data: mitData, error: mitError } = await supabase
        .from('v_mitre_mitigations')
        .select('*')
        .order('name');

      if (mitError) throw mitError;

      // Fetch impact scores
      const { data: impactData, error: impactError } = await supabase
        .from('v_mitigation_impact')
        .select('stix_id, impact_score');

      // Create impact score map
      const impactMap = new Map<string, number>();
      if (!impactError && impactData) {
        impactData.forEach(item => impactMap.set(item.stix_id, item.impact_score));
      }

      // Merge impact scores into mitigations
      const mitigationsWithImpact = (mitData || []).map(m => ({
        ...m,
        impact_score: impactMap.get(m.stix_id) || 0
      }));

      setMitigations(mitigationsWithImpact);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load mitigations:', err);
    } finally {
      setLoading(false);
    }
  }

  // Client-side filtering and sorting
  const filteredMitigations = useMemo(() => {
    let result = [...mitigations];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(searchLower) ||
        m.mitre_id?.toLowerCase().includes(searchLower) ||
        m.description?.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'technique_count':
          comparison = (a.technique_count || 0) - (b.technique_count || 0);
          break;
        case 'impact_score':
          comparison = (a.impact_score || 0) - (b.impact_score || 0);
          break;
        case 'modified':
          const aTime = new Date(a.modified || 0).getTime();
          const bTime = new Date(b.modified || 0).getTime();
          comparison = aTime - bTime;
          break;
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [mitigations, filters]);

  // Stats
  const stats = useMemo(() => ({
    total: mitigations.length,
    totalTechniques: new Set(
      mitigations.flatMap(m => {
        // We don't have direct technique list here, but we can show total mappings
        return [];
      })
    ).size,
    avgTechniquesPerMitigation: mitigations.length > 0 
      ? Math.round(mitigations.reduce((sum, m) => sum + m.technique_count, 0) / mitigations.length)
      : 0
  }), [mitigations]);

  return {
    mitigations: filteredMitigations,
    allMitigations: mitigations,
    loading,
    error,
    filters,
    setFilters,
    stats,
    refetch: loadMitigations
  };
}

// Hook to get mitigation details with techniques
export function useMitigationDetail(mitigationStixId: string | null) {
  const [mitigation, setMitigation] = useState<Mitigation | null>(null);
  const [techniques, setTechniques] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (mitigationStixId) {
      loadMitigationDetail(mitigationStixId);
    } else {
      setMitigation(null);
      setTechniques([]);
    }
  }, [mitigationStixId]);

  async function loadMitigationDetail(stixId: string) {
    setLoading(true);
    setError(null);

    try {
      // Get mitigation details
      const { data: mitData, error: mitError } = await supabase
        .from('v_mitre_mitigations')
        .select('*')
        .eq('stix_id', stixId)
        .single();

      if (mitError) throw mitError;
      setMitigation(mitData);

      // Get techniques this mitigation addresses
      const { data: techData, error: techError } = await supabase
        .rpc('get_mitigation_techniques', { p_mitigation_stix_id: stixId });

      if (techError) throw techError;
      setTechniques(techData || []);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load mitigation detail:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    mitigation,
    techniques,
    loading,
    error,
    refetch: () => mitigationStixId && loadMitigationDetail(mitigationStixId)
  };
}
