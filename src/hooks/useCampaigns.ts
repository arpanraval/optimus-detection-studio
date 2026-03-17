
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toError } from '../lib/errors';

export interface Campaign {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  deprecated: boolean;
  revoked: boolean;
  first_seen: string | null;
  last_seen: string | null;
  data: {
    aliases?: string[];
    first_seen?: string;
    last_seen?: string;
    external_references?: Array<{
      source_name: string;
      url?: string;
      description?: string;
    }>;
    created?: string;
    modified?: string;
  };
  // Computed from relationships
  technique_count?: number;
  software_count?: number;
  attributed_group?: {
    stix_id: string;
    mitre_id: string;
    name: string;
  } | null;
}

export interface CampaignFilters {
  search: string;
  sortBy: 'name' | 'first_seen' | 'last_seen' | 'modified';
  sortOrder: 'asc' | 'desc';
  hasGroup: 'all' | 'yes' | 'no'; // Filter by attribution
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<CampaignFilters>({
    search: '',
    sortBy: 'last_seen',
    sortOrder: 'desc',
    hasGroup: 'all'
  });

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    setLoading(true);
    setError(null);

    try {
      // Get all campaigns
      const { data: campaignData, error: fetchError } = await supabase
        .from('mitre_objects')
        .select('*')
        .eq('type', 'campaign')
        .eq('deprecated', false)
        .order('name');

      if (fetchError) throw fetchError;

      // Get attribution relationships (campaign attributed-to group)
      const { data: attributions } = await supabase
        .from('mitre_relationships')
        .select('source_ref, target_ref')
        .eq('relationship_type', 'attributed-to');

      // Get groups for attribution lookup
      const { data: groups } = await supabase
        .from('mitre_objects')
        .select('stix_id, mitre_id, name')
        .eq('type', 'intrusion-set');

      // Create group lookup map
      const groupMap = new Map(
        (groups || []).map((g: any) => [g.stix_id, g])
      );

      // Create attribution lookup (campaign -> group)
      const attributionMap = new Map(
        (attributions || []).map((a: any) => [a.source_ref, a.target_ref])
      );

      // Get technique counts per campaign (filter to attack-pattern targets only)
      const { data: techRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref, target_ref')
        .eq('relationship_type', 'uses')
        .like('target_ref', 'attack-pattern--%')
        .in('source_ref', (campaignData || []).map((c: any) => c.stix_id));

      const techCountMap = new Map<string, number>();
      (techRels || []).forEach((r: any) => {
        techCountMap.set(r.source_ref, (techCountMap.get(r.source_ref) || 0) + 1);
      });

      // Enrich campaigns with attribution and counts
      const enrichedCampaigns = (campaignData || []).map((c: any) => {
        const groupStixId = attributionMap.get(c.stix_id);
        const group: any = groupStixId ? groupMap.get(groupStixId) : null;

        return {
          ...c,
          first_seen: c.data?.first_seen || null,
          last_seen: c.data?.last_seen || null,
          technique_count: techCountMap.get(c.stix_id) || 0,
          attributed_group: group ? {
            stix_id: group.stix_id,
            mitre_id: group.mitre_id,
            name: group.name
          } : null
        };
      });

      setCampaigns(enrichedCampaigns);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  }

  // Client-side filtering and sorting
  const filteredCampaigns = useMemo(() => {
    let result = [...campaigns];

    // Filter by group attribution
    if (filters.hasGroup === 'yes') {
      result = result.filter(c => c.attributed_group !== null);
    } else if (filters.hasGroup === 'no') {
      result = result.filter(c => c.attributed_group === null);
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        c.mitre_id?.toLowerCase().includes(searchLower) ||
        c.description?.toLowerCase().includes(searchLower) ||
        c.data.aliases?.some(a => a.toLowerCase().includes(searchLower)) ||
        c.attributed_group?.name.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'first_seen':
          const aFirst = a.first_seen ? new Date(a.first_seen).getTime() : 0;
          const bFirst = b.first_seen ? new Date(b.first_seen).getTime() : 0;
          comparison = aFirst - bFirst;
          break;
        case 'last_seen':
          const aLast = a.last_seen ? new Date(a.last_seen).getTime() : 0;
          const bLast = b.last_seen ? new Date(b.last_seen).getTime() : 0;
          comparison = aLast - bLast;
          break;
        case 'modified':
          const aTime = new Date(a.data.modified || 0).getTime();
          const bTime = new Date(b.data.modified || 0).getTime();
          comparison = aTime - bTime;
          break;
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [campaigns, filters]);

  // Stats
  const stats = useMemo(() => ({
    total: campaigns.length,
    withAttribution: campaigns.filter(c => c.attributed_group !== null).length,
    active: campaigns.filter(c => {
      if (!c.last_seen) return false;
      const lastSeen = new Date(c.last_seen);
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      return lastSeen > twoYearsAgo;
    }).length
  }), [campaigns]);

  return {
    campaigns: filteredCampaigns,
    allCampaigns: campaigns,
    loading,
    error,
    filters,
    setFilters,
    stats,
    refetch: loadCampaigns
  };
}