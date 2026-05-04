// src/hooks/useProfileIntelligence.ts
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { MatchResult, MatchedDetection } from '../services/logSourceDiscovery';
import {
  type PriorityBreakdown,
  computePriorityScore,
  buildCrownJewelPatterns,
  isSiemDetectable,
  NON_SIEM_TECHNIQUE_PREFIXES,
  CROWN_JEWEL_KEYWORDS,
} from '../lib/prioritization/prioritizationEngine';

// Re-export so existing consumers aren't broken
export type { PriorityBreakdown } from '../lib/prioritization/prioritizationEngine';

export interface ThreatGroupSummary {
  name: string;
  stixId: string;
  originCountry: string;
  originCountryCode: string;
  activityType: string;
  techniqueCount: number;
  /** Number of the group's techniques that have at least one matched detection */
  coveredTechniqueCount: number;
  detectionCount: number;
  sectors: string[];
  /** Last modified date of this threat group's MITRE data */
  lastModified: string | null;
  /** Description/aliases from MITRE data */
  aliases: string[];
}

export interface RecommendedDetection {
  id: string;
  name: string;
  severity: string;
  confidence: string;
  mitreTechniques: string[];
  mitreAttackIds: string[];
  queryLanguage: string;
  threatGroupNames: string[];
  siemReady: boolean;
  priorityScore: number;
  priorityBreakdown: PriorityBreakdown;
  status: string;
  qualityScore: number;
  testedAndValidated: boolean;
  crownJewelMatch: string | null;
}

export interface GroupTechniqueDetail {
  mitreId: string;
  name: string;
  covered: boolean;
  detectionId?: string;
}

export interface SiemReadiness {
  platform: string;
  nativeCount: number;
  sigmaCount: number;
  queryLanguages: string[];
}

export interface GapTechnique {
  mitreId: string;
  name: string;
  threatGroupCount: number;
  /** Names of threat groups using this technique (mirrors threatGroupCount). */
  threatGroupNames: string[];
  /** False for Reconnaissance (TA0043) and Resource Development (TA0042) techniques that occur on attacker infrastructure */
  siemDetectable: boolean;
}

export interface TacticThreatTechnique {
  mitreId: string;
  name: string;
  covered: boolean;
  /** Number of threat groups using this technique */
  groupCount: number;
}

export interface TacticThreatCoverage {
  /** Kill-chain tactic name (display form) */
  tactic: string;
  /** Short abbreviation for compact display */
  abbr: string;
  /** Techniques used by threat groups under this tactic */
  techniques: TacticThreatTechnique[];
  coveredCount: number;
  totalCount: number;
}

export interface ProfileIntelligence {
  threatGroups: ThreatGroupSummary[];
  recommendedDetections: RecommendedDetection[];
  gapTechniques: GapTechnique[];
  gapTechniqueCount: number;
  siemReadiness: SiemReadiness[];
  totalRecommended: number;
  groupTechniqueDetails: Record<string, GroupTechniqueDetail[]>;
  /** Per-tactic view of threat group techniques and detection coverage (for MITRE matrix) */
  tacticThreatCoverage: TacticThreatCoverage[];
  loading: boolean;
  error: string | null;
}

/** Maps SIEM platform names to detection queryLanguage values */
export const SIEM_TO_QUERY_LANGUAGES: Record<string, string[]> = {
  'Splunk': ['SPL', 'Splunk (SPL)'],
  'Microsoft Sentinel': ['KQL'],
  'Microsoft Defender XDR': ['KQL'],
  'Elastic Security': ['EQL', 'ESQL', 'Kuery'],
  'CrowdStrike Falcon': ['CQL'],
  'Google Chronicle': ['YARA-L'],
};

