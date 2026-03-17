/**
 * MITRE ATT&CK STIX 2.1 Type Definitions
 * Complete type system for all MITRE objects and relationships
 */

// =============================================================================
// BASE TYPES
// =============================================================================

export interface ExternalReference {
  source_name: string;
  external_id?: string;
  url?: string;
  description?: string;
}

export interface KillChainPhase {
  kill_chain_name: string;
  phase_name: string;
}

export interface GranularMarking {
  selectors: string[];
  marking_ref: string;
}

/**
 * Base STIX Domain Object
 */
export interface StixObject {
  id: string;
  type: string;
  spec_version?: string;
  created: string;
  modified: string;
  created_by_ref?: string;
  revoked?: boolean;
  object_marking_refs?: string[];
  granular_markings?: GranularMarking[];
  external_references?: ExternalReference[];
  
  // ATT&CK extensions
  x_mitre_version?: string;
  x_mitre_deprecated?: boolean;
  x_mitre_attack_spec_version?: string;
  x_mitre_modified_by_ref?: string;
  x_mitre_domains?: string[];
}

// =============================================================================
// ATTACK PATTERN (Techniques)
// =============================================================================

export interface AttackPattern extends StixObject {
  type: 'attack-pattern';
  name: string;
  description?: string;
  kill_chain_phases?: KillChainPhase[];
  
  // ATT&CK specific
  x_mitre_platforms?: string[];
  x_mitre_detection?: string;
  x_mitre_data_sources?: string[];
  x_mitre_is_subtechnique?: boolean;
  x_mitre_system_requirements?: string[];
  x_mitre_permissions_required?: string[];
  x_mitre_effective_permissions?: string[];
  x_mitre_defense_bypassed?: string[];
  x_mitre_remote_support?: boolean;
  x_mitre_impact_type?: string[];
  x_mitre_contributors?: string[];
}

// =============================================================================
// INTRUSION SET (Threat Groups)
// =============================================================================

export interface IntrusionSet extends StixObject {
  type: 'intrusion-set';
  name: string;
  description?: string;
  aliases?: string[];

  // ATT&CK specific
  x_mitre_contributors?: string[];

  // Targeting Intelligence Enrichment (from MISP Threat Actor Galaxy)
  targeting_intel?: TargetingIntel;
}

// =============================================================================
// TARGETING INTELLIGENCE (Enrichment from MISP Threat Actor Galaxy)
// =============================================================================

export type TargetingMatchType =
  | 'mitre_id'           // MITRE ID (G0032) found in MISP synonyms - 100% confidence
  | 'exact_name'         // MISP value exactly equals MITRE name - 95% confidence
  | 'alias'              // MISP value exactly equals unique MITRE alias - 80% confidence
  | 'synonym_to_name'    // MISP synonym equals MITRE name - 70% confidence
  | 'synonym_to_alias';  // MISP synonym equals unique MITRE alias - 60% confidence

export interface TargetingIntel {
  // === ENRICHMENT METADATA ===
  data_source: 'misp_threat_actor_galaxy';  // Where targeting data came from
  enriched_at: string;                       // ISO timestamp of enrichment
  enrichment_version: string;                // e.g., "1.0.0"

  // === MATCHING DETAILS (for audit/debugging) ===
  match_type: TargetingMatchType;
  match_confidence: number;                  // 0-100 confidence score
  matched_misp_actor_ids: string[];          // MISP UUIDs for audit trail

  // === ORIGIN INTELLIGENCE (WHERE the actor is FROM) ===
  origin_country: string | null;             // Full name: "China", "Russia", "Iran"
  origin_country_code: string | null;        // ISO code: "CN", "RU", "IR", "KP"

  // === TARGETING INTELLIGENCE (WHO they attack) ===
  target_countries: string[];                // ["United States", "Taiwan", "Germany"]
  target_sectors: string[];                  // ["Government", "Private sector", "Financial"]
  activity_type: string | null;              // "Espionage", "Sabotage", "Financially motivated"

