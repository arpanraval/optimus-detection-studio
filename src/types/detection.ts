import { Status, Maturity, DetectionType, Severity, Confidence } from './enums';

// ============================================
// REVIEW TYPES
// ============================================

/** Review workflow status */
export type ReviewStatus = 'none' | 'requested' | 'in_review' | 'approved' | 'rejected';

/** Review request status */
export type ReviewRequestStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';

// ============================================
// LIBRARY VIEW TYPES
// ============================================

export type LibraryType = 'universal' | 'user';

/** Extended library type for future team library */
export type ExtendedLibraryType = 'personal' | 'team' | 'universal';

/** Display names for library types — single source of truth for all UI labels */
export const LIBRARY_LABELS: Record<LibraryType, string> = {
  'user': 'Detection Lab',
  'universal': 'Production Library',
};

export const LIBRARY_LABELS_SHORT: Record<LibraryType, string> = {
  'user': 'Lab',
  'universal': 'Production',
};

export const LIBRARY_DESCRIPTIONS: Record<LibraryType, string> = {
  'user': 'Your personal workspace for importing, creating, and testing detection rules',
  'universal': 'Quality-controlled production rules deployed to your SIEMs',
};

export const LIBRARY_ICONS: Record<LibraryType, string> = {
  'user': 'flask',
  'universal': 'shield',
};

export type PublishStatus = 'unpublished' | 'pending' | 'published' | 'rejected';
export type DetectionSource = 'custom' | 'sigmahq' | 'splunk_escu' | 'elastic' | 'microsoft_sentinel' | 'crowdstrike' | 'chronicle' | 'community';

// ============================================
// MITRE-LINKED TYPES
// ============================================

export interface LinkedMitreEntity {
  mitre_id: string;      // e.g., "G0018", "S0066", "C0001"
  name: string;          // Cached name for display
  stix_id?: string;      // Optional STIX ID for deep linking
}

// ============================================
// DETECTION QUERY (Multi-language support)
// ============================================

export interface DetectionQuery {
  id: string;
  language: string;           // "SPL", "KQL", "Sigma", "EQL", etc.
  query: string;              // The actual query code
  explanation?: string;       // Explanation for this specific query
  isPrimary: boolean;         // Is this the primary/canonical query?
  createdDate: string;
  updatedDate: string;
}

// ============================================
// INVESTIGATION TYPES
// ============================================

export interface InvestigationStep {
  id: string;
  order: number;
  title: string;
  description: string;
  query?: string;             // Optional investigation query
  queryLanguage?: string;     // Language for the query
}

// ============================================
// AUDIT LOG (Detection-level)
// ============================================

export type AuditAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'query_added'
  | 'query_updated'
  | 'query_deleted'
  | 'validated'
  | 'deployed'
  | 'linked_entity_added'
  | 'linked_entity_removed'
  | 'published'
  | 'copied_from_universal'
  // New RBAC audit actions
  | 'assigned'
  | 'unassigned'
  | 'review_requested'
  | 'review_approved'
  | 'review_rejected'
  | 'comment_added'
  | 'moved_to_team';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: AuditAction;
  details?: string;
  changes?: Record<string, { old: any; new: any }>;
}

// ============================================
// MAIN DETECTION INTERFACE
// ============================================

export interface Detection {
  // === IDENTITY ===
  id: string;
  user_id: string;
  version: number;
  createdDate: string;
  updatedDate: string;
  created_by?: string;
  updated_by?: string;

  // === BASIC INFORMATION ===
  name: string;
  description: string;
  author: string;
  status: Status;
  maturity: Maturity;
  detectionType: DetectionType;
  severity: Severity;
  confidence: Confidence;

  // === DATA SOURCES ===
  logSource: string;              // Legacy - single log source
  logSources: string[];           // Array of log sources
  dataSources: string[];          // MITRE Data Sources
  dataComponents: string[];       // MITRE Data Components
  platforms: string[];            // MITRE Platforms
  technology: string;             // Legacy - primary technology

  // === DETECTION LOGIC (Multi-query) ===
  queries: DetectionQuery[];      // Array of queries in different languages

  // Legacy fields (auto-synced from primary query)
  queryLanguage: string;
  detectionQuery: string;
  queryExplanation: string;

