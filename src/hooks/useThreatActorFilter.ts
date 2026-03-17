import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Group, extractFilterOptions } from './useGroups';

export interface SimpleCampaign {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  technique_count: number;
  first_seen: string | null;
  last_seen: string | null;
}

export interface SimpleSoftware {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  software_type: 'malware' | 'tool';
  technique_count: number;
}

export interface ThreatActorFilterState {
  // Multi-select filters
  selectedGroups: Group[];
  selectedOriginCountries: string[];
  selectedTargetCountries: string[];
  selectedTargetSectors: string[];
  selectedCampaigns: SimpleCampaign[];
  selectedSoftware: SimpleSoftware[];
  // Derived
  filteredTechniqueIds: Set<string>;
  matchingGroupCount: number;
  isLoading: boolean;
}

export interface UseThreatActorFilterReturn {
  state: ThreatActorFilterState;
  groups: Group[];
  campaigns: SimpleCampaign[];
  software: SimpleSoftware[];
  // Multi-select actions
  toggleGroup: (group: Group) => void;
  toggleOriginCountry: (country: string) => void;
  toggleTargetCountry: (country: string) => void;
  toggleTargetSector: (sector: string) => void;
  toggleCampaign: (campaign: SimpleCampaign) => void;
  toggleSoftware: (sw: SimpleSoftware) => void;
  clearFilter: () => void;
  applyFilters: () => Promise<void>;
  // State checks
  isActive: boolean;
  activeFilterCount: number;
  // Available options
  availableOriginCountries: CountryInfo[];
  availableTargetCountries: string[];
  availableSectors: string[];
  // Search
  searchGroups: (query: string) => Group[];
  searchCampaigns: (query: string) => SimpleCampaign[];
  searchSoftware: (query: string) => SimpleSoftware[];
  isLoadingGroups: boolean;
  isLoadingCampaigns: boolean;
  isLoadingSoftware: boolean;
}

export interface CountryInfo {
  name: string;
  code: string;
  groupCount: number;
}

// Cache for entity -> technique mappings
const techniqueCache = new Map<string, Set<string>>();

