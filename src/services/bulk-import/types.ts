/**
 * Bulk Import Types
 *
 * All type definitions for the bulk import system including:
 * - Vendor formats and parsed rule structures
 * - Job state management
 * - Validation results
 * - Progress tracking
 */

import { Detection, LibraryType, DetectionSource, Severity, Status } from '../../types';
import { QUERY_LANGUAGES } from '../../constants';

// ============================================
// VENDOR FORMATS
// ============================================

/** Supported vendor formats for import */
export type VendorFormat = 'sigma' | 'splunk_escu' | 'elastic' | 'kql' | 'crowdstrike_cql' | 'chronicle';

/** Import source types */
export type ImportSourceType = 'github' | 'zip' | 'files';

/** Embedding strategy for post-import embedding generation */
export type EmbeddingStrategy = 'realtime' | 'batch' | 'skip';

/** Query language types - derived from the QUERY_LANGUAGES constant */
export type QueryLanguage = (typeof QUERY_LANGUAGES)[number] | 'Unknown';

// ============================================
// PARSED RULE STRUCTURE
// ============================================

/** Sigma logsource structure */
export interface SigmaLogsource {
  product?: string;
  service?: string;
  category?: string;
  definition?: string;
}

/** Parsed rule from any vendor - normalized intermediate format */
export interface ParsedRule {
  // Source identification
  sourceId: string; // Original rule ID from vendor
  sourceUrl?: string; // URL to original rule
  sourceFormat: VendorFormat; // 'sigma' | 'splunk_escu' | 'elastic' | 'kql' | 'crowdstrike_cql' | 'chronicle'
  sourceFileName: string; // Original filename
  sourceFilePath?: string; // Full path within archive

  // Core fields
  title: string;
  description: string;
  author: string;
  status: string; // Original status string
  level: string; // Severity level (vendor-specific)
  date?: string;
  modified?: string;

  // Detection logic
  query: string;
  queryLanguage: QueryLanguage;

  // MITRE ATT&CK
  mitreAttackIds: string[]; // ['T1059.001', 'T1105']
  mitreTactics: string[]; // ['execution', 'command-and-control']

  // Data sources
  logsource?: SigmaLogsource;
  dataSources: string[];
  platforms: string[];

  // Metadata
  tags: string[];
  references: string[];
  falsePositives: string[];
  cves: string[];

  // Sigma-specific
  detection?: Record<string, unknown>; // Raw detection block

  // Splunk ESCU-specific
  riskScore?: number;

  // Raw data for debugging
  rawContent?: string;
  rawRule?: unknown;
}

// ============================================
// PARSE RESULT
// ============================================

/** Parse error details */
export interface ParseError {
  code: ParseErrorCode;
  message: string;
  line?: number;
  column?: number;
  details?: string;
}

/** Error codes for parsing */
export type ParseErrorCode =
  | 'INVALID_YAML'
  | 'INVALID_TOML'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_STRUCTURE'
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'ENCODING_ERROR'
  | 'UNKNOWN_ERROR';

/** Result of parsing a single file */
export interface ParseResult {
  success: boolean;
  rule?: ParsedRule;
  error?: ParseError;
  warnings: string[];
  parsingTime?: number; // ms
}

// ============================================
// VALIDATION
// ============================================

/** Validation severity levels */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** Single validation issue */
export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
}

/** Validation result for a parsed rule */
export interface ValidationResult {
  isValid: boolean;
  qualityScore: number; // 0-100
  issues: ValidationIssue[];
  isDuplicate: boolean;
  duplicateOf?: string; // ID of existing detection if duplicate
}

/** Combined parsed + validated rule */
export interface ValidatedRule {
  parsed: ParsedRule;
  validation: ValidationResult;
  selected: boolean; // User can select/deselect for import
  normalized?: Partial<Detection>; // Normalized to Detection schema
}

// ============================================
// JOB STATE MACHINE
// ============================================

/** Import job statuses */
export type ImportJobStatus =
  | 'idle'
  | 'fetching'
  | 'parsing'
  | 'validating'
  | 'preview'
  | 'inserting'
  | 'embedding'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Duplicate handling strategies */
export type DuplicateStrategy = 'skip' | 'update' | 'create_new';

