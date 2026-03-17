export const COUNTRY_CONFIG: Record<string, { name: string; flag: string }> = {
  IR: { name: 'Iran', flag: '\u{1F1EE}\u{1F1F7}' },
  RU: { name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  CN: { name: 'China', flag: '\u{1F1E8}\u{1F1F3}' },
  KP: { name: 'North Korea', flag: '\u{1F1F0}\u{1F1F5}' },
  PK: { name: 'Pakistan', flag: '\u{1F1F5}\u{1F1F0}' },
  VN: { name: 'Vietnam', flag: '\u{1F1FB}\u{1F1F3}' },
  IN: { name: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
  TR: { name: 'Turkey', flag: '\u{1F1F9}\u{1F1F7}' },
  LB: { name: 'Lebanon', flag: '\u{1F1F1}\u{1F1E7}' },
  IL: { name: 'Israel', flag: '\u{1F1EE}\u{1F1F1}' },
};

// Filter types for the interactive report
export interface ReportFilters {
  originCountries: string[];   // country codes: ['IR', 'RU']
  targetCountries: string[];   // country names: ['United States']
  targetSectors: string[];     // sector names: ['Government']
  activityTypes: string[];     // activity types: ['Espionage']
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
  flag?: string;
}

export interface FilterOptions {
  originCountries: FilterOption[];
  targetCountries: FilterOption[];
  targetSectors: FilterOption[];
  activityTypes: FilterOption[];
}

export const EMPTY_FILTERS: ReportFilters = {
  originCountries: [],
  targetCountries: [],
  targetSectors: [],
  activityTypes: [],
};

export function hasActiveFilters(filters: ReportFilters): boolean {
  return filters.originCountries.length > 0
    || filters.targetCountries.length > 0
    || filters.targetSectors.length > 0
    || filters.activityTypes.length > 0;
}

export function describeFilters(filters: ReportFilters): string {
  const parts: string[] = [];
  if (filters.originCountries.length > 0) {
    const names = filters.originCountries.map(c => COUNTRY_CONFIG[c]?.name || c);
    parts.push(`Origin: ${names.join(', ')}`);
  }
  if (filters.targetCountries.length > 0) {
    parts.push(`Targeting: ${filters.targetCountries.join(', ')}`);
  }
  if (filters.targetSectors.length > 0) {
    parts.push(`Sectors: ${filters.targetSectors.join(', ')}`);
  }
  if (filters.activityTypes.length > 0) {
    parts.push(`Activity: ${filters.activityTypes.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'All State Sponsored Groups';
}

export type RiskRating = 'Critical' | 'High' | 'Medium' | 'Low';

export interface StateSponsoredGroup {
  id: string;
  stixId: string;
  mitreId: string;
  name: string;
  aliases: string[];
  vendorNames: { microsoft?: string; crowdstrike?: string };
  activityType: string | null;
  techniqueCount: number;
  coveragePercent: number;
  taw: number;
  lastModified: string;
}

export interface TacticCoverage {
  tactic: string;
  totalTechniques: number;
  coveredTechniques: number;
  coveragePercent: number;
}

export interface ReportDetection {
  id: string;
  name: string;
  source: string;
  queryLanguage: string;
  mitreAttackIds: string[];
  status: string;
  severity: string;
  qualityScore: number;
  attribution: 'direct' | 'indirect';
  attributionReasons: string[];
  relevanceScore: number;
  externalId: string | null;
  sourceUrl: string | null;
}

export interface ReportGap {
  techniqueId: string;
  techniqueName: string;
  tactic: string;
  groupCount: number;
  tisScore: number;
  priority: number;
}

export interface ReportSoftware {
  id: string;
  stixId: string;
  mitreId: string;
  name: string;
  type: string;
  groupCount: number;
  techniqueCount: number;
}

export interface ReportCampaign {
  id: string;
  stixId: string;
  name: string;
  firstSeen: string | null;
  lastSeen: string | null;
  techniqueCount: number;
  attributedGroup: string | null;
}

export interface TechniqueWithGroups {
  mitreId: string;
  name: string;
  tactics: string[];
  groupNames: string[];
  detectionCount: number;
  isCovered: boolean;
}

export interface StateSponsoredReport {
  filterDescription: string;
  activeFilters: ReportFilters;
  generatedAt: Date;
  groups: StateSponsoredGroup[];
  allTechniques: TechniqueWithGroups[];
  coveredTechniqueIds: Set<string>;
  uncoveredTechniqueIds: Set<string>;
  coveragePercent: number;
  riskRating: RiskRating;
  tacticBreakdown: TacticCoverage[];
  relatedDetections: ReportDetection[];
  gaps: ReportGap[];
  software: ReportSoftware[];
  campaigns: ReportCampaign[];
  targetSectors: { sector: string; count: number }[];
  targetCountries: { country: string; count: number }[];
}
