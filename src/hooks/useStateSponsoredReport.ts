import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  StateSponsoredReport,
  StateSponsoredGroup,
  TechniqueWithGroups,
  TacticCoverage,
  ReportDetection,
  ReportGap,
  ReportSoftware,
  ReportCampaign,
  RiskRating,
  ReportFilters,
  FilterOptions,
  FilterOption,
  COUNTRY_CONFIG,
  hasActiveFilters,
  describeFilters,
} from '../components/exercises/types';

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// ---- Raw group shape from Supabase ----
interface RawGroup {
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
  updated_at?: string;
}

interface PaginatedQuery {
  range(from: number, to: number): PromiseLike<{ data: unknown; error: unknown }>;
}

// ---- Paginated fetch helper (Supabase defaults to 1000 rows) ----
async function fetchAllRows<T>(
  query: () => PaginatedQuery,
  pageSize = 1000,
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    allRows.push(...rows);
    hasMore = rows.length === pageSize;
    offset += pageSize;
  }

  return allRows;
}

export function useStateSponsoredReport(filters: ReportFilters) {
  // ---- All groups (fetched once for filter options) ----
  const [allGroups, setAllGroups] = useState<RawGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupsError, setGroupsError] = useState<Error | null>(null);

  // ---- Report (built only on explicit run()) ----
  const [report, setReport] = useState<StateSponsoredReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const filtersRef = useRef(filters);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filtersKey]);

  // ---- Step 1: Load all groups once on mount (lightweight — for filter options only) ----
  useEffect(() => {
    loadAllGroups();
  }, []);

  async function loadAllGroups() {
    try {
      const { data, error: err } = await supabase
        .from('v_mitre_groups_with_stats')
        .select('*')
        .eq('deprecated', false);
      if (err) throw err;
      setAllGroups((data || []) as RawGroup[]);
      setGroupsLoaded(true);
    } catch (err) {
      setGroupsError(toError(err));
      setGroupsLoaded(true);
    }
  }

  // ---- Step 2: Extract filter options from all groups ----
  const filterOptions = useMemo<FilterOptions>(() => {
    const originMap = new Map<string, number>();
    const targetCountryMap = new Map<string, number>();
    const sectorMap = new Map<string, number>();
    const activityMap = new Map<string, number>();

    for (const g of allGroups) {
      const ti = g.data?.targeting_intel;
      if (!ti) continue;

      if (ti.origin_country_code) {
        originMap.set(ti.origin_country_code, (originMap.get(ti.origin_country_code) || 0) + 1);
      }
      if (ti.target_countries) {
        for (const c of ti.target_countries) {
          targetCountryMap.set(c, (targetCountryMap.get(c) || 0) + 1);
        }
      }
      if (ti.target_sectors) {
        for (const s of ti.target_sectors) {
          sectorMap.set(s, (sectorMap.get(s) || 0) + 1);
        }
      }
      if (ti.activity_type) {
        activityMap.set(ti.activity_type, (activityMap.get(ti.activity_type) || 0) + 1);
      }
    }

    const toOptions = (map: Map<string, number>, labelFn?: (key: string) => string, flagFn?: (key: string) => string | undefined): FilterOption[] =>
      [...map.entries()]
        .map(([value, count]) => ({
          value,
          label: labelFn ? labelFn(value) : value,
          count,
          flag: flagFn ? flagFn(value) : undefined,
        }))
        .sort((a, b) => b.count - a.count);

    return {
      originCountries: toOptions(
        originMap,
        code => COUNTRY_CONFIG[code]?.name || code,
        code => COUNTRY_CONFIG[code]?.flag,
      ),
      targetCountries: toOptions(targetCountryMap),
      targetSectors: toOptions(sectorMap),
      activityTypes: toOptions(activityMap),
    };
  }, [allGroups]);

  // ---- Step 3: Filter groups client-side ----
  const filteredGroups = useMemo(() => {
    if (!hasActiveFilters(filters)) return allGroups.filter(g => g.data?.targeting_intel);

    return allGroups.filter(g => {
      const ti = g.data?.targeting_intel;
      if (!ti) return false;

      if (filters.originCountries.length > 0 && !filters.originCountries.includes(ti.origin_country_code)) {
        return false;
      }
      if (filters.targetCountries.length > 0) {
        const targets: string[] = ti.target_countries || [];
        if (!filters.targetCountries.some((c: string) => targets.includes(c))) return false;
      }
      if (filters.targetSectors.length > 0) {
        const sectors: string[] = ti.target_sectors || [];
        if (!filters.targetSectors.some((s: string) => sectors.includes(s))) return false;
      }
      if (filters.activityTypes.length > 0 && !filters.activityTypes.includes(ti.activity_type)) {
        return false;
      }
      return true;
    });
  }, [allGroups, filtersKey]);

  // ---- Step 4: Build report — only called explicitly via run() ----
  const buildReport = useCallback(async () => {
    const currentFilters = filtersRef.current;

    if (currentFilters.originCountries.length === 0) {
      setError(new Error('Please select at least one origin country.'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const countryGroups = filteredGroups;

      if (countryGroups.length === 0) {
        setReport({
          filterDescription: describeFilters(currentFilters),
          activeFilters: { ...currentFilters },
          generatedAt: new Date(),
          groups: [],
          allTechniques: [],
          coveredTechniqueIds: new Set(),
          uncoveredTechniqueIds: new Set(),
          coveragePercent: 0,
          riskRating: 'Low',
          tacticBreakdown: [],
          relatedDetections: [],
          gaps: [],
          software: [],
          campaigns: [],
          targetSectors: [],
          targetCountries: [],
        });
        setLoading(false);
        return;
      }

      const groupStixIds = countryGroups.map(g => g.stix_id);
      const groupNameMap = new Map(countryGroups.map(g => [g.stix_id, g.name]));

      // 2. Fetch TAW scores
      const { data: tawData } = await supabase
        .from('mv_threat_actor_weights')
        .select('stix_id, taw')
        .in('stix_id', groupStixIds);
      const tawMap = new Map((tawData || []).map((t: any) => [t.stix_id, t.taw]));

      // 3. Fetch ALL 'uses' relationships from these groups (attack-patterns + malware/tools)
      const { data: groupTechRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref, target_ref')
        .in('source_ref', groupStixIds)
        .eq('relationship_type', 'uses');

      // Separate attack-pattern targets from software (malware/tool) targets
      const techStixIds = [...new Set((groupTechRels || [])
        .map((r: any) => r.target_ref)
        .filter((ref: string) => ref.startsWith('attack-pattern--')))];

      const swStixIds = [...new Set((groupTechRels || [])
        .map((r: any) => r.target_ref)
        .filter((ref: string) => ref.startsWith('malware--') || ref.startsWith('tool--')))];

      const groupTechMap = new Map<string, Set<string>>();
      for (const rel of (groupTechRels || [])) {
        if (!rel.target_ref.startsWith('attack-pattern--')) continue;
        if (!groupTechMap.has(rel.target_ref)) groupTechMap.set(rel.target_ref, new Set());
        groupTechMap.get(rel.target_ref)!.add(rel.source_ref);
      }

      // 4. Fetch technique details
      let techniques: any[] = [];
      if (techStixIds.length > 0) {
        const { data: techData } = await supabase
          .from('mitre_objects')
          .select('stix_id, mitre_id, name, data')
          .in('stix_id', techStixIds)
          .eq('type', 'attack-pattern')
          .eq('deprecated', false);
        techniques = techData || [];
      }

      // 5. Fetch coverage stats (paginated — can exceed 1000)
      const coverageData = await fetchAllRows<any>(
        () => supabase.from('mv_coverage_stats').select('technique_id, detection_count, is_covered'),
      );
      const coverageMap = new Map(coverageData.map((c: any) => [c.technique_id, c]));

      // ================================================================
      // 6. SOFTWARE & CAMPAIGN NAME FETCHES (moved before detections for keyword corpus)
      // ================================================================

      // 6a. Software names
      let softwareNames: string[] = [];
      let swData: any[] = [];
      if (swStixIds.length > 0) {
        const { data: swResult } = await supabase
          .from('mitre_objects')
          .select('id, stix_id, mitre_id, name, type')
          .in('stix_id', swStixIds);
        swData = swResult || [];
        softwareNames = swData.map((sw: any) => sw.name).filter(Boolean);
      }

      // 6b. Campaign names
      const { data: campRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref, target_ref')
        .in('target_ref', groupStixIds)
        .eq('relationship_type', 'attributed-to');

      const campStixIds = [...new Set((campRels || []).map((r: any) => r.source_ref)
        .filter((ref: string) => ref.startsWith('campaign--')))];

      let campData: any[] = [];
      let campaignNames: string[] = [];
      if (campStixIds.length > 0) {
        const { data: campResult } = await supabase
          .from('mitre_objects')
          .select('id, stix_id, name, data')
          .in('stix_id', campStixIds)
          .eq('type', 'campaign');
        campData = campResult || [];
        campaignNames = campData.map((c: any) => c.name).filter(Boolean);
      }

      // ================================================================
      // 7. BUILD KEYWORD CORPUS
      // ================================================================
      const keywordCorpus: { keyword: string; source: string }[] = [];

      // Group names, aliases, vendor names
      for (const g of countryGroups) {
        keywordCorpus.push({ keyword: g.name, source: `group:${g.name}` });
        const aliases: string[] = g.data?.aliases || [];
        for (const alias of aliases) {
          keywordCorpus.push({ keyword: alias, source: `alias:${g.name}` });
        }
        const vendorNames = g.data?.targeting_intel?.vendor_names;
        if (vendorNames && typeof vendorNames === 'object') {
          for (const [vendor, vName] of Object.entries(vendorNames)) {
            if (typeof vName === 'string' && vName) {
              keywordCorpus.push({ keyword: vName, source: `vendor:${vendor}` });
            }
          }
        }
      }

      // Software names
      for (const name of softwareNames) {
        keywordCorpus.push({ keyword: name, source: 'software' });
      }

      // Campaign names
      for (const name of campaignNames) {
        keywordCorpus.push({ keyword: name, source: 'campaign' });
      }

      // Filter out keywords shorter than 3 characters to avoid false positives
      const filteredCorpus = keywordCorpus.filter(k => k.keyword.length >= 3);

      // Deduplicate keywords (case-insensitive) keeping first occurrence
      const seenKeywords = new Set<string>();
      const dedupedCorpus: { keyword: string; source: string }[] = [];
      for (const entry of filteredCorpus) {
        const lower = entry.keyword.toLowerCase();
        if (!seenKeywords.has(lower)) {
          seenKeywords.add(lower);
          dedupedCorpus.push(entry);
        }
      }

      const tagKeywords = dedupedCorpus.map(k => k.keyword);

      // ================================================================
      // 8. DUAL-QUERY DETECTION FETCH
      // ================================================================
      const techniqueIds = techniques.map((t: any) => t.mitre_id).filter(Boolean);
      const techniqueIdSet = new Set(techniqueIds);

      // tags is fetched for attribution classification but not carried into ReportDetection output
      const detectionSelectFields = 'id, name, source, "queryLanguage", status, severity, "qualityScore", "mitreAttackIds", tags, external_id, source_url';

      // Run both detection queries in parallel
      const [techniqueDetectionsRaw, tagDetectionsRaw] = await Promise.all([
        // Query 1: Technique overlap (existing, modified to include tags)
        techniqueIds.length > 0
          ? fetchAllRows<any>(
              () => supabase.from('detections')
                .select(detectionSelectFields)
                .overlaps('mitreAttackIds', techniqueIds),
            )
          : Promise.resolve([]),
        // Query 2: Tag overlap for direct matches
        tagKeywords.length > 0
          ? fetchAllRows<any>(
              () => supabase.from('detections')
                .select(detectionSelectFields)
                .overlaps('tags', tagKeywords),
            )
          : Promise.resolve([]),
      ]);

      // Track which detection IDs came from which query
      const techniqueDetectionIds = new Set(techniqueDetectionsRaw.map((d: any) => d.id));
      const tagDetectionIds = new Set(tagDetectionsRaw.map((d: any) => d.id));

      // Merge and deduplicate by id
      const allDetectionsMap = new Map<string, any>();
      for (const det of techniqueDetectionsRaw) {
        allDetectionsMap.set(det.id, det);
      }
      for (const det of tagDetectionsRaw) {
        if (!allDetectionsMap.has(det.id)) {
          allDetectionsMap.set(det.id, det);
        }
      }
      const mergedDetections = [...allDetectionsMap.values()];

      // ================================================================
      // 9. FETCH SCORING DATA (for relevance computation)
      // ================================================================

      // Build a lowercase keyword map for efficient lookups
      const keywordLookup = dedupedCorpus.map(k => ({
        keyword: k.keyword,
        keywordLower: k.keyword.toLowerCase(),
        source: k.source,
      }));

      // Fetch TIS data (with group_count), scoring snapshot, and group recency in parallel
      const [tisResult, snapshotResult, recencyResult] = await Promise.all([
        supabase
          .from('mv_technique_importance')
          .select('mitre_id, tis, group_count'),
        supabase
          .from('mitre_scoring_snapshot')
          .select('total_groups')
          .eq('is_active', true)
          .limit(1)
          .single(),
        supabase
          .from('v_group_recency')
          .select('stix_id, recency_multiplier')
          .in('stix_id', groupStixIds),
      ]);

      const tisMap = new Map((tisResult.data || []).map((t: any) => [t.mitre_id, { tis: t.tis as number, group_count: t.group_count as number }]));
      const totalGlobalGroups = (snapshotResult.data?.total_groups as number) || 1;
      const recencyMap = new Map((recencyResult.data || []).map((r: any) => [r.stix_id, r.recency_multiplier as number]));

      // Compute max TIS for normalization
      let maxTis = 0;
      for (const entry of tisMap.values()) {
        if (entry.tis > maxTis) maxTis = entry.tis;
      }
      if (maxTis === 0) maxTis = 1; // avoid division by zero

      const totalSelectedGroups = countryGroups.length;

      // Pre-build mitre_id → technique lookup for O(1) access in scoring loop
      const techniqueByMitreId = new Map(techniques.map((t: any) => [t.mitre_id, t]));

      // ================================================================
      // 10. ATTRIBUTION CLASSIFICATION & RELEVANCE SCORING
      // ================================================================
      const relatedDetections: ReportDetection[] = mergedDetections.map(det => {
        const detTags: string[] = (det.tags || []) as string[];
        const detName: string = det.name || '';
        const detNameLower = detName.toLowerCase();
        const detMitreIds: string[] = ((det.mitreAttackIds || []) as string[]);
        const matchedMitreIds = detMitreIds.filter(t => techniqueIdSet.has(t));

        const attributionReasons: string[] = [];

        // Check 1: Tag overlap — which tags matched keywords?
        if (tagDetectionIds.has(det.id) && detTags.length > 0) {
          const tagsLower = detTags.map(t => t.toLowerCase());
          for (const kw of keywordLookup) {
            if (tagsLower.includes(kw.keywordLower)) {
              attributionReasons.push(`tag:${kw.keyword} (${kw.source})`);
            }
          }
        }

        // Check 2: Client-side name matching
        for (const kw of keywordLookup) {
          // For short keywords (<=5 chars), use word-boundary matching
          if (kw.keyword.length <= 5) {
            const wordBoundaryRegex = new RegExp(`\\b${kw.keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (wordBoundaryRegex.test(detName)) {
              const reason = `name:${kw.keyword} (${kw.source})`;
              if (!attributionReasons.includes(reason)) {
                attributionReasons.push(reason);
              }
            }
          } else {
            // For longer keywords, case-insensitive substring
            if (detNameLower.includes(kw.keywordLower)) {
              const reason = `name:${kw.keyword} (${kw.source})`;
              if (!attributionReasons.includes(reason)) {
                attributionReasons.push(reason);
              }
            }
          }
        }

        // Determine attribution type and relevance score
        let attribution: 'direct' | 'indirect';
        let relevanceScore: number;

        if (attributionReasons.length > 0) {
          // Direct attribution: matched by name or tag
          attribution = 'direct';
          relevanceScore = 100;
        } else if (techniqueDetectionIds.has(det.id) && matchedMitreIds.length > 0) {
          // Indirect attribution: matched by technique overlap only
          attribution = 'indirect';

          // Compute relevance score per matched technique, take the best
          let bestScore = 0;
          for (const mitreId of matchedMitreIds) {
            // Find the technique's stix_id for groupTechMap lookup
            const techObj = techniqueByMitreId.get(mitreId);
            if (!techObj) continue;

            const groupsUsingTech = groupTechMap.get(techObj.stix_id);
            const numGroupsUsingTech = groupsUsingTech ? groupsUsingTech.size : 0;

            // Factor 1: Technique group frequency (0.30)
            const groupFrequency = totalSelectedGroups > 0
              ? numGroupsUsingTech / totalSelectedGroups
              : 0;

            // Factor 2: Technique specificity (0.25) — rarer globally = higher
            const tisEntry = tisMap.get(mitreId);
            const globalGroupCount = tisEntry?.group_count || 0;
            const techniqueSpecificity = 1 - (globalGroupCount / totalGlobalGroups);

            // Factor 3: Group recency (0.15) — max recency_multiplier of groups using this technique
            let maxRecency = 0;
            if (groupsUsingTech) {
              for (const gStixId of groupsUsingTech) {
                const recency = recencyMap.get(gStixId) || 0.6; // default per view
                if (recency > maxRecency) maxRecency = recency;
              }
            }
            // Normalize 0-1: (val - 0.4) / 0.9  (range is 0.4 to 1.3)
            const recencyNormalized = Math.max(0, Math.min(1, (maxRecency - 0.4) / 0.9));

            // Factor 4: TIS score (0.10)
            const tisScore = tisEntry?.tis || 0;
            const tisNormalized = tisScore / maxTis;

            // Factor 5: Technique depth (0.10) — sub-technique = 1.0, parent = 0.5
            const techniqueDepth = mitreId.includes('.') ? 1.0 : 0.5;

            // Factor 6: Detection specificity (0.10) — fewer matched techniques = more targeted
            const detectionSpecificity = matchedMitreIds.length > 0
              ? 1 / matchedMitreIds.length
              : 0;

            const score =
              (groupFrequency * 0.30) +
              (techniqueSpecificity * 0.25) +
              (recencyNormalized * 0.15) +
              (tisNormalized * 0.10) +
              (techniqueDepth * 0.10) +
              (detectionSpecificity * 0.10);

            if (score > bestScore) bestScore = score;
          }

          // Normalize to 0-100
          relevanceScore = Math.round(bestScore * 100);
        } else {
          // Tag-only match with no attribution reasons and no technique overlap
          // This shouldn't normally happen, but handle gracefully
          attribution = 'indirect';
          relevanceScore = 0;
        }

        return {
          id: det.id,
          name: detName,
          source: det.source || 'custom',
          queryLanguage: det.queryLanguage || 'Unknown',
          mitreAttackIds: matchedMitreIds, // only techniques overlapping with selected groups
          status: det.status || 'Draft',
          severity: det.severity || 'Medium',
          qualityScore: det.qualityScore || 0,
          attribution,
          attributionReasons,
          relevanceScore,
          externalId: det.external_id || null,
          sourceUrl: det.source_url || null,
        };
      });

      // Sort: direct first, then by relevance descending, then by quality descending
      relatedDetections.sort((a, b) => {
        // Direct before indirect
        if (a.attribution !== b.attribution) {
          return a.attribution === 'direct' ? -1 : 1;
        }
        // Then by relevance descending
        if (a.relevanceScore !== b.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        // Then by quality descending
        return b.qualityScore - a.qualityScore;
      });

      // ================================================================
      // 11. BUILD TECHNIQUE LIST
      // ================================================================
      const allTechniques: TechniqueWithGroups[] = techniques.map((t: any) => {
        const cov = coverageMap.get(t.mitre_id);
        const groupStixs = groupTechMap.get(t.stix_id);
        const groupNames = groupStixs
          ? [...groupStixs].map(s => groupNameMap.get(s) || 'Unknown').filter(Boolean)
          : [];
        const phases = t.data?.kill_chain_phases || [];
        const tactics = phases
          .filter((p: any) => p.kill_chain_name === 'mitre-attack')
          .map((p: any) => p.phase_name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));

        return {
          mitreId: t.mitre_id,
          name: t.name,
          tactics,
          groupNames,
          detectionCount: cov?.detection_count || 0,
          isCovered: cov?.is_covered || false,
        };
      });

      const coveredIds = new Set(allTechniques.filter(t => t.isCovered).map(t => t.mitreId));
      const uncoveredIds = new Set(allTechniques.filter(t => !t.isCovered).map(t => t.mitreId));
      const coveragePercent = allTechniques.length > 0
        ? Math.round((coveredIds.size / allTechniques.length) * 100) : 0;

      // 12. Tactic breakdown
      const tacticMap = new Map<string, { total: number; covered: number }>();
      for (const tech of allTechniques) {
        for (const tactic of tech.tactics) {
          if (!tacticMap.has(tactic)) tacticMap.set(tactic, { total: 0, covered: 0 });
          const entry = tacticMap.get(tactic)!;
          entry.total++;
          if (tech.isCovered) entry.covered++;
        }
      }
      const tacticBreakdown: TacticCoverage[] = [...tacticMap.entries()]
        .map(([tactic, data]) => ({
          tactic,
          totalTechniques: data.total,
          coveredTechniques: data.covered,
          coveragePercent: data.total > 0 ? Math.round((data.covered / data.total) * 100) : 0,
        }))
        .sort((a, b) => a.coveragePercent - b.coveragePercent);

      // 13. Gap analysis (uses tisMap fetched earlier)
      const gaps: ReportGap[] = allTechniques
        .filter(t => !t.isCovered)
        .map(t => ({
          techniqueId: t.mitreId,
          techniqueName: t.name,
          tactic: t.tactics[0] || 'Unknown',
          groupCount: t.groupNames.length,
          tisScore: tisMap.get(t.mitreId)?.tis || 0,
          priority: (tisMap.get(t.mitreId)?.tis || 0) * t.groupNames.length,
        }))
        .sort((a, b) => b.priority - a.priority);

      // 14. Software (use already-fetched swData and groupTechRels)
      const swStixIdSet = new Set(swStixIds);
      const swGroupCount = new Map<string, number>();
      for (const rel of (groupTechRels || [])) {
        if (swStixIdSet.has(rel.target_ref)) {
          swGroupCount.set(rel.target_ref, (swGroupCount.get(rel.target_ref) || 0) + 1);
        }
      }

      let softwareList: ReportSoftware[] = [];
      if (swStixIds.length > 0) {
        const { data: swTechRels } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref')
          .in('source_ref', swStixIds)
          .eq('relationship_type', 'uses');
        const swTechCount = new Map<string, number>();
        for (const rel of (swTechRels || [])) {
          if (rel.target_ref.startsWith('attack-pattern--')) {
            swTechCount.set(rel.source_ref, (swTechCount.get(rel.source_ref) || 0) + 1);
          }
        }

        softwareList = swData.map((sw: any) => ({
          id: sw.id,
          stixId: sw.stix_id,
          mitreId: sw.mitre_id || '',
          name: sw.name,
          type: sw.type === 'malware' ? 'Malware' : 'Tool',
          groupCount: swGroupCount.get(sw.stix_id) || 0,
          techniqueCount: swTechCount.get(sw.stix_id) || 0,
        })).sort((a, b) => b.groupCount - a.groupCount);
      }

      // 15. Campaigns (use already-fetched campData and campRels)
      let campaignsList: ReportCampaign[] = [];
      if (campStixIds.length > 0) {
        const campGroupMap = new Map<string, string>();
        for (const rel of (campRels || [])) {
          const groupName = groupNameMap.get(rel.target_ref);
          if (groupName) campGroupMap.set(rel.source_ref, groupName);
        }

        const { data: campTechRels } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref')
          .in('source_ref', campStixIds)
          .eq('relationship_type', 'uses');
        const campTechCount = new Map<string, number>();
        for (const rel of (campTechRels || [])) {
          if (rel.target_ref.startsWith('attack-pattern--')) {
            campTechCount.set(rel.source_ref, (campTechCount.get(rel.source_ref) || 0) + 1);
          }
        }

        campaignsList = campData.map((c: any) => ({
          id: c.id,
          stixId: c.stix_id,
          name: c.name,
          firstSeen: c.data?.first_seen || null,
          lastSeen: c.data?.last_seen || null,
          techniqueCount: campTechCount.get(c.stix_id) || 0,
          attributedGroup: campGroupMap.get(c.stix_id) || null,
        })).sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
      }

      // 16. Targeting aggregation
      const sectorCounts = new Map<string, number>();
      const countryCounts = new Map<string, number>();
      for (const g of countryGroups) {
        const ti = g.data?.targeting_intel;
        if (ti?.target_sectors) {
          for (const s of ti.target_sectors) sectorCounts.set(s, (sectorCounts.get(s) || 0) + 1);
        }
        if (ti?.target_countries) {
          for (const c of ti.target_countries) countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
        }
      }

      // 17. Build groups with coverage
      const groupTechCounts = new Map<string, { total: number; covered: number }>();
      for (const rel of (groupTechRels || [])) {
        if (!rel.target_ref.startsWith('attack-pattern--')) continue;
        if (!groupTechCounts.has(rel.source_ref)) groupTechCounts.set(rel.source_ref, { total: 0, covered: 0 });
        const entry = groupTechCounts.get(rel.source_ref)!;
        entry.total++;
        const techObj = techniques.find((t: any) => t.stix_id === rel.target_ref);
        if (techObj && coverageMap.get(techObj.mitre_id)?.is_covered) entry.covered++;
      }

      const groups: StateSponsoredGroup[] = countryGroups.map(g => {
        const ti = g.data?.targeting_intel;
        const techStats = groupTechCounts.get(g.stix_id) || { total: 0, covered: 0 };
        return {
          id: g.id,
          stixId: g.stix_id,
          mitreId: g.mitre_id,
          name: g.name,
          aliases: g.data?.aliases || [],
          vendorNames: {
            microsoft: ti?.vendor_names?.microsoft,
            crowdstrike: ti?.vendor_names?.crowdstrike,
          },
          activityType: ti?.activity_type || null,
          techniqueCount: g.technique_count || techStats.total,
          coveragePercent: techStats.total > 0
            ? Math.round((techStats.covered / techStats.total) * 100) : 0,
          taw: tawMap.get(g.stix_id) || 0,
          lastModified: g.data?.modified || g.updated_at || '',
        };
      }).sort((a, b) => b.taw - a.taw);

      // 18. Risk rating
      const avgTaw = groups.length > 0
        ? groups.reduce((s, g) => s + g.taw, 0) / groups.length : 0;
      const gapPercent = 100 - coveragePercent;

      let riskRating: RiskRating = 'Low';
      if (avgTaw > 0.7 && gapPercent > 50) riskRating = 'Critical';
      else if (avgTaw > 0.5 || gapPercent > 40) riskRating = 'High';
      else if (avgTaw > 0.3 || gapPercent > 25) riskRating = 'Medium';

      setReport({
        filterDescription: describeFilters(currentFilters),
        activeFilters: { ...currentFilters },
        generatedAt: new Date(),
        groups,
        allTechniques,
        coveredTechniqueIds: coveredIds,
        uncoveredTechniqueIds: uncoveredIds,
        coveragePercent,
        riskRating,
        tacticBreakdown,
        relatedDetections,
        gaps,
        software: softwareList,
        campaigns: campaignsList,
        targetSectors: [...sectorCounts.entries()]
          .map(([sector, count]) => ({ sector, count }))
          .sort((a, b) => b.count - a.count),
        targetCountries: [...countryCounts.entries()]
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count),
      });
    } catch (err) {
      setError(toError(err));
    } finally {
      setLoading(false);
    }
  }, [filteredGroups, filtersKey]);

  return {
    report,
    loading,
    groupsLoading: !groupsLoaded,
    error: groupsError || error,
    filterOptions,
    run: buildReport,
  };
}