/** Import job configuration */
export interface ImportJobConfig {
  sourceType: ImportSourceType;
  sourceUrl?: string; // For GitHub
  sourceFiles?: File[]; // For file upload
  sourceZip?: File; // For ZIP upload
  vendorFilter?: VendorFormat[]; // Filter to specific vendors
  vendor?: VendorFormat | 'mixed'; // Detected/primary vendor format
  targetLibrary: LibraryType;
  duplicateStrategy: DuplicateStrategy;
  batchSize?: number; // Default: 50
  validateMitre?: boolean; // Validate MITRE IDs exist in DB
  githubToken?: string; // GitHub PAT for higher rate limits
  githubPath?: string; // Subdirectory within the repo to scan (e.g. 'rules')
  includePaths?: string[]; // Only include files under these paths (e.g. ['rules/windows', 'rules/linux'])
  embeddingStrategy?: EmbeddingStrategy; // 'realtime' (default) | 'batch' (50% cost) | 'skip'
  /** Route that owns the job's detailed progress and completion UI. */
  returnRoute?: string;
}

/** Progress tracking */
export interface ImportProgress {
  phase: ImportJobStatus;
  totalFiles: number;
  processedFiles: number;
  totalRules: number;
  validRules: number;
  warningRules: number;
  errorRules: number;
  duplicateRules: number;
  insertedRules: number;
  failedInserts: number;
  skippedRules: number;
  currentFile?: string;
  currentBatch?: number;
  totalBatches?: number;
  estimatedTimeRemaining?: number; // seconds
  startedAt?: string;
  completedAt?: string;
  // Embedding generation (post-insert)
  embeddingTotal?: number;
  embeddingGenerated?: number;
  embeddingErrors?: number;
  // Batch embedding tracking
  embeddingBatchJobId?: string;
}

/** Import job state */
export interface ImportJob {
  id: string;
  config: ImportJobConfig;
  status: ImportJobStatus;
  progress: ImportProgress;
  rules: ValidatedRule[];
  errors: ImportJobError[];
  warnings: string[];
  result?: ImportJobResult;
  createdAt: string;
  updatedAt: string;
}

/** Import job error */
export interface ImportJobError {
  timestamp: string;
  phase: ImportJobStatus;
  code: string;
  message: string;
  fileName?: string;
  ruleId?: string;
  recoverable: boolean;
}

/** Final import result */
export interface ImportJobResult {
  success: boolean;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  skipCount: number;
  warningCount: number;
  importedDetectionIds: string[];
  failedRules: Array<{
    sourceId: string;
    title: string;
    error: string;
    categorizedError?: CategorizedError;
  }>;
  skippedRules: Array<{
    sourceId: string;
    title: string;
    reason: string;
  }>;
  duration: number; // Total time in ms
  mitreCoverageAdded: number; // New techniques covered
  /** True when the user stopped the job after one or more batches may have completed. */
  cancelled?: boolean;
}

// ============================================
// DATABASE TYPES
// ============================================

