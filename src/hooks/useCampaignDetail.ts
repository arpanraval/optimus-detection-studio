
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { normalizeTactics, normalizePlatforms } from '../lib/mitre/normalization';
import { toError } from '../lib/errors';

export interface CampaignTechnique {
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

export interface CampaignSoftware {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string;
  software_type: 'malware' | 'tool';
  relationship_description: string | null;
}

export interface CampaignGroup {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string;
  technique_count: number;
}

export interface CampaignDetail {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  first_seen: string | null;
  last_seen: string | null;
  data: any;
  techniques: CampaignTechnique[];
  software: CampaignSoftware[];
  attributed_group: CampaignGroup | null;
}


export function useCampaignDetail(mitreId: string) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (mitreId) {
      loadCampaignDetail();
    }
  }, [mitreId]);

  async function loadCampaignDetail() {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get campaign basic info
      const { data: campaignData, error: campaignError } = await supabase
        .from('mitre_objects')
        .select('*')
        .eq('mitre_id', mitreId)
        .eq('type', 'campaign')
        .single();

      if (campaignError) throw campaignError;
      if (!campaignData) throw new Error('Campaign not found');

      // Step 2: Get techniques used by this campaign
      const { data: techRels } = await supabase
        .from('mitre_relationships')
        .select('target_ref, description')
        .eq('source_ref', campaignData.stix_id)
        .eq('relationship_type', 'uses');

      let techniques: CampaignTechnique[] = [];
      if (techRels && techRels.length > 0) {
        const techniqueIds = techRels.map((r: any) => r.target_ref);
        
        const { data: techData } = await supabase
          .from('v_mitre_techniques_full')
          .select('*')
          .in('stix_id', techniqueIds)
          .eq('deprecated', false);

        const relDescMap = new Map(techRels.map((r: any) => [r.target_ref, r.description]));

        techniques = (techData || []).map((tech: any) => ({
          stix_id: tech.stix_id,
          mitre_id: tech.mitre_id,
          name: tech.name,
          description: tech.description || '',
          relationship_description: relDescMap.get(tech.stix_id) || null,
          tactics: normalizeTactics(tech.tactics),
          platforms: normalizePlatforms(tech.platforms),
          is_subtechnique: tech.is_subtechnique || tech.data?.x_mitre_is_subtechnique || false,
          data: tech.data || {}
        }));
      }

      // Step 3: Get software used by this campaign
      const { data: softRels } = await supabase
        .from('mitre_relationships')
        .select('target_ref, description')
        .eq('source_ref', campaignData.stix_id)
        .eq('relationship_type', 'uses');

      let software: CampaignSoftware[] = [];
      if (softRels && softRels.length > 0) {
        const softwareIds = softRels.map((r: any) => r.target_ref);
        
        const { data: softData } = await supabase
          .from('mitre_objects')
          .select('*')
          .in('stix_id', softwareIds)
          .in('type', ['malware', 'tool']);

        const relDescMap = new Map(softRels.map((r: any) => [r.target_ref, r.description]));

        software = (softData || []).map((s: any) => ({
          stix_id: s.stix_id,
          mitre_id: s.mitre_id,
          name: s.name,
          description: s.description,
          software_type: s.type as 'malware' | 'tool',
          relationship_description: relDescMap.get(s.stix_id) || null
        }));
      }

      // Step 4: Get attributed group
      const { data: groupRels } = await supabase
        .from('mitre_relationships')
        .select('target_ref')
        .eq('source_ref', campaignData.stix_id)
        .eq('relationship_type', 'attributed-to')
        .limit(1);

      let attributed_group: CampaignGroup | null = null;
      if (groupRels && groupRels.length > 0) {
        const { data: groupData } = await supabase
          .from('v_mitre_groups_with_stats')
          .select('*')
          .eq('stix_id', groupRels[0].target_ref)
          .single();

        if (groupData) {
          attributed_group = {
            stix_id: groupData.stix_id,
            mitre_id: groupData.mitre_id,
            name: groupData.name,
            description: groupData.description,
            technique_count: groupData.technique_count || 0
          };
        }
      }

      setCampaign({
        ...campaignData,
        first_seen: campaignData.data?.first_seen || null,
        last_seen: campaignData.data?.last_seen || null,
        techniques,
        software,
        attributed_group
      });
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load campaign detail:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    campaign,
    loading,
    error,
    refetch: loadCampaignDetail
  };
}
