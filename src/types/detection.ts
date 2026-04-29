import { Status, Maturity, DetectionType, Severity, Confidence } from './enums';
import {
  type LibraryType,
  type PromotionStatus,
  type Visibility,
  LIBRARY_LABELS,
  LIBRARY_LABELS_SHORT,
  LIBRARY_DESCRIPTIONS,
  LIBRARY_ICONS,
} from '../constants/library';

// Re-export library constants and types from canonical source
export type { LibraryType, PromotionStatus, Visibility };
export { LIBRARY_LABELS, LIBRARY_LABELS_SHORT, LIBRARY_DESCRIPTIONS, LIBRARY_ICONS };

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
  | 'promoted'
  | 'forked_from_production'
  // New RBAC audit actions
  | 'assigned'
  | 'unassigned'
  | 'review_requested'
  | 'review_approved'
  | 'review_rejected'
  | 'comment_added';

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
  visibility?: Visibility;
  source: DetectionSource;
  source_rule_id: string | null;     // Points to Production rule if forked
  source_url: string | null;
  external_id: string | null;        // Original ID from source system
  promotion_status: PromotionStatus;
  promoted_to_id: string | null;     // Points to Production copy after approval
  promoted_at: string | null;

  // === RBAC FIELDS (NEW) ===
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

  // === THREAT RESEARCH PROVENANCE ===
  research_session_id?: string | null;
  research_node_id?: string | null;
}

// ============================================
// HELPER: Create empty detection
// ============================================

export const createEmptyDetection = (userId: string): Partial<Detection> => ({
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
  library_type: 'production',
  visibility: 'shared',
  source: 'custom',
  source_rule_id: null,
  source_url: null,
  external_id: null,
  promotion_status: 'none',
  promoted_to_id: null,
  promoted_at: null,
  // RBAC fields
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
