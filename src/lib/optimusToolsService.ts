/**
 * Optimus Tools Service
 * Frontend service for invoking Optimus Prime's token-optimized tools
 */

import { logger } from './logger';
import { supabase } from './supabaseClient';

// =============================================================================
// TYPES
// =============================================================================

export interface SearchLibraryParams {
  query: string;
  filters?: {
    status?: string;
    severity?: string;
    tactics?: string[];
  };
  limit?: number;
}

export interface SearchLibraryResult {
  total: number;
  query: string;
  results: Array<{
    id: string;
    name: string;
    description: string;
    mitreIds: string[];
    status: string;
    severity?: string;
    similarity: number;
  }>;
  relatedTechniques: string[];
}

export interface CoverageSummary {
  summary: {
    total_techniques: number;
    covered_techniques: number;
    coverage_percent: number;
    total_detections: number;
    production_detections: number;
  };
  by_tactic: Array<{
    tactic_name: string;
    total_techniques: number;
    covered_techniques: number;
    coverage_percent: number;
  }>;
  top_covered: Array<{
    technique_id: string;
    technique_name: string;
    detection_count: number;
  }>;
  critical_gaps: Array<{
    technique_id: string;
    technique_name: string;
    tactic: string;
  }>;
}

export interface ThreatActorMatch {
  stix_id: string;
  mitre_id: string;
  name: string;
  aliases: string[];
  origin_country?: string;
  target_sectors?: string[];
  match_type: string;
}

export interface FindThreatActorResult {
  found: boolean;
  query: string;
  matches: ThreatActorMatch[];
  search_tips?: string[];
}

export interface ThreatActorCoverage {
  actor: {
    name: string;
    mitreId: string;
    aliases: string[];
    stixId: string;
    originCountry?: string;
    targetSectors?: string[];
  };
  coverage: {
    total: number;
    covered: number;
    percent: number;
  };
  covered: Array<{
    technique_id: string;
    technique_name: string;
    detection_count: number;
  }>;
  criticalGaps: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  recommendation: string;
}

export interface GapAnalysisResult {
  profile: string;
  total_techniques: number;
  covered_techniques: number;
  coverage_percent: number;
  gaps: Array<{
    technique_id: string;
    technique_name: string;
    tactic?: string;
  }>;
  covered: Array<{
    technique_id: string;
    technique_name: string;
    detection_count: number;
  }>;
  recommendation: string;
}

export interface MitreQueryResult {
  query: string;
  entityType: string;
  total: number;
  results: Array<{
    stixId: string;
    mitreId: string;
    name: string;
    type: string;
    description: string;
    aliases: string[];
  }>;
  relationships?: Array<{
    type: string;
    source: string;
    target: string;
  }>;
}

export interface NavigatorLayerResult {
  layer: any;
  downloadUrl: string | null;
  stats: {
    totalTechniques: number;
    coveredTechniques: number;
    coveragePercent: number;
  };
}

// =============================================================================
// TOOL INVOCATION
// =============================================================================

async function invokeTool<T>(tool: string, params: Record<string, any> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.functions.invoke('optimus-tools', {
    body: { tool, params }
  });

  if (error) {
    logger.error(`Tool ${tool} error:`, error);
    throw new Error(error.message || `Tool ${tool} failed`);
  }

  return data;
}

// =============================================================================
// TOOL FUNCTIONS
// =============================================================================

/**
 * Search the detection library using hybrid semantic + keyword search
 * Understands security concepts: "credential stealing" → Credential Access techniques
 */
export async function searchLibrary(params: SearchLibraryParams): Promise<SearchLibraryResult> {
  return invokeTool<SearchLibraryResult>('search_library', params);
}

/**
 * Get high-level coverage statistics
 * Returns aggregated metrics, not individual detections
 */
export async function getCoverageSummary(params: { scope?: string; platform?: string } = {}): Promise<CoverageSummary> {
  return invokeTool<CoverageSummary>('get_coverage_summary', params);
}

