/**
 * TypeScript interfaces for the Threat Group Targeting Enrichment System
 *
 * This file defines types for:
 * - MITRE ATT&CK intrusion sets (threat groups)
 * - MISP Threat Actor Galaxy data (targeting intelligence)
 * - Microsoft Threat Actor naming (display aliases)
 * - Enrichment preview and audit records
 */

// =============================================================================
// MITRE ATT&CK TYPES
// =============================================================================

export interface MitreExternalReference {
  source_name: string;
  external_id?: string;
  url?: string;
  description?: string;
}

export interface MitreIntrusionSet {
  id: string; // STIX ID: "intrusion-set--..."
  type: 'intrusion-set';
  spec_version: string;
  created: string;
  modified: string;
  name: string;
  description?: string;
  aliases?: string[];
  revoked?: boolean;
  external_references?: MitreExternalReference[];
  x_mitre_deprecated?: boolean;
  x_mitre_version?: string;
  x_mitre_contributors?: string[];
  object_marking_refs?: string[];
  created_by_ref?: string;
}

export interface ParsedMitreGroup {
  stixId: string;         // "intrusion-set--abc123..."
  mitreId: string;        // "G0032"
  name: string;           // "Lazarus Group"
  aliases: string[];      // ["HIDDEN COBRA", "ZINC", ...]
  description?: string;
  deprecated: boolean;
  revoked: boolean;
  modified: string;
}

// =============================================================================
// MISP THREAT ACTOR TYPES
// =============================================================================

export interface MispThreatActorMeta {
  'attribution-confidence'?: string;
  country?: string;                          // ISO code: "CN", "RU", "IR", "KP"
  'cfr-suspected-state-sponsor'?: string;    // Full name: "China", "Russian Federation"
  'cfr-suspected-victims'?: string[];        // Countries/regions targeted
  'cfr-target-category'?: string[];          // Industries targeted
  'cfr-type-of-incident'?: string;           // "Espionage", "Sabotage", etc.
  refs?: string[];
  synonyms?: string[];
  'targeted-sector'?: string[];              // Alternative targeting field
}

export interface MispThreatActorRelated {
  'dest-uuid': string;
  tags?: string[];
  type: string;
}

export interface MispThreatActor {
  uuid: string;
  value: string;                             // Primary name
  description?: string;
  meta?: MispThreatActorMeta;
  related?: MispThreatActorRelated[];
}

export interface MispThreatActorGalaxy {
  authors: string[];
  category: string;
  description: string;
  name: string;
  source: string;
  type: string;
  uuid: string;
  values: MispThreatActor[];
}

// =============================================================================
// MICROSOFT THREAT ACTOR TYPES
// =============================================================================

export interface MicrosoftThreatActor {
  'Threat actor name': string;               // Weather-based name: "Diamond Sleet"
  'Origin/Threat': string;                   // "China", "Russia", etc.
  'Other names': string;                     // Comma-separated aliases
}

// =============================================================================
// MATCHING & ENRICHMENT TYPES
// =============================================================================

export type MatchType =
  | 'mitre_id'           // MITRE ID (G0032) found in MISP synonyms - 100% confidence
  | 'exact_name'         // MISP value exactly equals MITRE name - 95% confidence
  | 'alias'              // MISP value exactly equals unique MITRE alias - 80% confidence
  | 'synonym_to_name'    // MISP synonym equals MITRE name - 70% confidence
  | 'synonym_to_alias';  // MISP synonym equals unique MITRE alias - 60% confidence

export const MATCH_CONFIDENCE: Record<MatchType, number> = {
  'mitre_id': 100,
  'exact_name': 95,
  'alias': 80,
  'synonym_to_name': 70,
  'synonym_to_alias': 60
};

export interface MatchResult {
  mitreId: string;                           // MITRE ID (G0032)
  mitreStixId: string;                       // STIX ID of matched MITRE group
  mitreName: string;                         // MITRE group name
  matchType: MatchType;
  confidence: number;
  matchedMispActors: Array<{
    uuid: string;
    value: string;
    matchedOn: string;                       // What alias/name matched
  }>;
}

export interface AmbiguousMatch {
  mispValue: string;
  mispUuid: string;
  reason: string;
  candidateGroups: string[];                 // MITRE IDs of possible matches
}

// =============================================================================
// TARGETING INTELLIGENCE TYPES
// =============================================================================

export interface TargetingIntel {
  // === ENRICHMENT METADATA ===
  data_source: 'misp_threat_actor_galaxy';
  enriched_at: string;                       // ISO timestamp
  enrichment_version: string;                // e.g., "1.0.0"

