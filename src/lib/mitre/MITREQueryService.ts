
/**
 * MITRE ATT&CK Query Service
 * Provides high-level query methods for MITRE data
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  TechniqueDetails,
  GroupDetails,
  SoftwareDetails,
  CampaignDetails,
  CoverageAnalysis,
  IntrusionSet,
  Malware,
  Tool,
  Campaign,
  MitreObject
} from '@/types/mitre-stix';

export class MITREQueryService {
  constructor(private supabase: SupabaseClient) {}

  // ==========================================================================
  // TECHNIQUE QUERIES
  // ==========================================================================

  /**
   * Get complete technique details with all relationships
   */
  async getTechniqueDetails(mitreId: string): Promise<TechniqueDetails | null> {
    const { data: technique, error } = await this.supabase
      .from('v_mitre_techniques_full')
      .select('*')
      .eq('mitre_id', mitreId)
      .single();
    
    if (error || !technique) return null;

    // Fetch mitigations, relationships, and sub-technique rels in parallel
    const [
      { data: mitigations },
      { data: usesRels },
      { data: subTechRels }
    ] = await Promise.all([
      this.supabase.rpc('get_technique_mitigations', { technique_stix_id: technique.stix_id }),
      this.supabase
        .from('mitre_relationships')
        .select('source_ref, description')
        .eq('target_ref', technique.stix_id)
        .eq('relationship_type', 'uses'),
      this.supabase
        .from('mitre_relationships')
        .select('source_ref')
        .eq('target_ref', technique.stix_id)
        .eq('relationship_type', 'subtechnique-of')
    ]);

    const allSourceIds = usesRels?.map((r: any) => r.source_ref) || [];
    const subTechStixIds = subTechRels?.map((r: any) => r.source_ref) || [];

    // Fetch groups, software, and sub-techniques in parallel
    const [
      { data: groups },
      { data: software },
      { data: subTechniques }
    ] = await Promise.all([
      this.supabase
        .from('mitre_objects')
        .select('*')
        .in('stix_id', allSourceIds.length ? allSourceIds : ['__none__'])
        .eq('type', 'intrusion-set'),
      this.supabase
        .from('mitre_objects')
        .select('*')
        .in('stix_id', allSourceIds.length ? allSourceIds : ['__none__'])
        .in('type', ['malware', 'tool']),
      this.supabase
        .from('mitre_objects')
        .select('*')
        .in('stix_id', subTechStixIds.length ? subTechStixIds : ['__none__'])
    ]);

    return {
      ...technique,
      mitigations: mitigations || [],
      groups: groups || [],
      software: software || [],
      sub_techniques: subTechniques || []
    };
  }

  /**
   * Get all techniques (Fetched once, filtered client-side for performance)
   */
  async getAllTechniques(): Promise<(MitreObject & { platforms: string[] })[]> {
    // We fetch everything and let the UI handle filtering.
    // This avoids complex database queries and provides instant UI feedback.
    const { data, error } = await this.supabase
      .from('v_mitre_techniques_full')
      .select('*')
      .eq('deprecated', false);
    
    if (error) {
      console.error('Error fetching techniques:', error);
      return [];
    }

    return data || [];
  }

  // ==========================================================================
  // GROUP QUERIES
  // ==========================================================================

  /**
   * Get complete group details with all relationships
   */
  async getGroupDetails(mitreId: string): Promise<GroupDetails | null> {
    const { data: group, error } = await this.supabase
      .from('v_mitre_groups_with_stats')
      .select('*')
      .eq('mitre_id', mitreId)
      .single();
    
    if (error || !group) return null;

    // Fetch techniques, software rels, and campaign rels in parallel
    const [
      { data: techniques },
      { data: softwareRels },
      { data: campaignRels }
    ] = await Promise.all([
      this.supabase.rpc('get_group_techniques', { group_stix_id: group.stix_id }),
      this.supabase
        .from('mitre_relationships')
        .select('target_ref')
        .eq('source_ref', group.stix_id)
        .eq('relationship_type', 'uses'),
      this.supabase
        .from('mitre_relationships')
        .select('source_ref')
        .eq('target_ref', group.stix_id)
        .eq('relationship_type', 'attributed-to')
    ]);

    const softwareStixIds = softwareRels?.map((r: any) => r.target_ref) || [];
    const campaignStixIds = campaignRels?.map((r: any) => r.source_ref) || [];

    // Fetch software and campaigns in parallel
    const [
      { data: software },
      { data: campaigns }
    ] = await Promise.all([
      this.supabase
        .from('mitre_objects')
        .select('*')
        .in('stix_id', softwareStixIds.length ? softwareStixIds : ['__none__'])
        .in('type', ['malware', 'tool']),
      this.supabase
        .from('mitre_objects')
        .select('*')
        .in('stix_id', campaignStixIds.length ? campaignStixIds : ['__none__'])
    ]);

    const aliases = (group.data as any)?.aliases || [];

    return {
      ...group,
      techniques: techniques || [],
      software: software || [],
      campaigns: campaigns || [],
      aliases
    };
  }

  /**
   * Get all groups
   */
  async getAllGroups(): Promise<IntrusionSet[]> {
    const { data } = await this.supabase
      .from('v_mitre_groups_with_stats')
      .select('*')
      .eq('deprecated', false)
      .order('name');
    
    return data || [];
  }

  // ==========================================================================
  // SOFTWARE QUERIES
  // ==========================================================================

  /**
   * Get complete software details
   */
  async getSoftwareDetails(mitreId: string): Promise<SoftwareDetails | null> {
    const { data: software, error } = await this.supabase
      .from('v_mitre_software_with_stats')
      .select('*')
      .eq('mitre_id', mitreId)
      .single();
    
    if (error || !software) return null;
    
    // Get techniques implemented by this software
    const { data: techRels } = await this.supabase
      .from('mitre_relationships')
      .select('target_ref')
      .eq('source_ref', software.stix_id)
      .eq('relationship_type', 'uses');
    
    const techStixIds = techRels?.map((r: any) => r.target_ref) || [];
    const { data: techniques } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .in('stix_id', techStixIds);
    
    // Get groups using this software
    const { data: groupRels } = await this.supabase
      .from('mitre_relationships')
      .select('source_ref')
      .eq('target_ref', software.stix_id)
      .eq('relationship_type', 'uses');
    
    const groupStixIds = groupRels?.map((r: any) => r.source_ref) || [];
    const { data: groups } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .in('stix_id', groupStixIds)
      .eq('type', 'intrusion-set');
    
    const aliases = (software.data as any)?.aliases || [];
    
    return {
      ...software,
      techniques: techniques || [],
      groups: groups || [],
      is_malware: software.software_type === 'malware',
      aliases
    };
  }

  /**
   * Get all software
   */
  async getAllSoftware(type?: 'malware' | 'tool'): Promise<Array<Malware | Tool>> {
    let query = this.supabase
      .from('v_mitre_software_with_stats')
      .select('*')
      .eq('deprecated', false);
    
    if (type) {
      query = query.eq('software_type', type);
    }
    
    const { data } = await query.order('name');
    return data || [];
  }

  // ==========================================================================
  // CAMPAIGN QUERIES
  // ==========================================================================

  /**
   * Get complete campaign details
   */
  async getCampaignDetails(mitreId: string): Promise<CampaignDetails | null> {
    const { data: campaign, error } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .eq('mitre_id', mitreId)
      .eq('type', 'campaign')
      .single();
    
    if (error || !campaign) return null;
    
    // Get techniques used in this campaign
    const { data: techRels } = await this.supabase
      .from('mitre_relationships')
      .select('target_ref')
      .eq('source_ref', campaign.stix_id)
      .eq('relationship_type', 'uses');
    
    const techStixIds = techRels?.map((r: any) => r.target_ref) || [];
    const { data: techniques } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .in('stix_id', techStixIds);
    
    // Get attributed group
    const { data: groupRel } = await this.supabase
      .from('mitre_relationships')
      .select('target_ref')
      .eq('source_ref', campaign.stix_id)
      .eq('relationship_type', 'attributed-to')
      .single();
    
    let attributed_group = undefined;
    if (groupRel) {
      const { data: group } = await this.supabase
        .from('mitre_objects')
        .select('*')
        .eq('stix_id', groupRel.target_ref)
        .single();
      
      attributed_group = group || undefined;
    }
    
    const campaignData = campaign.data as any;
    
    return {
      ...campaign,
      techniques: techniques || [],
      attributed_group,
      first_seen: campaignData?.first_seen,
      last_seen: campaignData?.last_seen
    };
  }

  /**
   * Get all campaigns
   */
  async getAllCampaigns(): Promise<Campaign[]> {
    const { data } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .eq('type', 'campaign')
      .eq('deprecated', false)
      .order('name');
    
    return data || [];
  }

  // ==========================================================================
  // COVERAGE ANALYSIS
  // ==========================================================================

  /**
   * Analyze detection coverage against MITRE ATT&CK
   */
  async getCoverageAnalysis(detectionTechniques: string[]): Promise<CoverageAnalysis> {
    // Get all techniques
    const { data: allTechniques } = await this.supabase
      .from('v_mitre_techniques_full')
      .select('*')
      .eq('deprecated', false)
      .eq('revoked', false);
    
    const total = allTechniques?.length || 0;
    const covered = allTechniques?.filter(t => 
      detectionTechniques.includes(t.mitre_id)
    ).length || 0;
    
    // Coverage by tactic
    const tacticCoverage = await this.calculateTacticCoverage(allTechniques || [], detectionTechniques);
    
    // Coverage by platform
    const platformCoverage = await this.calculatePlatformCoverage(allTechniques || [], detectionTechniques);
    
    // Identify critical gaps
    const criticalGaps = await this.identifyCriticalGaps(allTechniques || [], detectionTechniques);
    
    return {
      overall: {
        total_techniques: total,
        covered_techniques: covered,
        coverage_percentage: total > 0 ? (covered / total) * 100 : 0
      },
      by_tactic: tacticCoverage,
      by_platform: platformCoverage,
      critical_gaps: criticalGaps
    };
  }

  private async calculateTacticCoverage(
    allTechniques: any[],
    coveredMitreIds: string[]
  ) {
    const tacticMap = new Map();
    
    for (const tech of allTechniques) {
      const tactics = tech.tactics || [];
      const isCovered = coveredMitreIds.includes(tech.mitre_id);
      
      for (const tactic of tactics) {
        if (!tacticMap.has(tactic.shortname)) {
          tacticMap.set(tactic.shortname, {
            tactic_shortname: tactic.shortname,
            tactic_name: tactic.shortname.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            total: 0,
            covered: 0
          });
        }
        
        const entry = tacticMap.get(tactic.shortname);
        entry.total++;
        if (isCovered) entry.covered++;
      }
    }
    
    return Array.from(tacticMap.values()).map(entry => ({
      ...entry,
      percentage: entry.total > 0 ? (entry.covered / entry.total) * 100 : 0
    }));
  }

  private async calculatePlatformCoverage(
    allTechniques: any[],
    coveredMitreIds: string[]
  ) {
    const platformMap = new Map();
    
    for (const tech of allTechniques) {
      const platforms = tech.platforms || [];
      const isCovered = coveredMitreIds.includes(tech.mitre_id);
      
      for (const platform of platforms) {
        if (!platformMap.has(platform)) {
          platformMap.set(platform, { platform, total: 0, covered: 0 });
        }
        
        const entry = platformMap.get(platform);
        entry.total++;
        if (isCovered) entry.covered++;
      }
    }
    
    return Array.from(platformMap.values()).map(entry => ({
      ...entry,
      percentage: entry.total > 0 ? (entry.covered / entry.total) * 100 : 0
    }));
  }

  private async identifyCriticalGaps(
    allTechniques: any[],
    coveredMitreIds: string[]
  ) {
    const coveredSet = new Set(coveredMitreIds);
    const uncoveredTechs = allTechniques.filter(t => !coveredSet.has(t.mitre_id));

    if (uncoveredTechs.length === 0) return [];

    // Single batch query: fetch all 'uses' relationships targeting uncovered techniques
    const uncoveredStixIds = uncoveredTechs.map(t => t.stix_id);
    const { data: relationships } = await this.supabase
      .from('mitre_relationships')
      .select('target_ref, source_ref')
      .in('target_ref', uncoveredStixIds)
      .eq('relationship_type', 'uses');

    // Build a count map: stix_id -> usage count
    const usageMap = new Map<string, number>();
    for (const rel of relationships || []) {
      usageMap.set(rel.target_ref, (usageMap.get(rel.target_ref) || 0) + 1);
    }

    const gaps = [];
    for (const tech of uncoveredTechs) {
      const usage = usageMap.get(tech.stix_id) || 0;
      if (usage >= 10) {
        gaps.push({
          technique: tech,
          reason: `Used by ${usage} groups/software`,
          priority: usage >= 20 ? 'critical' : usage >= 15 ? 'high' : 'medium',
          groups_using: usage,
          software_using: 0
        });
      }
    }

    return gaps.sort((a, b) =>
      (b.groups_using + b.software_using) - (a.groups_using + a.software_using)
    ).slice(0, 10);
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  /**
   * Search across all MITRE objects
   */
  async search(query: string) {
    const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
    const escaped = escapeLike(query);

    const { data: techniques } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .eq('type', 'attack-pattern')
      .eq('deprecated', false)
      .or(`name.ilike.%${escaped}%,mitre_id.ilike.%${escaped}%`)
      .limit(5);

    const { data: groups } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .eq('type', 'intrusion-set')
      .eq('deprecated', false)
      .or(`name.ilike.%${escaped}%,mitre_id.ilike.%${escaped}%`)
      .limit(5);

    const { data: software } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .in('type', ['malware', 'tool'])
      .eq('deprecated', false)
      .or(`name.ilike.%${escaped}%,mitre_id.ilike.%${escaped}%`)
      .limit(5);

    const { data: campaigns } = await this.supabase
      .from('mitre_objects')
      .select('*')
      .eq('type', 'campaign')
      .eq('deprecated', false)
      .or(`name.ilike.%${escaped}%,mitre_id.ilike.%${escaped}%`)
      .limit(5);
    
    return {
      techniques: techniques || [],
      groups: groups || [],
      software: software || [],
      campaigns: campaigns || []
    };
  }
}