/**
 * Find threat actor by name, alias, or MITRE Group ID
 * Supports: "Scattered Spider", "UNC3944", "G1015", "Cozy Bear", etc.
 */
export async function findThreatActor(query: string): Promise<FindThreatActorResult> {
  return invokeTool<FindThreatActorResult>('find_threat_actor', { query });
}

/**
 * Get coverage analysis against a specific threat actor
 * Returns coverage percentage, covered techniques, and critical gaps
 */
export async function getThreatActorCoverage(actorQuery: string): Promise<ThreatActorCoverage> {
  return invokeTool<ThreatActorCoverage>('get_threat_actor_coverage', { actor_query: actorQuery });
}

/**
 * Identify coverage gaps against threat profiles
 * Profiles: ransomware, apt, initial_access, persistence, credential_access,
 *           defense_evasion, lateral_movement, exfiltration, impact
 */
export async function identifyCoverageGaps(
  profile: string,
  customTechniques?: string[]
): Promise<GapAnalysisResult> {
  return invokeTool<GapAnalysisResult>('identify_coverage_gaps', {
    profile,
    custom_techniques: customTechniques
  });
}

/**
 * Query MITRE ATT&CK database for techniques, groups, software, or campaigns
 */
export async function queryMitre(params: {
  query: string;
  entityType?: 'technique' | 'group' | 'software' | 'campaign' | 'any';
  includeRelationships?: boolean;
}): Promise<MitreQueryResult> {
  return invokeTool<MitreQueryResult>('query_mitre', {
    query: params.query,
    entity_type: params.entityType || 'any',
    include_relationships: params.includeRelationships || false
  });
}

/**
 * Generate MITRE ATT&CK Navigator layer JSON for current coverage
 */
export async function generateNavigatorLayer(params: {
  name?: string;
  scope?: 'all' | 'threat_actor' | 'tactic' | 'platform';
  filterValue?: string;
} = {}): Promise<NavigatorLayerResult> {
  return invokeTool<NavigatorLayerResult>('generate_navigator_layer', {
    name: params.name,
    scope: params.scope,
    filter_value: params.filterValue
  });
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick check if we have coverage for a specific technique
 */
export async function hasCoverage(techniqueId: string): Promise<boolean> {
  const result = await searchLibrary({ query: techniqueId, limit: 1 });
  return result.total > 0 && result.results.some(r => r.mitreIds.includes(techniqueId));
}

/**
 * Get coverage for multiple techniques at once
 */
export async function getCoverageForTechniques(techniqueIds: string[]): Promise<Map<string, number>> {
  const coverageMap = new Map<string, number>();

  // Initialize all as 0
  techniqueIds.forEach(id => coverageMap.set(id, 0));

  // Search for all techniques
  const result = await searchLibrary({
    query: techniqueIds.join(' '),
    limit: 100
  });

  // Count detections per technique
  result.results.forEach(detection => {
    detection.mitreIds.forEach(id => {
      if (techniqueIds.includes(id)) {
        coverageMap.set(id, (coverageMap.get(id) || 0) + 1);
      }
    });
  });

  return coverageMap;
}

/**
 * Get top uncovered techniques for quick wins
 */
export async function getQuickWins(limit = 5): Promise<Array<{ id: string; name: string; tactic: string }>> {
  const summary = await getCoverageSummary();
  return summary.critical_gaps.slice(0, limit).map(gap => ({
    id: gap.technique_id,
    name: gap.technique_name,
    tactic: gap.tactic
  }));
}

export default {
  searchLibrary,
  getCoverageSummary,
  findThreatActor,
  getThreatActorCoverage,
  identifyCoverageGaps,
  queryMitre,
  generateNavigatorLayer,
  hasCoverage,
  getCoverageForTechniques,
  getQuickWins
};