export function useThreatActorFilter(): UseThreatActorFilterReturn {
  const [groups, setGroups] = useState<Group[]>([]);
  const [campaigns, setCampaigns] = useState<SimpleCampaign[]>([]);
  const [software, setSoftware] = useState<SimpleSoftware[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isLoadingSoftware, setIsLoadingSoftware] = useState(true);
  const [state, setState] = useState<ThreatActorFilterState>({
    selectedGroups: [],
    selectedOriginCountries: [],
    selectedTargetCountries: [],
    selectedTargetSectors: [],
    selectedCampaigns: [],
    selectedSoftware: [],
    filteredTechniqueIds: new Set(),
    matchingGroupCount: 0,
    isLoading: false,
  });

  // Load all data on mount
  useEffect(() => {
    loadGroups();
    loadCampaigns();
    loadSoftware();
  }, []);

  async function loadGroups() {
    setIsLoadingGroups(true);
    try {
      const { data, error } = await supabase
        .from('v_mitre_groups_with_stats')
        .select('*')
        .eq('deprecated', false)
        .eq('revoked', false)
        .order('technique_count', { ascending: false });

      if (error) throw error;
      setGroups(data || []);
    } catch (err) {
      console.error('Failed to load groups for filter:', err);
    } finally {
      setIsLoadingGroups(false);
    }
  }

  async function loadCampaigns() {
    setIsLoadingCampaigns(true);
    try {
      // Get campaigns
      const { data: campaignData, error } = await supabase
        .from('mitre_objects')
        .select('id, stix_id, mitre_id, name, data')
        .eq('type', 'campaign')
        .eq('deprecated', false)
        .order('name');

      if (error) throw error;

      // Get technique counts
      const { data: techRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref')
        .eq('relationship_type', 'uses')
        .in('source_ref', (campaignData || []).map((c: any) => c.stix_id));

      const techCountMap = new Map<string, number>();
      (techRels || []).forEach((r: any) => {
        techCountMap.set(r.source_ref, (techCountMap.get(r.source_ref) || 0) + 1);
      });

      const enrichedCampaigns: SimpleCampaign[] = (campaignData || []).map((c: any) => ({
        id: c.id,
        stix_id: c.stix_id,
        mitre_id: c.mitre_id,
        name: c.name,
        technique_count: techCountMap.get(c.stix_id) || 0,
        first_seen: c.data?.first_seen || null,
        last_seen: c.data?.last_seen || null,
      }));

      // Sort by technique count descending
      enrichedCampaigns.sort((a, b) => b.technique_count - a.technique_count);
      setCampaigns(enrichedCampaigns);
    } catch (err) {
      console.error('Failed to load campaigns for filter:', err);
    } finally {
      setIsLoadingCampaigns(false);
    }
  }

  async function loadSoftware() {
    setIsLoadingSoftware(true);
    try {
      const { data, error } = await supabase
        .from('v_mitre_software_with_stats')
        .select('id, stix_id, mitre_id, name, software_type, technique_count')
        .eq('deprecated', false)
        .order('technique_count', { ascending: false });

      if (error) throw error;
      setSoftware(data || []);
    } catch (err) {
      console.error('Failed to load software for filter:', err);
    } finally {
      setIsLoadingSoftware(false);
    }
  }

  // Extract unique origin countries with counts
  const availableOriginCountries = useMemo(() => {
    const countryMap = new Map<string, { name: string; code: string; count: number }>();

    for (const group of groups) {
      const targeting = group.data.targeting_intel;
      if (targeting?.origin_country && targeting?.origin_country_code) {
        const existing = countryMap.get(targeting.origin_country_code);
        if (existing) {
          existing.count++;
        } else {
          countryMap.set(targeting.origin_country_code, {
            name: targeting.origin_country,
            code: targeting.origin_country_code,
            count: 1,
          });
        }
      }
    }

    return Array.from(countryMap.values())
      .sort((a, b) => b.count - a.count)
      .map(c => ({ name: c.name, code: c.code, groupCount: c.count }));
  }, [groups]);

  // Extract unique target countries and sectors
  const { availableTargetCountries, availableSectors } = useMemo(() => {
    const filterOpts = extractFilterOptions(groups);
    return {
      availableTargetCountries: filterOpts.targetCountries,
      availableSectors: filterOpts.targetSectors,
    };
  }, [groups]);

  // Fetch techniques for any entity (group, campaign, software)
  async function fetchTechniquesForEntity(stixId: string): Promise<Set<string>> {
    // Check cache first
    if (techniqueCache.has(stixId)) {
      return techniqueCache.get(stixId)!;
    }

    const { data, error } = await supabase
      .from('mitre_relationships')
      .select('target_ref')
      .eq('source_ref', stixId)
      .eq('relationship_type', 'uses');

    if (error) {
      console.error('Failed to fetch techniques for entity:', error);
      return new Set();
    }

    // Get technique STIX IDs
    const techniqueStixIds = data?.map(r => r.target_ref) || [];

    if (techniqueStixIds.length === 0) {
      techniqueCache.set(stixId, new Set());
      return new Set();
    }

    // Fetch MITRE IDs for techniques
    const { data: techData, error: techError } = await supabase
      .from('mitre_objects')
      .select('mitre_id')
      .in('stix_id', techniqueStixIds)
      .eq('type', 'attack-pattern')
      .eq('deprecated', false);

    if (techError) {
      console.error('Failed to fetch technique details:', techError);
      return new Set();
    }

    const mitreIds = new Set(
      (techData || [])
        .map(t => t.mitre_id)
        .filter((id): id is string => !!id)
    );

    techniqueCache.set(stixId, mitreIds);
    return mitreIds;
  }

  // Get groups matching current filter criteria
  const getMatchingGroups = useCallback((): Group[] => {
    let matching = [...groups];

    // If specific groups are selected, use only those
    if (state.selectedGroups.length > 0) {
      const selectedIds = new Set(state.selectedGroups.map(g => g.id));
      matching = matching.filter(g => selectedIds.has(g.id));
    }

    // Filter by origin country
    if (state.selectedOriginCountries.length > 0) {
      matching = matching.filter(g => {
        const origin = g.data.targeting_intel?.origin_country;
        return origin && state.selectedOriginCountries.includes(origin);
      });
    }

    // Filter by target country
    if (state.selectedTargetCountries.length > 0) {
      matching = matching.filter(g => {
        const targets = g.data.targeting_intel?.target_countries || [];
        return targets.some(t => state.selectedTargetCountries.includes(t));
      });
    }

    // Filter by target sector
    if (state.selectedTargetSectors.length > 0) {
      matching = matching.filter(g => {
        const sectors = g.data.targeting_intel?.target_sectors || [];
        return sectors.some(s => state.selectedTargetSectors.includes(s));
      });
    }

    return matching;
  }, [groups, state.selectedGroups, state.selectedOriginCountries, state.selectedTargetCountries, state.selectedTargetSectors]);

  // Apply filters and fetch techniques
  const applyFilters = useCallback(async () => {
    const hasGroupFilters =
      state.selectedGroups.length > 0 ||
      state.selectedOriginCountries.length > 0 ||
      state.selectedTargetCountries.length > 0 ||
      state.selectedTargetSectors.length > 0;

    const hasCampaignFilters = state.selectedCampaigns.length > 0;
    const hasSoftwareFilters = state.selectedSoftware.length > 0;

    if (!hasGroupFilters && !hasCampaignFilters && !hasSoftwareFilters) {
      setState(prev => ({
        ...prev,
        filteredTechniqueIds: new Set(),
        matchingGroupCount: 0,
        isLoading: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const allTechniques = new Set<string>();
      let matchingGroupCount = 0;

      // Fetch techniques from matching groups
      if (hasGroupFilters) {
        const matchingGroups = getMatchingGroups();
        matchingGroupCount = matchingGroups.length;

        const groupTechniqueSets = await Promise.all(
          matchingGroups.map(g => fetchTechniquesForEntity(g.stix_id))
        );

        for (const set of groupTechniqueSets) {
          for (const id of set) {
            allTechniques.add(id);
          }
        }
      }

      // Fetch techniques from selected campaigns
      if (hasCampaignFilters) {
        const campaignTechniqueSets = await Promise.all(
          state.selectedCampaigns.map(c => fetchTechniquesForEntity(c.stix_id))
        );

        for (const set of campaignTechniqueSets) {
          for (const id of set) {
            allTechniques.add(id);
          }
        }
      }

      // Fetch techniques from selected software
      if (hasSoftwareFilters) {
        const softwareTechniqueSets = await Promise.all(
          state.selectedSoftware.map(s => fetchTechniquesForEntity(s.stix_id))
        );

        for (const set of softwareTechniqueSets) {
          for (const id of set) {
            allTechniques.add(id);
          }
        }
      }

      setState(prev => ({
        ...prev,
        filteredTechniqueIds: allTechniques,
        matchingGroupCount,
        isLoading: false,
      }));
    } catch (err) {
      console.error('Failed to apply filters:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [getMatchingGroups, state.selectedGroups, state.selectedOriginCountries, state.selectedTargetCountries, state.selectedTargetSectors, state.selectedCampaigns, state.selectedSoftware]);

  // Auto-apply filters when selections change
  useEffect(() => {
    applyFilters();
  }, [state.selectedGroups, state.selectedOriginCountries, state.selectedTargetCountries, state.selectedTargetSectors, state.selectedCampaigns, state.selectedSoftware]);

  // Toggle functions for multi-select
  const toggleGroup = useCallback((group: Group) => {
    setState(prev => {
      const exists = prev.selectedGroups.some(g => g.id === group.id);
      return {
        ...prev,
        selectedGroups: exists
          ? prev.selectedGroups.filter(g => g.id !== group.id)
          : [...prev.selectedGroups, group],
      };
    });
  }, []);

  const toggleOriginCountry = useCallback((country: string) => {
    setState(prev => {
      const exists = prev.selectedOriginCountries.includes(country);
      return {
        ...prev,
        selectedOriginCountries: exists
          ? prev.selectedOriginCountries.filter(c => c !== country)
          : [...prev.selectedOriginCountries, country],
      };
    });
  }, []);

  const toggleTargetCountry = useCallback((country: string) => {
    setState(prev => {
      const exists = prev.selectedTargetCountries.includes(country);
      return {
        ...prev,
        selectedTargetCountries: exists
          ? prev.selectedTargetCountries.filter(c => c !== country)
          : [...prev.selectedTargetCountries, country],
      };
    });
  }, []);

  const toggleTargetSector = useCallback((sector: string) => {
    setState(prev => {
      const exists = prev.selectedTargetSectors.includes(sector);
      return {
        ...prev,
        selectedTargetSectors: exists
          ? prev.selectedTargetSectors.filter(s => s !== sector)
          : [...prev.selectedTargetSectors, sector],
      };
    });
  }, []);

  const toggleCampaign = useCallback((campaign: SimpleCampaign) => {
    setState(prev => {
      const exists = prev.selectedCampaigns.some(c => c.id === campaign.id);
      return {
        ...prev,
        selectedCampaigns: exists
          ? prev.selectedCampaigns.filter(c => c.id !== campaign.id)
          : [...prev.selectedCampaigns, campaign],
      };
    });
  }, []);

  const toggleSoftware = useCallback((sw: SimpleSoftware) => {
    setState(prev => {
      const exists = prev.selectedSoftware.some(s => s.id === sw.id);
      return {
        ...prev,
        selectedSoftware: exists
          ? prev.selectedSoftware.filter(s => s.id !== sw.id)
          : [...prev.selectedSoftware, sw],
      };
    });
  }, []);

  // Clear all filters
  const clearFilter = useCallback(() => {
    setState({
      selectedGroups: [],
      selectedOriginCountries: [],
      selectedTargetCountries: [],
      selectedTargetSectors: [],
      selectedCampaigns: [],
      selectedSoftware: [],
      filteredTechniqueIds: new Set(),
      matchingGroupCount: 0,
      isLoading: false,
    });
  }, []);

  // Search functions
  const searchGroups = useCallback((query: string): Group[] => {
    if (!query.trim()) return groups.slice(0, 50);

    const searchLower = query.toLowerCase();
    return groups.filter(g => {
      if (g.name.toLowerCase().includes(searchLower)) return true;
      if (g.mitre_id?.toLowerCase().includes(searchLower)) return true;
      if (g.data.aliases?.some(a => a.toLowerCase().includes(searchLower))) return true;
      const vendorNames = g.data.targeting_intel?.vendor_names;
      if (vendorNames) {
        if (vendorNames.microsoft?.toLowerCase().includes(searchLower)) return true;
        if (vendorNames.crowdstrike?.toLowerCase().includes(searchLower)) return true;
      }
      if (g.data.targeting_intel?.origin_country?.toLowerCase().includes(searchLower)) return true;
      return false;
    }).slice(0, 50);
  }, [groups]);

  const searchCampaigns = useCallback((query: string): SimpleCampaign[] => {
    if (!query.trim()) return campaigns.slice(0, 50);

    const searchLower = query.toLowerCase();
    return campaigns.filter(c => {
      if (c.name.toLowerCase().includes(searchLower)) return true;
      if (c.mitre_id?.toLowerCase().includes(searchLower)) return true;
      return false;
    }).slice(0, 50);
  }, [campaigns]);

  const searchSoftware = useCallback((query: string): SimpleSoftware[] => {
    if (!query.trim()) return software.slice(0, 50);

    const searchLower = query.toLowerCase();
    return software.filter(s => {
      if (s.name.toLowerCase().includes(searchLower)) return true;
      if (s.mitre_id?.toLowerCase().includes(searchLower)) return true;
      if (s.software_type.toLowerCase().includes(searchLower)) return true;
      return false;
    }).slice(0, 50);
  }, [software]);

  // Computed values
  const isActive =
    state.selectedGroups.length > 0 ||
    state.selectedOriginCountries.length > 0 ||
    state.selectedTargetCountries.length > 0 ||
    state.selectedTargetSectors.length > 0 ||
    state.selectedCampaigns.length > 0 ||
    state.selectedSoftware.length > 0;

  const activeFilterCount =
    state.selectedGroups.length +
    state.selectedOriginCountries.length +
    state.selectedTargetCountries.length +
    state.selectedTargetSectors.length +
    state.selectedCampaigns.length +
    state.selectedSoftware.length;

  return {
    state,
    groups,
    campaigns,
    software,
    toggleGroup,
    toggleOriginCountry,
    toggleTargetCountry,
    toggleTargetSector,
    toggleCampaign,
    toggleSoftware,
    clearFilter,
    applyFilters,
    isActive,
    activeFilterCount,
    availableOriginCountries,
    availableTargetCountries,
    availableSectors,
    searchGroups,
    searchCampaigns,
    searchSoftware,
    isLoadingGroups,
    isLoadingCampaigns,
    isLoadingSoftware,
  };
}
