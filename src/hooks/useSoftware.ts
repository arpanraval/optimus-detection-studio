import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toError } from '../lib/errors';

export interface Software {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  software_type: 'malware' | 'tool';
  deprecated: boolean;
  revoked: boolean;
  data: {
    aliases?: string[];
    x_mitre_platforms?: string[];
    external_references?: Array<{
      source_name: string;
      url?: string;
      external_id?: string;
      description?: string;
    }>;
    x_mitre_contributors?: string[];
    created?: string;
    modified?: string;
  };
  technique_count: number;
  group_count: number;
}

export interface SoftwareFilters {
  search: string;
  type: 'all' | 'malware' | 'tool';
  sortBy: 'name' | 'technique_count' | 'group_count' | 'modified';
  sortOrder: 'asc' | 'desc';
}

export function useSoftware() {
  const [software, setSoftware] = useState<Software[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<SoftwareFilters>({
    search: '',
    type: 'all',
    sortBy: 'name',
    sortOrder: 'asc'
  });

  useEffect(() => {
    loadSoftware();
  }, []);

  async function loadSoftware() {
    setLoading(true);
    setError(null);

    try {
      // Use v_mitre_software_with_stats view for proper counts
      const { data, error: fetchError } = await supabase
        .from('v_mitre_software_with_stats')
        .select('*')
        .eq('deprecated', false)
        .order('name');

      if (fetchError) throw fetchError;
      setSoftware(data || []);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load software:', err);
    } finally {
      setLoading(false);
    }
  }

  // Client-side filtering and sorting
  const filteredSoftware = useMemo(() => {
    let result = [...software];

    // Type filter
    if (filters.type !== 'all') {
      result = result.filter(s => s.software_type === filters.type);
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(searchLower) ||
        s.mitre_id?.toLowerCase().includes(searchLower) ||
        s.description?.toLowerCase().includes(searchLower) ||
        s.data.aliases?.some(a => a.toLowerCase().includes(searchLower))
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
        case 'group_count':
          comparison = (a.group_count || 0) - (b.group_count || 0);
          break;
        case 'modified': {
          const aTime = new Date(a.data.modified || 0).getTime();
          const bTime = new Date(b.data.modified || 0).getTime();
          comparison = aTime - bTime;
          break;
        }
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [software, filters]);

  // Stats
  const stats = useMemo(() => ({
    total: software.length,
    malware: software.filter(s => s.software_type === 'malware').length,
    tools: software.filter(s => s.software_type === 'tool').length
  }), [software]);

  return {
    software: filteredSoftware,
    allSoftware: software,
    loading,
    error,
    filters,
    setFilters,
    stats,
    refetch: loadSoftware
  };
}