/**
 * Optimus Prime Response Types
 * Types for structured AI responses and UI components
 */

// =============================================================================
// RESPONSE TYPES
// =============================================================================

export type OptimusResponseType =
  | 'coverage_report'
  | 'coverage'
  | 'threat_actor'
  | 'search_results'
  | 'gap_analysis'
  | 'navigator_layer'
  | 'technique_info'
  | 'draft'
  | 'text'
  | 'error';

export interface OptimusResponse {
  // Text is now REQUIRED - always render this first
  text: string;

  // Visualization is OPTIONAL - render after text if present
  visualization?: {
    type: OptimusVisualizationType;
    data: any;
  };

  // Actions are OPTIONAL
  actions?: OptimusAction[];

  // Legacy fields for backward compatibility
  type?: OptimusResponseType;
  summary?: string;
  data?: any;
  sources?: OptimusSource[];
}

export type OptimusVisualizationType =
  | 'coverage'
  | 'threat_actor'
  | 'search_results'
  | 'gap_analysis'
  | 'technique'
  | 'navigator_layer';

export interface OptimusAction {
  label: string;
  type: 'navigate' | 'draft' | 'search' | 'export' | 'expand';
  payload: Record<string, any>;
}

export interface OptimusSource {
  title: string;
  url?: string;
  type: 'mitre' | 'web' | 'library';
}

// =============================================================================
// THREE-TIER COVERAGE MODEL
// =============================================================================

export interface TierData {
  count: number;
  percent: number;
  techniques: TechniqueInfo[];
}

export interface TechniqueInfo {
  id: string;
  name: string;
  detectionCount?: number;
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

// =============================================================================
// COVERAGE REPORT DATA
// =============================================================================

export interface CoverageReportData {
  title?: string;
  total: number;

  // Three-tier coverage model (library_type-based, current)
  production: TierData;
  development?: TierData;      // NEW — replaces inLibrary semantically
  gaps: TierData;

  // Legacy field — edge function may still return `inLibrary` during transition.
  // Cards read `development ?? inLibrary`.
  inLibrary?: TierData;

  // Legacy fields for backward compatibility
  overall?: {
    total: number;
    covered: number;
    percent: number;
  };
  byTactic?: TacticCoverage[];
  topCovered?: TechniqueCount[];
  criticalGaps?: TechniqueGap[];
}

export interface TacticCoverage {
  tactic: string;
  total: number;
  covered: number;
  percent: number;
}

export interface TechniqueCount {
  id: string;
  name: string;
  detectionCount: number;
}

export interface TechniqueGap {
  id: string;
  name: string;
  tactic?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  reason?: string;
}

// =============================================================================
// THREAT ACTOR DATA
// =============================================================================

export interface ThreatActorData {
  actor: {
    name: string;
    mitreId: string;
    aliases: string[];
    originCountry?: string;
    targetSectors?: string[];
    stixId?: string;
  };
  total: number;

  // Three-tier model
  production: TierData;
  development?: TierData;      // NEW
  gaps: TierData;

  // Legacy
  inLibrary?: TierData;

  // Legacy fields for backward compatibility
  coverage?: {
    total: number;
    covered: number;
    percent: number;
  };
  covered?: TechniqueCount[];
  criticalGaps?: TechniqueGap[];
  recommendation?: string;
}

// =============================================================================
// SEARCH RESULTS DATA
// =============================================================================

export interface SearchResultsData {
  query: string;
  total: number;
  results: SearchResult[];
  relatedTechniques: string[];
}

export interface SearchResult {
  id: string;
  name: string;
  description?: string;
  mitreIds: string[];
  status: string;
  severity?: string;
  similarity?: number;
}

// =============================================================================
// GAP ANALYSIS DATA
// =============================================================================

export interface GapAnalysisData {
  profile: string;
  profileTechniques: number;
  covered: number;
  coveragePercent: number;
  gaps: TechniqueGap[];
  quickWins: QuickWin[];
  recommendation: string;
}

export interface QuickWin {
  id: string;
  name: string;
  reason: string;
}

// =============================================================================
// TECHNIQUE INFO DATA
// =============================================================================

export interface TechniqueInfoData {
  technique: {
    id: string;
    name: string;
    description: string;
    tactics: string[];
    platforms: string[];
    dataSources: string[];
    detection?: string;
  };
  relatedTechniques: Array<{ id: string; name: string; relationship: string }>;
  relatedGroups: Array<{ id: string; name: string }>;
  detectionCount: number;
}

// =============================================================================
// DRAFT DATA (for detection drafts)
// =============================================================================

export interface DraftData {
  name: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  mitreAttackIds: string[];
  detectionQuery: string;
  queryLanguage: string;
  logSource?: string;
  technology?: string;
  falsePositiveGuidance?: string;
  dataSources?: string[];
}

// =============================================================================
// NAVIGATOR LAYER DATA
// =============================================================================

export interface NavigatorLayerData {
  layer: {
    name: string;
    description?: string;
    domain?: string;
    versions?: { attack: string; navigator: string; layer: string };
    techniques: Array<{ techniqueID: string; score?: number; color?: string; comment?: string }>;
    gradient?: { colors: string[]; minValue: number; maxValue: number };
    legendItems?: Array<{ label: string; color: string }>;
  };
  stats: {
    totalTechniques: number;
    coveredTechniques: number;
    coveragePercent: number;
  };
}

// =============================================================================
// ERROR DATA
// =============================================================================

export interface ErrorData {
  error: string;
  query?: string;
  suggestions?: string[];
  hint?: string;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isCoverageReportResponse(response: OptimusResponse): response is OptimusResponse & { data: CoverageReportData } {
  return response.type === 'coverage_report';
}

export function isThreatActorResponse(response: OptimusResponse): response is OptimusResponse & { data: ThreatActorData } {
  return response.type === 'threat_actor';
}

export function isSearchResultsResponse(response: OptimusResponse): response is OptimusResponse & { data: SearchResultsData } {
  return response.type === 'search_results';
}

export function isGapAnalysisResponse(response: OptimusResponse): response is OptimusResponse & { data: GapAnalysisData } {
  return response.type === 'gap_analysis';
}

export function isDraftResponse(response: OptimusResponse): response is OptimusResponse & { data: DraftData } {
  return response.type === 'draft';
}

export function isErrorResponse(response: OptimusResponse): response is OptimusResponse & { data: ErrorData } {
  return response.type === 'error';
}