  // === DISPLAY ALIASES (for UI only, NOT used for matching) ===
  vendor_names?: {
    microsoft?: string;                      // "Diamond Sleet", "Midnight Blizzard"
    crowdstrike?: string;                    // "LABYRINTH CHOLLIMA", "COZY BEAR"
  };
}

// =============================================================================
// MALWARE
// =============================================================================

export interface Malware extends StixObject {
  type: 'malware';
  name: string;
  description?: string;
  is_family?: boolean;
  aliases?: string[];
  
  // ATT&CK specific
  x_mitre_platforms?: string[];
  x_mitre_aliases?: string[];
  x_mitre_contributors?: string[];
}

// =============================================================================
// TOOL
// =============================================================================

export interface Tool extends StixObject {
  type: 'tool';
  name: string;
  description?: string;
  aliases?: string[];
  
  // ATT&CK specific
  x_mitre_platforms?: string[];
  x_mitre_aliases?: string[];
  x_mitre_contributors?: string[];
}

// =============================================================================
// COURSE OF ACTION (Mitigations)
// =============================================================================

export interface CourseOfAction extends StixObject {
  type: 'course-of-action';
  name: string;
  description?: string;
  
  // ATT&CK specific
  x_mitre_contributors?: string[];
}

// =============================================================================
// CAMPAIGN
// =============================================================================

export interface Campaign extends StixObject {
  type: 'campaign';
  name: string;
  description?: string;
  aliases?: string[];
  first_seen?: string;
  last_seen?: string;
  
  // ATT&CK specific
  x_mitre_first_seen_citation?: string;
  x_mitre_last_seen_citation?: string;
  x_mitre_contributors?: string[];
}

// =============================================================================
// TACTIC
// =============================================================================

export interface Tactic extends StixObject {
  type: 'x-mitre-tactic';
  name: string;
  description?: string;
  x_mitre_shortname: string;
}

// =============================================================================
// MATRIX
// =============================================================================

export interface Matrix extends StixObject {
  type: 'x-mitre-matrix';
  name: string;
  description?: string;
  tactic_refs: string[];
}

// =============================================================================
// DATA SOURCE
// =============================================================================

export interface DataSource extends StixObject {
  type: 'x-mitre-data-source';
  name: string;
  description?: string;
  x_mitre_platforms?: string[];
  x_mitre_collection_layers?: string[];
  x_mitre_contributors?: string[];
}

// =============================================================================
// DATA COMPONENT
// =============================================================================

export interface DataComponent extends StixObject {
  type: 'x-mitre-data-component';
  name: string;
  description?: string;
  x_mitre_data_source_ref: string;
}

// =============================================================================
// RELATIONSHIP
// =============================================================================

export interface StixRelationship {
  id: string;
  type: 'relationship';
  spec_version?: string;
  created: string;
  modified: string;
  relationship_type: RelationshipType;
  source_ref: string;
  target_ref: string;
  description?: string;
  external_references?: ExternalReference[];
  object_marking_refs?: string[];
  revoked?: boolean;
  
  // ATT&CK extensions
  x_mitre_version?: string;
  x_mitre_deprecated?: boolean;
  x_mitre_modified_by_ref?: string;
}

export type RelationshipType =
  | 'uses'
  | 'mitigates'
  | 'detects'
  | 'subtechnique-of'
  | 'attributed-to'
  | 'targets'
  | 'revoked-by'
  | 'related-to';

// =============================================================================
// STIX BUNDLE
// =============================================================================

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixBundleObject[];
}

export type StixBundleObject =
  | AttackPattern
  | IntrusionSet
  | Malware
  | Tool
  | CourseOfAction
  | Campaign
  | Tactic
  | Matrix
  | DataSource
  | DataComponent
  | StixRelationship
  | StixObject;

// =============================================================================
// DATABASE TYPES (for query results)
// =============================================================================

