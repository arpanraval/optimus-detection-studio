import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { TargetingIntel } from '@/types/mitre-stix';
import { normalizeTactics, normalizePlatforms } from '../lib/mitre/normalization';
import { toError } from '../lib/errors';

export interface GroupTechnique {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string;
  relationship_description: string | null;
  tactics: Array<{ stix_id: string; shortname: string }>;
  platforms: string[];
  is_subtechnique: boolean;
  data: any;
}

export interface GroupSoftware {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string;
  software_type: 'malware' | 'tool';
  relationship_description: string | null;
}

export interface GroupCampaign {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string;
  first_seen?: string;
  last_seen?: string;
}

export interface GroupDetail {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  deprecated: boolean;
  data: any;
  technique_count: number;
  software_count: number;
  campaign_count: number;
  techniques: GroupTechnique[];
  software: GroupSoftware[];
  campaigns: GroupCampaign[];
  // Targeting Intelligence (from MISP Threat Actor Galaxy enrichment)
  targeting_intel: TargetingIntel | null;
}


export function useGroupDetail(mitreId: string) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (mitreId) {
      loadGroupDetail();
    }
  }, [mitreId]);

  async function loadGroupDetail() {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get group basic info
      const { data: groupData, error: groupError } = await supabase
        .from('v_mitre_groups_with_stats')
        .select('*')
        .eq('mitre_id', mitreId)
        .single();

      if (groupError) throw groupError;
      if (!groupData) throw new Error('Group not found');

      // Step 2: Get techniques via relationships, then enrich with full data
      const { data: techRels, error: relError } = await supabase
        .from('mitre_relationships')
        .select('target_ref, description')
        .eq('source_ref', groupData.stix_id)
        .eq('relationship_type', 'uses');

      let techniques: GroupTechnique[] = [];
      
      if (techRels && techRels.length > 0) {
        // Get all technique STIX IDs from relationships
        const techniqueStixIds = techRels.map((r: any) => r.target_ref);
        
        // Fetch full technique data from view (includes tactics, platforms)
        const { data: techData, error: techError } = await supabase
          .from('v_mitre_techniques_full')
          .select('*')
          .in('stix_id', techniqueStixIds)
          .eq('deprecated', false);

        if (techError) {
          console.error('Error fetching technique details:', techError);
        }

        // Create relationship description lookup
        const relDescMap = new Map(
          techRels.map((r: any) => [r.target_ref, r.description])
        );

        // Map to GroupTechnique format with normalized tactics/platforms
        techniques = (techData || []).map((tech: any) => {
          const normalizedTactics = normalizeTactics(tech.tactics);
          const normalizedPlatforms = normalizePlatforms(tech.platforms);
          
          return {
            stix_id: tech.stix_id,
            mitre_id: tech.mitre_id,
            name: tech.name,
            description: tech.description || '',
            relationship_description: relDescMap.get(tech.stix_id) || null,
            tactics: normalizedTactics,
            platforms: normalizedPlatforms,
            is_subtechnique: tech.is_subtechnique || tech.data?.x_mitre_is_subtechnique || false,
            data: tech.data || {}
          };
        });
        
      }

      // Step 3: Get software used by this group
      const { data: softwareRels, error: softError } = await supabase
        .from('mitre_relationships')
        .select('target_ref, description')
        .eq('source_ref', groupData.stix_id)
        .eq('relationship_type', 'uses');

      let software: GroupSoftware[] = [];
      if (softwareRels && softwareRels.length > 0) {
        const softwareIds = softwareRels.map((r: any) => r.target_ref);
        const { data: softwareData } = await supabase
          .from('mitre_objects')
          .select('*')
          .in('stix_id', softwareIds)
          .in('type', ['malware', 'tool']);

        software = (softwareData || []).map((s: any) => ({
          stix_id: s.stix_id,
          mitre_id: s.mitre_id,
          name: s.name,
          description: s.description,
          software_type: s.type as 'malware' | 'tool',
          relationship_description: softwareRels.find((r: any) => r.target_ref === s.stix_id)?.description || null
        }));
      }

      // Step 4: Get campaigns attributed to this group
      const { data: campaignRels, error: campError } = await supabase
        .from('mitre_relationships')
        .select('source_ref')
        .eq('target_ref', groupData.stix_id)
        .eq('relationship_type', 'attributed-to');

      let campaigns: GroupCampaign[] = [];
      if (campaignRels && campaignRels.length > 0) {
        const campaignIds = campaignRels.map((r: any) => r.source_ref);
        const { data: campaignData } = await supabase
          .from('mitre_objects')
          .select('*')
          .in('stix_id', campaignIds)
          .eq('type', 'campaign');

        campaigns = (campaignData || []).map((c: any) => ({
          stix_id: c.stix_id,
          mitre_id: c.mitre_id,
          name: c.name,
          description: c.description,
          first_seen: c.data?.first_seen,
          last_seen: c.data?.last_seen
        }));
      }

      setGroup({
        ...groupData,
        techniques,
        software,
        campaigns,
        targeting_intel: groupData.data?.targeting_intel || null,
      });
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load group detail:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    group,
    loading,
    error,
    refetch: loadGroupDetail
  };
}