  // === MITRE ATT&CK MAPPING ===
  mitreAttackIds: string[];       // Technique IDs ["T1566", "T1059.001"]
  mitreTactics: string[];         // Tactic names (auto-derived)
  mitreTechniques: string[];      // Technique names (auto-derived)

  // === THREAT INTELLIGENCE (MITRE-Linked) ===
  linkedGroups: LinkedMitreEntity[];
  linkedSoftware: LinkedMitreEntity[];
  linkedCampaigns: LinkedMitreEntity[];

  // Legacy free-text fields (kept for backward compatibility)
  threatActors: string[];
  campaigns: string[];
  software: string[];

  // === VULNERABILITIES ===
  associatedCVEs: string[];

  // === INVESTIGATION & RESPONSE ===
  investigationSteps: InvestigationStep[];
  responseActions: string[];
  falsePositiveGuidance: string;
  prerequisites: string[];

  // === TUNING & CONTEXT ===
  caveats: string;
  fineTuning: string;

  // === VALIDATION ===
  testedAndValidated: boolean;
  validationDate?: string;
  validationEnvironment?: string;
  testCases: string[];

  // === QUALITY ===
  qualityScore: number;

  // === METADATA ===
  references: string[];
  tags: string[];

  // === AUDIT ===
  auditLog: AuditLogEntry[];

  // === LIBRARY VIEW FIELDS ===
  library_type: LibraryType;
  source: DetectionSource;
  source_rule_id: string | null;     // Points to Universal rule if copied
  source_url: string | null;
  external_id: string | null;        // Original ID from source system
  publish_status: PublishStatus;
  published_to_id: string | null;    // Points to Universal copy after approval
  published_at: string | null;

  // === RBAC FIELDS (NEW) ===
  team_id?: string;                  // Team that owns this detection
  assigned_to?: string;              // User currently assigned
  assigned_by?: string;              // Who assigned it
  assigned_at?: string;              // When assigned
  review_status?: ReviewStatus;      // Current review state
  reviewer_id?: string;              // Assigned reviewer
  review_requested_at?: string;      // When review was requested
  reviewed_at?: string;              // When review completed
  review_notes?: string;             // Review feedback

  // === BULK IMPORT TRACKING ===
  bulk_import_id?: string;           // ID of bulk import job (for rollback capability)
}

// ============================================
// HELPER: Create empty detection
// ============================================

export const createEmptyDetection = (userId: string, teamId?: string): Partial<Detection> => ({
  id: crypto.randomUUID(),  // Generate ID since DB doesn't have default
  user_id: userId,
  version: 1,
  name: '',
  description: '',
  author: '',
  status: Status.Draft,
  maturity: Maturity.Experimental,
  detectionType: DetectionType.Detection,
  severity: Severity.Medium,
  confidence: Confidence.Medium,
  logSource: '',
  logSources: [],
  dataSources: [],
  dataComponents: [],
  platforms: [],
  technology: '',
  queries: [],
  queryLanguage: 'SPL',
  detectionQuery: '',
  queryExplanation: '',
  mitreAttackIds: [],
  mitreTactics: [],
  mitreTechniques: [],
  linkedGroups: [],
  linkedSoftware: [],
  linkedCampaigns: [],
  threatActors: [],
  campaigns: [],
  software: [],
  associatedCVEs: [],
  investigationSteps: [],
  responseActions: [],
  falsePositiveGuidance: '',
  prerequisites: [],
  caveats: '',
  fineTuning: '',
  testedAndValidated: false,
  testCases: [],
  qualityScore: 0,
  references: [],
  tags: [],
  auditLog: [],
  // Library fields
  library_type: 'user',
  source: 'custom',
  source_rule_id: null,
  source_url: null,
  external_id: null,
  publish_status: 'unpublished',
  published_to_id: null,
  published_at: null,
  // RBAC fields
  team_id: teamId,
  assigned_to: undefined,
  assigned_by: undefined,
  assigned_at: undefined,
  review_status: 'none',
  reviewer_id: undefined,
  review_requested_at: undefined,
  reviewed_at: undefined,
  review_notes: undefined,
});

// ============================================
// MITRE ATT&CK Types (existing)
// ============================================

export interface MitreTechnique {
  id: string;
  name: string;
  platforms?: string[];
  subTechniques?: MitreTechnique[];
}

export interface MitreTactic {
  id: string;
  name: string;
  techniques: MitreTechnique[];
}