export interface MitreObject {
  id: string;
  stix_id: string;
  type: string;
  mitre_id: string | null;
  name: string;
  description: string | null;
  created: string;
  modified: string;
  data: Record<string, any>;
  deprecated: boolean;
  revoked: boolean;
  created_at: string;
  updated_at: string;
}

export interface MitreRelationship {
  id: string;
  stix_id: string;
  relationship_type: RelationshipType;
  source_ref: string;
  target_ref: string;
  description: string | null;
  data: Record<string, any> | null;
  created: string;
  modified: string;
  created_at: string;
  updated_at: string;
}

export interface MitreMetadata {
  id: string;
  framework_version: string;
  stix_version: string;
  last_updated: string;
  total_techniques: number;
  total_groups: number;
  total_software: number;
  total_campaigns: number;
  total_mitigations: number;
  total_relationships: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// QUERY RESULT TYPES
// =============================================================================

export interface TechniqueDetails extends MitreObject {
  tactics: Array<{ stix_id: string; shortname: string }>;
  platforms: string[];
  data_sources: string[];
  mitigations?: CourseOfAction[];
  groups?: IntrusionSet[];
  software?: Array<Malware | Tool>;
  parent_technique?: AttackPattern;
  sub_techniques?: AttackPattern[];
}

export interface GroupDetails extends MitreObject {
  techniques: AttackPattern[];
  software: Array<Malware | Tool>;
  campaigns: Campaign[];
  aliases: string[];
}

export interface SoftwareDetails extends MitreObject {
  techniques: AttackPattern[];
  groups: IntrusionSet[];
  is_malware: boolean;
  aliases: string[];
}

export interface CampaignDetails extends MitreObject {
  techniques: AttackPattern[];
  attributed_group?: IntrusionSet;
  first_seen?: string;
  last_seen?: string;
}

// =============================================================================
// COVERAGE ANALYSIS TYPES
// =============================================================================

export interface CoverageAnalysis {
  overall: {
    total_techniques: number;
    covered_techniques: number;
    coverage_percentage: number;
  };
  by_tactic: Array<{
    tactic_name: string;
    tactic_shortname: string;
    total: number;
    covered: number;
    percentage: number;
  }>;
  by_platform: Array<{
    platform: string;
    total: number;
    covered: number;
    percentage: number;
  }>;
  critical_gaps: Array<{
    technique: AttackPattern;
    reason: string;
    priority: 'critical' | 'high' | 'medium';
    groups_using: number;
    software_using: number;
  }>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const MITRE_PLATFORMS = [
  'Windows',
  'Linux',
  'macOS',
  'AWS',
  'Azure',
  'GCP',
  'Azure AD',
  'Office 365',
  'SaaS',
  'IaaS',
  'Network',
  'Containers',
  'PRE'
] as const;

export const MITRE_TACTICS = [
  { name: 'Reconnaissance', shortname: 'reconnaissance' },
  { name: 'Resource Development', shortname: 'resource-development' },
  { name: 'Initial Access', shortname: 'initial-access' },
  { name: 'Execution', shortname: 'execution' },
  { name: 'Persistence', shortname: 'persistence' },
  { name: 'Privilege Escalation', shortname: 'privilege-escalation' },
  { name: 'Defense Evasion', shortname: 'defense-evasion' },
  { name: 'Credential Access', shortname: 'credential-access' },
  { name: 'Discovery', shortname: 'discovery' },
  { name: 'Lateral Movement', shortname: 'lateral-movement' },
  { name: 'Collection', shortname: 'collection' },
  { name: 'Command and Control', shortname: 'command-and-control' },
  { name: 'Exfiltration', shortname: 'exfiltration' },
  { name: 'Impact', shortname: 'impact' }
] as const;

export const RELATIONSHIP_TYPES = {
  USES: 'uses',
  MITIGATES: 'mitigates',
  DETECTS: 'detects',
  SUBTECHNIQUE_OF: 'subtechnique-of',
  ATTRIBUTED_TO: 'attributed-to',
  TARGETS: 'targets',
  REVOKED_BY: 'revoked-by',
  RELATED_TO: 'related-to'
} as const;