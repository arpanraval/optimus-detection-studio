import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { TargetingIntel } from '@/types/mitre-stix';
import { toError } from '../lib/errors';

export interface Group {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  deprecated: boolean;
  revoked: boolean;
  data: {
    aliases?: string[];
    external_references?: Array<{
      source_name: string;
      url?: string;
      external_id?: string;
      description?: string;
    }>;
    x_mitre_contributors?: string[];
    created?: string;
    modified?: string;
    targeting_intel?: TargetingIntel;
  };
  technique_count: number;
  software_count: number;
  campaign_count: number;
}

export interface GroupFilters {
  search: string;
  sortBy: 'name' | 'technique_count' | 'software_count' | 'modified';
  sortOrder: 'asc' | 'desc';
  // Targeting filters
  originCountries: string[];      // WHERE the actor is FROM (China, Russia, etc.)
  targetCountries: string[];      // WHO they attack (United States, Germany, etc.)
  targetSectors: string[];        // WHAT industries they target
  hasTargetingData: boolean | null;  // null = any, true = only with data, false = only without
}

// Extract unique values from all groups for filter dropdowns
export function extractFilterOptions(groups: Group[]): {
  originCountries: string[];
  targetCountries: string[];
  targetSectors: string[];
} {
  const originCountries = new Set<string>();
  const targetCountries = new Set<string>();
  const targetSectors = new Set<string>();

  for (const group of groups) {
    const targeting = group.data.targeting_intel;
    if (targeting) {
      if (targeting.origin_country) {
        originCountries.add(targeting.origin_country);
      }
      for (const country of targeting.target_countries || []) {
        targetCountries.add(country);
      }
      for (const sector of targeting.target_sectors || []) {
        targetSectors.add(sector);
      }
    }
  }

  return {
    originCountries: Array.from(originCountries).sort(),
    targetCountries: Array.from(targetCountries).sort(),
    targetSectors: Array.from(targetSectors).sort(),
  };
}

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<GroupFilters>({
    search: '',
    sortBy: 'name',
    sortOrder: 'asc',
    originCountries: [],
    targetCountries: [],
    targetSectors: [],
    hasTargetingData: null,
  });

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);
    setError(null);

    try {
      // Use v_mitre_groups_with_stats view for proper counts
      const { data, error: fetchError } = await supabase
        .from('v_mitre_groups_with_stats')
        .select('*')
        .eq('deprecated', false)
        .eq('revoked', false)
        .order('name');

      if (fetchError) throw fetchError;
      setGroups(data || []);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load groups:', err);
    } finally {
      setLoading(false);
    }
  }

  // Client-side filtering and sorting
  const filteredGroups = useMemo(() => {
    let result = [...groups];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(g =>
        g.name.toLowerCase().includes(searchLower) ||
        g.mitre_id?.toLowerCase().includes(searchLower) ||
        g.description?.toLowerCase().includes(searchLower) ||
        g.data.aliases?.some(a => a.toLowerCase().includes(searchLower))
      );
    }

    // Origin country filter
    if (filters.originCountries.length > 0) {
      result = result.filter(g => {
        const origin = g.data.targeting_intel?.origin_country;
        return origin && filters.originCountries.includes(origin);
      });
    }

    // Target country filter
    if (filters.targetCountries.length > 0) {
      result = result.filter(g => {
        const targets = g.data.targeting_intel?.target_countries || [];
        return targets.some(t => filters.targetCountries.includes(t));
      });
    }

    // Target sector filter
    if (filters.targetSectors.length > 0) {
      result = result.filter(g => {
        const sectors = g.data.targeting_intel?.target_sectors || [];
        return sectors.some(s => filters.targetSectors.includes(s));
      });
    }

    // Has targeting data filter
    if (filters.hasTargetingData !== null) {
      result = result.filter(g => {
        const hasData = !!g.data.targeting_intel?.origin_country ||
          (g.data.targeting_intel?.target_countries?.length || 0) > 0;
        return filters.hasTargetingData ? hasData : !hasData;
      });
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
        case 'software_count':
          comparison = (a.software_count || 0) - (b.software_count || 0);
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
  }, [groups, filters]);

  // Extract filter options from all groups
  const filterOptions = useMemo(() => extractFilterOptions(groups), [groups]);

  return {
    groups: filteredGroups,
    allGroups: groups,
    loading,
    error,
    filters,
    setFilters,
    filterOptions,
    refetch: loadGroups
  };
}