/** MITRE ATT&CK kill chain phase_name → display tactic info, in kill-chain order */
const TACTIC_ORDER: Array<{ phase: string; display: string; abbr: string }> = [
  { phase: 'reconnaissance', display: 'Reconnaissance', abbr: 'Recon' },
  { phase: 'resource-development', display: 'Resource Development', abbr: 'Res Dev' },
  { phase: 'initial-access', display: 'Initial Access', abbr: 'Init Acc' },
  { phase: 'execution', display: 'Execution', abbr: 'Exec' },
  { phase: 'persistence', display: 'Persistence', abbr: 'Persist' },
  { phase: 'privilege-escalation', display: 'Privilege Escalation', abbr: 'Priv Esc' },
  { phase: 'defense-evasion', display: 'Defense Evasion', abbr: 'Def Eva' },
  { phase: 'credential-access', display: 'Credential Access', abbr: 'Cred Acc' },
  { phase: 'discovery', display: 'Discovery', abbr: 'Discov' },
  { phase: 'lateral-movement', display: 'Lateral Movement', abbr: 'Lat Mov' },
  { phase: 'collection', display: 'Collection', abbr: 'Collect' },
  { phase: 'command-and-control', display: 'Command And Control', abbr: 'C2' },
  { phase: 'exfiltration', display: 'Exfiltration', abbr: 'Exfil' },
  { phase: 'impact', display: 'Impact', abbr: 'Impact' },
];

/** Paginate through a Supabase table */
async function fetchAllRows<T>(
  table: string,
  select: string,
  filters?: { column: string; value: any; op?: 'eq' | 'in' }[]
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  let from = 0;
  let done = false;
  while (!done) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (filters) {
      for (const f of filters) {
        if (f.op === 'in') q = q.in(f.column, f.value);
        else q = q.eq(f.column, f.value);
      }
    }
    const { data, error } = await q;
    if (error) { console.warn(`[ProfileIntel] fetch ${table}:`, error.message); break; }
    if (!data || data.length === 0) { done = true; } else {
      all.push(...(data as T[]));
      if (data.length < pageSize) done = true; else from += pageSize;
    }
  }
  return all;
}

/**
 * Aggregate all threat-group techniques by tactic for the MITRE matrix view.
 * Returns one entry per tactic in kill-chain order with technique-level coverage.
 */
function buildTacticThreatCoverage(
  groupTechniqueIds: Set<string>,
  matchedTechIds: Set<string>,
  mitreToName: Map<string, string>,
  mitreIdToTactics: Map<string, string[]>,
  groupTechMap: Map<string, Set<string>>,
): TacticThreatCoverage[] {
  if (groupTechniqueIds.size === 0) return [];

  // Count how many groups use each technique
  const techGroupCount = new Map<string, number>();
  for (const [, gTechs] of groupTechMap) {
    for (const mid of gTechs) {
      techGroupCount.set(mid, (techGroupCount.get(mid) ?? 0) + 1);
    }
  }

  // Group techniques by tactic
  const tacticTechs = new Map<string, Map<string, TacticThreatTechnique>>(); // phase → mitreId → tech
  for (const mid of groupTechniqueIds) {
    const tactics = mitreIdToTactics.get(mid);
    if (!tactics || tactics.length === 0) continue;
    for (const phase of tactics) {
      if (!tacticTechs.has(phase)) tacticTechs.set(phase, new Map());
      const map = tacticTechs.get(phase)!;
      if (!map.has(mid)) {
        map.set(mid, {
          mitreId: mid,
          name: mitreToName.get(mid) || mid,
          covered: matchedTechIds.has(mid),
          groupCount: techGroupCount.get(mid) ?? 0,
        });
      }
    }
  }

  // Build output in kill-chain order
  return TACTIC_ORDER
    .map(t => {
      const techMap = tacticTechs.get(t.phase);
      const techniques = techMap
        ? Array.from(techMap.values()).sort((a, b) => {
            // Uncovered first, then by group count descending
            if (a.covered !== b.covered) return a.covered ? 1 : -1;
            return b.groupCount - a.groupCount;
          })
        : [];
      return {
        tactic: t.display,
        abbr: t.abbr,
        techniques,
        coveredCount: techniques.filter(tt => tt.covered).length,
        totalCount: techniques.length,
      };
    })
    .filter(t => t.totalCount > 0); // Only include tactics with threat-group techniques
}

/**
 * v2: Takes sectors (exact match), country/origin filters, and a MatchResult
 * from the direct feasibility service instead of MITRE technique IDs.
 */
