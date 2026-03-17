import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Detection } from '../types';
import { ThreatActorWeight } from './useImpactScores';

// ============================================
// TYPES
// ============================================

export interface CampaignReadiness {
  name: string;
  stixId: string;
  covered: number;
  total: number;
  coveragePct: number;
  attributedGroup: string | null;
}

export interface ThreatLandscapeEntry {
  name: string;
  stixId: string;
  taw: number;
  techniqueCount: number;
  coveredCount: number;
  coveragePct: number;
}

export interface SectorCoverage {
  name: string;
  groupCount: number;
  totalTechniques: number;
  coveredTechniques: number;
  coveragePct: number;
}

export interface OriginCoverage {
  country: string;
  groupCount: number;
  totalTechniques: number;
  coveredTechniques: number;
  coveragePct: number;
}

// ============================================
// COUNTRY NAME NORMALIZATION
// ============================================

const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  'Iran (Islamic Republic of)': 'Iran',
  'Iran, Islamic Republic of': 'Iran',
  'Korea, Democratic People\'s Republic of': 'North Korea',
  'Democratic People\'s Republic of Korea': 'North Korea',
  'Russian Federation': 'Russia',
  'United States of America': 'United States',
  'Viet Nam': 'Vietnam',
  'Türkiye': 'Turkey',
  'Korea, Republic of': 'South Korea',
  'China, People\'s Republic of': 'China',
};

function normalizeCountry(name: string): string | null {
  if (!name || name === 'Unknown' || name === 'unknown') return null;
  return COUNTRY_DISPLAY_NAMES[name] || name;
}

// ============================================
// HOOK
// ============================================

export interface CoverageTrendPoint {
  month: string;
  coveragePct: number;
  totalRules: number;
}