/** Bulk import job record in database */
export interface BulkImportJobRecord {
  id: string;
  user_id: string;
  source_type: ImportSourceType;
  source_url: string | null;
  source_vendor: VendorFormat | 'mixed' | null;
  target_library: LibraryType;
  duplicate_strategy: DuplicateStrategy;
  status: ImportJobStatus | 'reverted';
  total_files: number;
  processed_files: number;
  success_count: number;
  failure_count: number;
  skip_count: number;
  warning_count: number;
  imported_detection_ids: string[];
  errors: ImportJobError[];
  warnings: string[];
  // Checkpoint fields for resume capability
  checkpoint_data: CheckpointData | null;
  last_successful_batch: number;
  total_batches: number;
  // Rollback tracking
  reverted_at: string | null;
  reverted_by: string | null;
  // Timestamps
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Checkpoint data for resumable imports */
export interface CheckpointData {
  /** Batch number to resume from */
  resumeFromBatch: number;
  /** IDs of detections successfully inserted before interruption */
  insertedIds: string[];
  /** Pending detection data to be inserted */
  pendingDetections?: string[]; // JSON stringified to avoid storing full objects
  /** Timestamp of last checkpoint */
  checkpointedAt: string;
}

/** Result of pre-flight permission check */
export interface ImportPermissionCheckResult {
  allowed: boolean;
  error?: string;
  user_id?: string;
  library_type?: string;
  user_role?: string;
  required_role?: string;
  current_role?: string;
}

/** Result of rollback operation */
export interface RollbackResult {
  success: boolean;
  deleted_count?: number;
  reverted_count?: number;
  expected_count?: number;
  job_id?: string;
  reverted_at?: string;
  error?: string;
}

// ---------------------------------------------------------------
// Pre-check / dedup types
// ---------------------------------------------------------------

export type PreCheckCategory = 'net_new' | 'updated_upstream' | 'unchanged';

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface PreCheckRuleResult {
  externalId: string;
  category: PreCheckCategory;
  existingDetectionId?: string;
  diffs?: FieldDiff[];
  incomingRule: ParsedRule;
}

export interface PreCheckSummary {
  netNew: PreCheckRuleResult[];
  updatedUpstream: PreCheckRuleResult[];
  unchanged: PreCheckRuleResult[];
  hardRejects: Array<{ rule: ParsedRule; reason: string }>;
  totalScanned: number;
}

/** Vendor metadata stored in detections */
export interface VendorMetadata {
  /** Original vendor format */
  sourceFormat: VendorFormat;
  /** Latest upstream raw content (YAML/TOML) — the drift baseline */
  rawContent?: string;
  /** Vendor-specific fields not in our schema */
  vendorFields: Record<string, unknown>;
  /** Import timestamp */
  importedAt: string;
  /** Import job ID */
  importJobId?: string;
  /** When this detection was last synced from upstream via the drift feature */
  lastSyncedAt?: string;
  /** rawContent prior to the last upstream sync — powers one-step "Revert last sync" */
  previousRawContent?: string;
}

// ============================================
// FETCHER TYPES
// ============================================

/** Fetched file with content */
export interface FetchedFile {
  name: string;
  path: string;
  content: string;
  size: number;
  lastModified?: string;
  /** Git blob SHA from the tree listing, when available (used for cheap drift skips). */
  blobSha?: string;
}

/** A file entry from a git tree listing — path + blob SHA. */
export interface GitTreeEntry {
  path: string;
  sha: string;
}

/** Fetch result */
export interface FetchResult {
  success: boolean;
  files: FetchedFile[];
  totalSize: number;
  error?: string;
}

// ============================================
// MITRE RESOLUTION
// ============================================

/** Resolved MITRE technique */
export interface ResolvedMitreTechnique {
  id: string; // T1059.001
  name: string; // PowerShell
  tactic: string; // Execution
  exists: boolean; // Verified in DB
}

// ============================================
// UI TYPES
// ============================================

/** Filter state for preview table */
export interface PreviewFilters {
  status: ('valid' | 'warning' | 'error' | 'duplicate')[];
  severity: Severity[];
  vendor: VendorFormat[];
  search: string;
  onlySelected: boolean;
}

/** Sort state for preview table */
export interface PreviewSort {
  field: 'title' | 'severity' | 'status' | 'vendor' | 'qualityScore';
  direction: 'asc' | 'desc';
}

/** Wizard step */
export type WizardStep =
  | 'source'
  | 'configure'
  | 'recon'
  | 'parsing'
  | 'validating'
  | 'preview'
  | 'confirm'
  | 'importing'
  | 'results';

// ============================================
// RECONNAISSANCE TYPES
// ============================================

/** Pre-import analysis report */
export interface ReconReport {
  source: ImportSourceType;
  repoInfo?: { owner: string; repo: string; defaultBranch: string };
  totalFilesInPath: number;
  matchingFiles: number;
  estimatedRules: number;
  filePaths: string[];
  /** Matching files with their git blob SHAs (GitHub only; parallel to filePaths). */
  fileEntries?: GitTreeEntry[];
  /** The branch/ref the tree was actually read from (may differ from the URL if it 404'd). */
  resolvedRef?: string;
  /** HTTP status from the tree API call, when it failed (404/403/...). */
  errorStatus?: number;
  existingLibraryCount: number;
  rateLimitInfo?: RateLimitInfo;
  warnings: string[];
}

/** GitHub API rate limit information */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetTime: Date | null;
  authenticated: boolean;
  estimatedApiCalls: number;
  willExceedLimit: boolean;
  isWaiting: boolean;
  waitingUntil: Date | null;
}

// ============================================
// ERROR CATEGORIZATION
// ============================================

/** Categories for import errors */
export type ImportErrorCategory =
  | 'parse_error'
  | 'validation_error'
  | 'duplicate'
  | 'permission_error'
  | 'database_error'
  | 'rate_limit'
  | 'network_error'
  | 'size_error'
  | 'format_error';

