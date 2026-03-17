
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { normalizeTactics, normalizePlatforms } from '../lib/mitre/normalization';
import { toError } from '../lib/errors';

export interface SoftwareTechnique {
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

export interface SoftwareGroup {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string;
  relationship_description: string | null;
  technique_count: number;
}

export interface SoftwareDetail {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  software_type: 'malware' | 'tool';
  data: any;
  technique_count: number;
  group_count: number;
  techniques: SoftwareTechnique[];
  groups: SoftwareGroup[];
}


export function useSoftwareDetail(mitreId: string) {
  const [software, setSoftware] = useState<SoftwareDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (mitreId) {
      loadSoftwareDetail();
    }
  }, [mitreId]);

  async function loadSoftwareDetail() {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get software basic info
      const { data: softwareData, error: softwareError } = await supabase
        .from('v_mitre_software_with_stats')
        .select('*')
        .eq('mitre_id', mitreId)
        .single();

      if (softwareError) throw softwareError;
      if (!softwareData) throw new Error('Software not found');

      // Step 2: Get techniques used by this software (software "uses" techniques)
      const { data: techRels, error: techRelError } = await supabase
        .from('mitre_relationships')
        .select('target_ref, description')
        .eq('source_ref', softwareData.stix_id)
        .eq('relationship_type', 'uses');

      let techniques: SoftwareTechnique[] = [];
      if (techRels && techRels.length > 0) {
        const techniqueIds = techRels.map((r: any) => r.target_ref);
        
        // Fetch full technique data from view
        const { data: techData, error: techError } = await supabase
          .from('v_mitre_techniques_full')
          .select('*')
          .in('stix_id', techniqueIds)
          .eq('deprecated', false);

        if (techError) {
          console.error('Error fetching technique details:', techError);
        }

        const relDescMap = new Map(
          techRels.map((r: any) => [r.target_ref, r.description])
        );

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

      // Step 3: Get groups using this software (groups "use" this software)
      const { data: groupRels, error: groupRelError } = await supabase
        .from('mitre_relationships')
        .select('source_ref, description')
        .eq('target_ref', softwareData.stix_id)
        .eq('relationship_type', 'uses');

      let groups: SoftwareGroup[] = [];
      if (groupRels && groupRels.length > 0) {
        const groupIds = groupRels.map((r: any) => r.source_ref);
        
        const { data: groupData } = await supabase
          .from('v_mitre_groups_with_stats')
          .select('*')
          .in('stix_id', groupIds)
          .eq('deprecated', false);

        const relDescMap = new Map(
          groupRels.map((r: any) => [r.source_ref, r.description])
        );

        groups = (groupData || []).map((g: any) => ({
          stix_id: g.stix_id,
          mitre_id: g.mitre_id,
          name: g.name,
          description: g.description,
          relationship_description: relDescMap.get(g.stix_id) || null,
          technique_count: g.technique_count || 0
        }));
      }

      setSoftware({
        ...softwareData,
        techniques,
        groups
      });
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load software detail:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    software,
    loading,
    error,
    refetch: loadSoftwareDetail
  };
}