  // === MATCHING DETAILS ===
  match_type: MatchType;
  match_confidence: number;
  matched_misp_actor_ids: string[];          // MISP UUIDs for audit trail

  // === ORIGIN INTELLIGENCE ===
  origin_country: string | null;             // Full name: "China", "Russia"
  origin_country_code: string | null;        // ISO code: "CN", "RU"

  // === TARGETING INTELLIGENCE ===
  target_countries: string[];                // Countries attacked
  target_sectors: string[];                  // Industries targeted
  activity_type: string | null;              // "Espionage", "Sabotage", etc.

  // === DISPLAY ALIASES ===
  vendor_names?: {
    microsoft?: string;                      // Weather-based name
    crowdstrike?: string;                    // Animal-based name
  };
}

// =============================================================================
// PREVIEW & AUDIT TYPES
// =============================================================================

export interface EnrichmentPreviewMatch {
  mitreId: string;
  mitreName: string;
  mitreStixId: string;
  matchType: MatchType;
  confidence: number;
  mispActors: Array<{
    uuid: string;
    value: string;
    matchedOn: string;
  }>;
  enrichment: {
    originCountry: string | null;
    originCountryCode: string | null;
    targetCountries: string[];
    targetSectors: string[];
    activityType: string | null;
    vendorNames?: {
      microsoft?: string;
    };
  };
  warnings: string[];
}

export interface EnrichmentPreview {
  timestamp: string;
  version: string;
  previewHash: string;                       // SHA256 for verification

  summary: {
    totalMitreGroups: number;
    totalMispActors: number;
    matchedGroups: number;
    groupsWithTargeting: number;
    unmatchedGroups: number;
    rejectedAmbiguous: number;
  };

  matches: EnrichmentPreviewMatch[];
  ambiguous: AmbiguousMatch[];
  unmatchedMitre: string[];                  // MITRE IDs with no MISP match
}

export interface EnrichmentAuditRecord {
  id: string;
  enrichment_type: string;
  applied_at: string;
  applied_by: string | null;
  preview_hash: string;
  affected_group_ids: string[];
  rollback_data: Record<string, TargetingIntel | null>;  // Previous values by STIX ID
  status: 'applied' | 'rolled_back';
  rolled_back_at: string | null;
  notes: string | null;
  created_at: string;
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// ALIAS INDEX TYPES
// =============================================================================

export interface AliasIndexEntry {
  mitreId: string;
  mitreStixId: string;
  mitreName: string;
  isShared: boolean;                         // Appears in multiple MITRE groups
}

export type AliasIndex = Map<string, AliasIndexEntry[]>;  // alias (lowercase) -> entries

// =============================================================================
// COUNTRY CODE MAPPING
// =============================================================================

export const ISO_TO_COUNTRY: Record<string, string> = {
  'CN': 'China',
  'RU': 'Russian Federation',
  'IR': 'Iran',
  'KP': 'North Korea',
  'US': 'United States',
  'IL': 'Israel',
  'VN': 'Vietnam',
  'IN': 'India',
  'PK': 'Pakistan',
  'LB': 'Lebanon',
  'SY': 'Syria',
  'TR': 'Turkey',
  'UA': 'Ukraine',
  'BY': 'Belarus',
  'KR': 'South Korea',
  'JP': 'Japan',
  'DE': 'Germany',
  'GB': 'United Kingdom',
  'FR': 'France',
  'SA': 'Saudi Arabia',
  'AE': 'United Arab Emirates',
  'NG': 'Nigeria',
  'EG': 'Egypt',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'AU': 'Australia',
};

export const COUNTRY_TO_ISO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_TO_COUNTRY).map(([code, name]) => [name, code])
);

// Additional mappings for common variations
export const COUNTRY_NAME_ALIASES: Record<string, string> = {
  'Russia': 'Russian Federation',
  'North Korea': 'North Korea',
  'DPRK': 'North Korea',
  "Democratic People's Republic of Korea": 'North Korea',
  'South Korea': 'South Korea',
  'Republic of Korea': 'South Korea',
  'USA': 'United States',
  'UK': 'United Kingdom',
  'UAE': 'United Arab Emirates',
  'PRC': 'China',
  "People's Republic of China": 'China',
};

// =============================================================================
// EXCLUSION LISTS
// =============================================================================

export const EXCLUDED_ALIAS_TERMS = new Set([
  'apt',
  'group',
  'team',
  'unit',
  'actor',
  'threat',
  'adversary',
  'campaign',
  'operation',
]);

export const EXCLUDED_COUNTRY_CODES = new Set([
  'cn', 'ru', 'ir', 'kp', 'us', 'il', 'vn',
]);

export const MIN_ALIAS_LENGTH = 3;