/** Categorized error with actionable suggestion */
export interface CategorizedError {
  category: ImportErrorCategory;
  code: string;
  message: string;
  suggestion: string;
  details?: string;
  fileName?: string;
  ruleTitle?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Maps vendor severity to Detection Severity */
export const mapSeverity = (level: string, riskScore?: number): Severity => {
  // Handle Splunk ESCU risk scores
  if (riskScore !== undefined) {
    if (riskScore >= 80) return Severity.Critical;
    if (riskScore >= 60) return Severity.High;
    if (riskScore >= 40) return Severity.Medium;
    if (riskScore >= 20) return Severity.Low;
    return Severity.Informational;
  }

  // Handle string levels (Sigma, Elastic, etc.)
  const normalized = level?.toLowerCase().trim();
  switch (normalized) {
    case 'critical':
      return Severity.Critical;
    case 'high':
      return Severity.High;
    case 'medium':
      return Severity.Medium;
    case 'low':
      return Severity.Low;
    case 'informational':
    case 'info':
      return Severity.Informational;
    default:
      return Severity.Medium;
  }
};

/** Maps vendor status to Detection Status */
export const mapStatus = (vendorStatus: string): Status => {
  const normalized = vendorStatus?.toLowerCase().trim();
  switch (normalized) {
    case 'stable':
    case 'production':
      return Status.Production;
    case 'test':
    case 'testing':
      return Status.Testing;
    case 'experimental':
    case 'development':
    case 'dev':
      return Status.Development;
    case 'deprecated':
      return Status.Deprecated;
    case 'unsupported':
    case 'archived':
      return Status.Archived;
    default:
      return Status.Draft;
  }
};

/** Maps vendor format to DetectionSource */
export const mapSource = (format: VendorFormat): DetectionSource => {
  switch (format) {
    case 'sigma':
      return 'sigmahq';
    case 'splunk_escu':
      return 'splunk_escu';
    case 'elastic':
      return 'elastic';
    case 'chronicle':
      return 'chronicle';
    case 'kql':
      return 'microsoft_sentinel';
    case 'crowdstrike_cql':
      return 'crowdstrike';
    default:
      return 'community';
  }
};

/** Extracts MITRE technique IDs from tags */
export const extractMitreFromTags = (tags: string[]): { techniqueIds: string[]; tactics: string[] } => {
  const techniqueIds: string[] = [];
  const tactics: string[] = [];

  const tacticMap: Record<string, string> = {
    reconnaissance: 'Reconnaissance',
    'resource-development': 'Resource Development',
    resource_development: 'Resource Development',
    'initial-access': 'Initial Access',
    initial_access: 'Initial Access',
    execution: 'Execution',
    persistence: 'Persistence',
    'privilege-escalation': 'Privilege Escalation',
    privilege_escalation: 'Privilege Escalation',
    'defense-evasion': 'Defense Evasion',
    defense_evasion: 'Defense Evasion',
    'credential-access': 'Credential Access',
    credential_access: 'Credential Access',
    discovery: 'Discovery',
    'lateral-movement': 'Lateral Movement',
    lateral_movement: 'Lateral Movement',
    collection: 'Collection',
    'command-and-control': 'Command and Control',
    command_and_control: 'Command and Control',
    exfiltration: 'Exfiltration',
    impact: 'Impact',
  };

  for (const tag of tags) {
    const lower = tag.toLowerCase().trim();

    // Match technique IDs: attack.t1059, attack.t1059.001
    const techMatch = lower.match(/attack\.t(\d{4}(?:\.\d{3})?)/);
    if (techMatch) {
      techniqueIds.push(`T${techMatch[1].toUpperCase()}`);
      continue;
    }

    // Match tactics: attack.execution, attack.defense-evasion
    const tacticMatch = lower.match(/attack\.([a-z_-]+)/);
    if (tacticMatch && tacticMap[tacticMatch[1]]) {
      const tactic = tacticMap[tacticMatch[1]];
      if (!tactics.includes(tactic)) {
        tactics.push(tactic);
      }
    }
  }

  return { techniqueIds: [...new Set(techniqueIds)], tactics };
};

/** Calculate quality score for a parsed rule using the unified scoring engine */
export { scoreRule as calculateQualityScore } from '../../lib/quality';
export type { QualityWeights } from '../../lib/quality';