export function useCommandCenterData(
  actors: ThreatActorWeight[],
  detections: Detection[],
  totalTechniques?: number
) {
  const [campaignReadiness, setCampaignReadiness] = useState<CampaignReadiness[]>([]);
  const [threatLandscape, setThreatLandscape] = useState<ThreatLandscapeEntry[]>([]);
  const [sectorCoverage, setSectorCoverage] = useState<SectorCoverage[]>([]);
  const [originCoverage, setOriginCoverage] = useState<OriginCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userTechniqueIds = useMemo(() => {
    const ids = new Set<string>();
    detections.forEach(d => {
      (d.mitreAttackIds || []).forEach(id => ids.add(id));
    });
    return ids;
  }, [detections]);

  // Fetch campaign readiness
  useEffect(() => {
    let cancelled = false;

    async function fetchCampaigns() {
      try {
        const { data: campaigns } = await supabase
          .from('mitre_objects')
          .select('stix_id, mitre_id, name')
          .eq('type', 'campaign')
          .limit(100);

        if (!campaigns || campaigns.length === 0 || cancelled) return;

        const ids = campaigns.map(c => c.stix_id);

        const [techResult, attrResult] = await Promise.all([
          supabase.from('mitre_relationships').select('source_ref, target_ref').eq('relationship_type', 'uses').in('source_ref', ids),
          supabase.from('mitre_relationships').select('source_ref, target_ref').eq('relationship_type', 'attributed-to').in('source_ref', ids),
        ]);

        const techRels = techResult.data || [];
        const attrRels = attrResult.data || [];

        // Resolve technique STIX IDs → MITRE IDs
        const techStixIds = [...new Set(techRels.map(r => r.target_ref))];
        const techniqueMap = new Map<string, string>();
        for (let i = 0; i < techStixIds.length; i += 100) {
          const { data } = await supabase.from('mitre_objects').select('stix_id, mitre_id').in('stix_id', techStixIds.slice(i, i + 100));
          (data || []).forEach(t => techniqueMap.set(t.stix_id, t.mitre_id));
        }

        // Resolve group names
        const groupStixIds = [...new Set(attrRels.map(r => r.target_ref))];
        const groupMap = new Map<string, string>();
        if (groupStixIds.length > 0) {
          const { data } = await supabase.from('mitre_objects').select('stix_id, name').in('stix_id', groupStixIds);
          (data || []).forEach(g => groupMap.set(g.stix_id, g.name));
        }

        // Build maps
        const campaignTechs = new Map<string, string[]>();
        techRels.forEach(r => {
          const mid = techniqueMap.get(r.target_ref);
          if (mid) {
            const arr = campaignTechs.get(r.source_ref) || [];
            arr.push(mid);
            campaignTechs.set(r.source_ref, arr);
          }
        });

        const campaignAttrs = new Map<string, string>();
        attrRels.forEach(r => {
          const name = groupMap.get(r.target_ref);
          if (name) campaignAttrs.set(r.source_ref, name);
        });

        const readiness = campaigns
          .map(c => {
            const techs = campaignTechs.get(c.stix_id) || [];
            const covered = techs.filter(t => userTechniqueIds.has(t)).length;
            return {
              name: c.name, stixId: c.stix_id,
              covered, total: techs.length,
              coveragePct: techs.length > 0 ? Math.round((covered / techs.length) * 100) : 0,
              attributedGroup: campaignAttrs.get(c.stix_id) || null,
            };
          })
          .filter(c => c.total > 0)
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);

        if (!cancelled) setCampaignReadiness(readiness);
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to load campaign readiness:', err);
          setError(err instanceof Error ? err.message : 'Failed to load campaign data');
        }
      }
    }

    fetchCampaigns();
    return () => { cancelled = true; };
  }, [userTechniqueIds]);

  // Compute threat landscape from top actors
  useEffect(() => {
    let cancelled = false;

    async function fetchActorCoverage() {
      const top = actors.slice(0, 5);
      if (top.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const ids = top.map(a => a.stix_id);
        const { data: rels } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref')
          .eq('relationship_type', 'uses')
          .in('source_ref', ids);

        const techStixIds = [...new Set((rels || []).map(r => r.target_ref))];
        const techniqueMap = new Map<string, string>();
        for (let i = 0; i < techStixIds.length; i += 100) {
          const { data } = await supabase.from('mitre_objects').select('stix_id, mitre_id').in('stix_id', techStixIds.slice(i, i + 100));
          (data || []).forEach(t => techniqueMap.set(t.stix_id, t.mitre_id));
        }

        const actorTechs = new Map<string, string[]>();
        (rels || []).forEach(r => {
          const mid = techniqueMap.get(r.target_ref);
          if (mid) {
            const arr = actorTechs.get(r.source_ref) || [];
            arr.push(mid);
            actorTechs.set(r.source_ref, arr);
          }
        });

        const landscape = top.map(a => {
          const techs = actorTechs.get(a.stix_id) || [];
          const covered = techs.filter(t => userTechniqueIds.has(t)).length;
          return {
            name: a.name, stixId: a.stix_id, taw: a.taw,
            techniqueCount: techs.length, coveredCount: covered,
            coveragePct: techs.length > 0 ? Math.round((covered / techs.length) * 100) : 0,
          };
        });

        if (!cancelled) setThreatLandscape(landscape);
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to load threat landscape:', err);
          setError(err instanceof Error ? err.message : 'Failed to load threat data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchActorCoverage();
    return () => { cancelled = true; };
  }, [actors, userTechniqueIds]);

  // Compute sector and origin country coverage
  useEffect(() => {
    let cancelled = false;

    async function fetchSectorOriginCoverage() {
      try {
        // Fetch all intrusion-set groups with targeting_intel
        const { data: groups } = await supabase
          .from('mitre_objects')
          .select('stix_id, name, data')
          .eq('type', 'intrusion-set')
          .eq('deprecated', false);

        if (!groups || groups.length === 0 || cancelled) return;

        // Fetch ALL group→technique relationships in one batch
        const groupStixIds = groups.map(g => g.stix_id);
        const allRels: { source_ref: string; target_ref: string }[] = [];
        for (let i = 0; i < groupStixIds.length; i += 100) {
          const { data: rels } = await supabase
            .from('mitre_relationships')
            .select('source_ref, target_ref')
            .eq('relationship_type', 'uses')
            .in('source_ref', groupStixIds.slice(i, i + 100));
          if (rels) allRels.push(...rels);
        }

        // Resolve technique STIX IDs → MITRE IDs
        const techStixIds = [...new Set(allRels.map(r => r.target_ref))];
        const techniqueMap = new Map<string, string>();
        for (let i = 0; i < techStixIds.length; i += 100) {
          const { data } = await supabase
            .from('mitre_objects')
            .select('stix_id, mitre_id')
            .in('stix_id', techStixIds.slice(i, i + 100));
          (data || []).forEach(t => techniqueMap.set(t.stix_id, t.mitre_id));
        }

        // Build per-group technique sets
        const groupTechMap = new Map<string, Set<string>>();
        allRels.forEach(r => {
          const mid = techniqueMap.get(r.target_ref);
          if (mid) {
            if (!groupTechMap.has(r.source_ref)) groupTechMap.set(r.source_ref, new Set());
            groupTechMap.get(r.source_ref)!.add(mid);
          }
        });

        // Aggregate techniques by sector and origin country (technique-level coverage)
        // Sector → union of all techniques from all groups targeting that sector
        const sectorTechs = new Map<string, { techniques: Set<string>; groupCount: number }>();
        const originTechs = new Map<string, { techniques: Set<string>; groupCount: number }>();

        for (const g of groups) {
          const targeting = g.data?.targeting_intel;
          if (!targeting) continue;
          const techs = groupTechMap.get(g.stix_id) || new Set<string>();

          // Sectors
          for (const sector of targeting.target_sectors || []) {
            if (!sectorTechs.has(sector)) sectorTechs.set(sector, { techniques: new Set(), groupCount: 0 });
            const entry = sectorTechs.get(sector)!;
            entry.groupCount++;
            for (const t of techs) entry.techniques.add(t);
          }

          // Origin country (normalized, skip unknowns)
          const country = normalizeCountry(targeting.origin_country || '');
          if (country) {
            if (!originTechs.has(country)) originTechs.set(country, { techniques: new Set(), groupCount: 0 });
            const entry = originTechs.get(country)!;
            entry.groupCount++;
            for (const t of techs) entry.techniques.add(t);
          }
        }

        const sectors: SectorCoverage[] = [...sectorTechs.entries()]
          .map(([name, { techniques, groupCount }]) => {
            const covered = [...techniques].filter(t => userTechniqueIds.has(t)).length;
            return {
              name,
              groupCount,
              totalTechniques: techniques.size,
              coveredTechniques: covered,
              coveragePct: techniques.size > 0 ? Math.round((covered / techniques.size) * 100) : 0,
            };
          })
          .filter(s => s.totalTechniques > 0)
          .sort((a, b) => b.groupCount - a.groupCount);

        const origins: OriginCoverage[] = [...originTechs.entries()]
          .map(([country, { techniques, groupCount }]) => {
            const covered = [...techniques].filter(t => userTechniqueIds.has(t)).length;
            return {
              country,
              groupCount,
              totalTechniques: techniques.size,
              coveredTechniques: covered,
              coveragePct: techniques.size > 0 ? Math.round((covered / techniques.size) * 100) : 0,
            };
          })
          .filter(o => o.totalTechniques > 0)
          .sort((a, b) => b.groupCount - a.groupCount);

        if (!cancelled) {
          setSectorCoverage(sectors);
          setOriginCoverage(origins);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to load sector/origin coverage:', err);
          setError(err instanceof Error ? err.message : 'Failed to load coverage data');
        }
      }
    }

    fetchSectorOriginCoverage();
    return () => { cancelled = true; };
  }, [userTechniqueIds]);

  // Coverage trend: 12 monthly snapshots of technique coverage
  const coverageTrend = useMemo<CoverageTrendPoint[]>(() => {
    const TOTAL_TECHNIQUES = totalTechniques || 648;
    const now = new Date();
    const points: CoverageTrendPoint[] = [];

    for (let i = 11; i >= 0; i--) {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const techniques = new Set<string>();
      let ruleCount = 0;

      for (const d of detections) {
        if (!d.createdDate) continue;
        const created = new Date(d.createdDate);
        if (created <= monthEnd) {
          ruleCount++;
          (d.mitreAttackIds || []).forEach(id => techniques.add(id));
        }
      }

      const monthLabel = monthEnd.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      points.push({
        month: monthLabel,
        coveragePct: TOTAL_TECHNIQUES > 0 ? Math.round((techniques.size / TOTAL_TECHNIQUES) * 1000) / 10 : 0,
        totalRules: ruleCount,
      });
    }

    return points;
  }, [detections, totalTechniques]);

  return { campaignReadiness, threatLandscape, sectorCoverage, originCoverage, coverageTrend, loading, error };
}