export function useProfileIntelligence(
  sectors: string[],
  siemPlatforms: string[],
  matchResult: MatchResult | null,
  userCountry: string | null,
  threatOriginCountries: string[],
  crownJewels: string[]
): ProfileIntelligence {
  const [state, setState] = useState<ProfileIntelligence>({
    threatGroups: [], recommendedDetections: [], gapTechniques: [], gapTechniqueCount: 0,
    siemReadiness: [], totalRecommended: 0, groupTechniqueDetails: {}, tacticThreatCoverage: [], loading: false, error: null,
  });
  const abortRef = useRef(0);

  const userQueryLanguages = siemPlatforms.flatMap(s => SIEM_TO_QUERY_LANGUAGES[s] || []);

  useEffect(() => {
    if (sectors.length === 0 && !userCountry && threatOriginCountries.length === 0 && !matchResult) return;

    const runId = ++abortRef.current;

    (async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        // ── 1. Threat groups matching profile (sectors + country filters) ──
        let threatGroups: ThreatGroupSummary[] = [];
        const groupTechMap = new Map<string, Set<string>>(); // stixId → Set<mitre_id>
        let groupTechniqueIds = new Set<string>();
        let mitreToName = new Map<string, string>();
        let mitreIdToTactics = new Map<string, string[]>(); // mitre_id → phase_name[]

        const hasSectorFilter = sectors.length > 0;
        const hasCountryFilter = !!userCountry;
        const hasOriginFilter = threatOriginCountries.length > 0;

        if (hasSectorFilter || hasCountryFilter || hasOriginFilter) {
          const allGroups = await fetchAllRows<{ stix_id: string; name: string; data: any }>(
            'mitre_objects', 'stix_id, name, data',
            [{ column: 'type', value: 'intrusion-set' }]
          );
          if (runId !== abortRef.current) return;

          // Filter groups by profile criteria
          const matchedGroups = allGroups.filter(g => {
            const targeting = g.data?.targeting_intel;
            if (!targeting) return false;

            // Sector filter: exact overlap with target_sectors array
            if (hasSectorFilter) {
              const groupSectors = (targeting.target_sectors as string[]) || [];
              if (!groupSectors.some((s: string) => sectors.includes(s))) return false;
            }

            // Country filter: user's country in target_countries
            if (hasCountryFilter) {
              const targetCountries = (targeting.target_countries as string[]) || [];
              if (targetCountries.length > 0 && !targetCountries.includes(userCountry!)) return false;
            }

            // Origin filter: group's origin_country_code in user's threat origins
            if (hasOriginFilter) {
              const originCode = targeting.origin_country_code as string;
              if (originCode && !threatOriginCountries.includes(originCode)) return false;
            }

            return true;
          });

          // Get techniques used by these groups
          const groupStixIds = matchedGroups.map(g => g.stix_id);
          if (groupStixIds.length > 0) {
            const usesRels = await fetchAllRows<{ source_ref: string; target_ref: string }>(
              'mitre_relationships', 'source_ref, target_ref',
              [{ column: 'relationship_type', value: 'uses' }]
            );
            if (runId !== abortRef.current) return;

            const groupStixSet = new Set(groupStixIds);
            const groupToTechStix = new Map<string, Set<string>>();

            for (const rel of usesRels) {
              if (groupStixSet.has(rel.source_ref)) {
                if (!groupToTechStix.has(rel.source_ref)) groupToTechStix.set(rel.source_ref, new Set());
                groupToTechStix.get(rel.source_ref)!.add(rel.target_ref);
              }
            }

            // Map stix_ids to mitre_ids + extract tactic (kill chain phase) data
            const techObjects = await fetchAllRows<{ stix_id: string; mitre_id: string; name: string; data: any }>(
              'mitre_objects', 'stix_id, mitre_id, name, data',
              [{ column: 'type', value: 'attack-pattern' }]
            );
            if (runId !== abortRef.current) return;

            const stixToMitre = new Map<string, string>();
            mitreIdToTactics = new Map<string, string[]>();
            for (const t of techObjects) {
              if (t.mitre_id) {
                stixToMitre.set(t.stix_id, t.mitre_id);
                mitreToName.set(t.mitre_id, t.name);
                // Extract kill chain phases (tactics) from STIX data
                const phases = t.data?.kill_chain_phases as Array<{ kill_chain_name?: string; phase_name?: string }> | undefined;
                if (phases && Array.isArray(phases)) {
                  const tacticPhases = phases
                    .filter(p => p.kill_chain_name === 'mitre-attack' && p.phase_name)
                    .map(p => p.phase_name!);
                  if (tacticPhases.length > 0) {
                    mitreIdToTactics.set(t.mitre_id, tacticPhases);
                  }
                }
              }
            }

            for (const [gStix, tStixSet] of groupToTechStix) {
              const mitreIds = new Set<string>();
              for (const ts of tStixSet) {
                const mid = stixToMitre.get(ts);
                if (mid) { mitreIds.add(mid); groupTechniqueIds.add(mid); }
              }
              groupTechMap.set(gStix, mitreIds);
            }
          }

          threatGroups = matchedGroups.map(g => {
            const targeting = g.data?.targeting_intel || {};
            return {
              name: g.name,
              stixId: g.stix_id,
              originCountry: targeting.origin_country || 'Unknown',
              originCountryCode: targeting.origin_country_code || '',
              activityType: targeting.activity_type || 'Unknown',
              techniqueCount: groupTechMap.get(g.stix_id)?.size || 0,
              coveredTechniqueCount: 0, // filled after detection matching
              detectionCount: 0,
              sectors: targeting.target_sectors || [],
              lastModified: g.data?.modified || null,
              aliases: g.data?.aliases || [],
            };
          }).sort((a, b) => b.techniqueCount - a.techniqueCount);
        }

        // ── 2. Recommended detections from MatchResult ──
        let allMatchingDetections: RecommendedDetection[] = [];

        if (matchResult && matchResult.matchedDetections.length > 0) {
          // Build crown jewel patterns once for the entire scoring loop
          const crownJewelPatterns = buildCrownJewelPatterns(crownJewels);

          const matchedTechIds = new Set<string>();

          for (const d of matchResult.matchedDetections) {
            const ids = d.mitreAttackIds || [];
            for (const id of ids) if (id) matchedTechIds.add(id);

            // Find which threat groups use this technique
            const matchedGroupNames: string[] = [];
            for (const [gStix, gTechs] of groupTechMap) {
              if (ids.some(id => gTechs.has(id))) {
                const group = threatGroups.find(g => g.stixId === gStix);
                if (group) matchedGroupNames.push(group.name);
              }
            }

            // Compute priority score via the extracted engine
            const result = computePriorityScore(
              {
                name: d.name,
                severity: d.severity,
                confidence: d.confidence,
                queryLanguage: d.queryLanguage,
                qualityScore: d.qualityScore ?? 0,
                testedAndValidated: d.testedAndValidated ?? false,
              },
              {
                userQueryLanguages,
                crownJewels,
                crownJewelPatterns,
                matchedGroupNames,
              },
            );

            allMatchingDetections.push({
              id: d.id,
              name: d.name,
              severity: d.severity,
              confidence: d.confidence,
              mitreTechniques: d.mitreTechniques || [],
              mitreAttackIds: ids,
              queryLanguage: d.queryLanguage,
              threatGroupNames: matchedGroupNames,
              siemReady: result.siemReady,
              priorityScore: result.score,
              priorityBreakdown: result.breakdown,
              status: d.status,
              qualityScore: d.qualityScore ?? 0,
              testedAndValidated: d.testedAndValidated ?? false,
              crownJewelMatch: result.crownJewelMatch,
            });
          }

          allMatchingDetections.sort((a, b) => b.priorityScore - a.priorityScore);

          // Fill detection counts + covered technique counts on threat groups
          for (const group of threatGroups) {
            const gTechs = groupTechMap.get(group.stixId);
            if (!gTechs) continue;
            const coveredTechIds = new Set<string>();
            let detCount = 0;
            for (const d of allMatchingDetections) {
              const hits = d.mitreAttackIds.filter(id => gTechs.has(id));
              if (hits.length > 0) {
                detCount++;
                hits.forEach(id => coveredTechIds.add(id));
              }
            }
            group.detectionCount = detCount;
            group.coveredTechniqueCount = coveredTechIds.size;
          }

          // ── 3. Gap techniques ──
          // Techniques used by threat groups targeting profile, but no detection in matched set
          if (mitreToName.size === 0 && groupTechniqueIds.size > 0) {
            const techObjs = await fetchAllRows<{ mitre_id: string; name: string }>(
              'mitre_objects', 'mitre_id, name',
              [{ column: 'type', value: 'attack-pattern' }]
            );
            if (runId !== abortRef.current) return;
            for (const t of techObjs) if (t.mitre_id) mitreToName.set(t.mitre_id, t.name);
          }

          const gapIds = Array.from(groupTechniqueIds).filter(id => !matchedTechIds.has(id));
          const stixIdToName = new Map<string, string>();
          for (const g of threatGroups) stixIdToName.set(g.stixId, g.name);
          const gapTechniques: GapTechnique[] = gapIds.map(id => {
            const tgNames: string[] = [];
            for (const [stixId, gTechs] of groupTechMap) {
              if (gTechs.has(id)) {
                const name = stixIdToName.get(stixId);
                if (name) tgNames.push(name);
              }
            }
            return {
              mitreId: id,
              name: mitreToName.get(id) || id,
              threatGroupCount: tgNames.length,
              threatGroupNames: tgNames,
              siemDetectable: isSiemDetectable(id),
            };
          }).sort((a, b) => b.threatGroupCount - a.threatGroupCount);

          // ── 4. SIEM readiness ──
          const sigmaCount = allMatchingDetections.filter(d => d.queryLanguage === 'Sigma').length;
          const siemReadiness: SiemReadiness[] = siemPlatforms.map(platform => {
            const langs = SIEM_TO_QUERY_LANGUAGES[platform] || [];
            const native = allMatchingDetections.filter(d => langs.includes(d.queryLanguage)).length;
            return { platform, nativeCount: native, sigmaCount, queryLanguages: langs };
          });

          if (runId !== abortRef.current) return;

          // ── 5. Build group technique details for expandable UI ──
          const groupTechniqueDetails: Record<string, GroupTechniqueDetail[]> = {};
          // Build a map of mitreId → first matching detection ID for "covered" link
          const techToDetectionId = new Map<string, string>();
          for (const d of allMatchingDetections) {
            for (const id of d.mitreAttackIds) {
              if (id && !techToDetectionId.has(id)) techToDetectionId.set(id, d.id);
            }
          }
          for (const group of threatGroups) {
            const gTechs = groupTechMap.get(group.stixId);
            if (!gTechs) { groupTechniqueDetails[group.stixId] = []; continue; }
            groupTechniqueDetails[group.stixId] = Array.from(gTechs).map(mid => ({
              mitreId: mid,
              name: mitreToName.get(mid) || mid,
              covered: matchedTechIds.has(mid),
              detectionId: techToDetectionId.get(mid),
            })).sort((a, b) => (a.covered === b.covered ? 0 : a.covered ? 1 : -1));
          }

          // ── 6. Build tactic-level threat coverage for MITRE matrix ──
          const tacticThreatCoverage = buildTacticThreatCoverage(
            groupTechniqueIds, matchedTechIds, mitreToName, mitreIdToTactics, groupTechMap
          );

          setState({
            threatGroups,
            recommendedDetections: allMatchingDetections,
            gapTechniques,
            gapTechniqueCount: gapTechniques.length,
            siemReadiness,
            totalRecommended: allMatchingDetections.length,
            groupTechniqueDetails,
            tacticThreatCoverage,
            loading: false,
            error: null,
          });
        } else {
          // No match result — just show threat groups (still build details)
          const groupTechniqueDetails: Record<string, GroupTechniqueDetail[]> = {};
          for (const group of threatGroups) {
            const gTechs = groupTechMap.get(group.stixId);
            if (!gTechs) { groupTechniqueDetails[group.stixId] = []; continue; }
            groupTechniqueDetails[group.stixId] = Array.from(gTechs).map(mid => ({
              mitreId: mid,
              name: mitreToName.get(mid) || mid,
              covered: false,
            }));
          }
          // Build tactic coverage even without match result (all techniques as uncovered)
          const tacticThreatCoverage = buildTacticThreatCoverage(
            groupTechniqueIds, new Set(), mitreToName, mitreIdToTactics, groupTechMap
          );

          setState({
            threatGroups,
            recommendedDetections: [],
            gapTechniques: [],
            gapTechniqueCount: 0,
            siemReadiness: [],
            totalRecommended: 0,
            groupTechniqueDetails,
            tacticThreatCoverage,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (runId !== abortRef.current) return;
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Intelligence computation failed',
        }));
      }
    })();
  }, [
    JSON.stringify(sectors),
    JSON.stringify(siemPlatforms),
    matchResult?.matchedDetections.length,
    matchResult?.feasibleTechniqueIds.length,
    userCountry,
    JSON.stringify(threatOriginCountries),
    JSON.stringify(crownJewels),
  ]);

  return state;
}
