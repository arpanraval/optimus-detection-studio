/**
 * Onboarding Dashboard Types
 *
 * Type definitions, interfaces, and the official source registry
 * for the onboarding pipeline visualization UI. All onboarding
 * components import from this file.
 */

import type {
  ImportProgress,
  ImportJobConfig,
  ReconReport,
  CategorizedError,
  VendorFormat,
  ParsedRule,
  ValidatedRule,
} from '../../services/bulk-import/types';

// ============================================
// OFFICIAL SOURCE REGISTRY
// ============================================

/** A known, curated detection content source */
export interface OfficialSource {
  id: string;
  name: string;
  shortName: string;
  description: string;
  repoOwner: string;
  repoName: string;
  basePath: string;
  vendor: VendorFormat;
  format: VendorFormat;
  estimatedRules: number;
  color: string;
  iconUrl?: string;
}

/** Pre-configured official detection sources available for onboarding */
export const OFFICIAL_SOURCES: readonly OfficialSource[] = [
  {
    id: 'sigma-hq',
    name: 'Sigma HQ',
    shortName: 'Sigma',
    description: 'Community-driven generic SIEM rules in the Sigma format',
    repoOwner: 'SigmaHQ',
    repoName: 'sigma',
    basePath: 'rules',
    vendor: 'sigma',
    format: 'sigma',
    estimatedRules: 3083,
    color: '#06b6d4',
  },
  {
    id: 'splunk-escu',
    name: 'Splunk Security Content',
    shortName: 'Splunk',
    description: 'Splunk Enterprise Security Content Update (ESCU) analytic stories',
    repoOwner: 'splunk',
    repoName: 'security_content',
    basePath: 'detections',
    vendor: 'splunk_escu',
    format: 'splunk_escu',
    estimatedRules: 1500,
    color: '#f97316',
  },
  {
    id: 'elastic-detection-rules',
    name: 'Elastic Detection Rules',
    shortName: 'Elastic',
    description: 'Elastic Security detection rules for the Elastic SIEM',
    repoOwner: 'elastic',
    repoName: 'detection-rules',
    basePath: 'rules',
    vendor: 'elastic',
    format: 'elastic',
    estimatedRules: 1200,
    color: '#3b82f6',
  },
  {
    id: 'chronicle-detection-rules',
    name: 'Chronicle Detection Rules',
    shortName: 'Chronicle',
    description: 'Google Chronicle YARA-L community detection rules',
    repoOwner: 'chronicle',
    repoName: 'detection-rules',
    basePath: 'rules/community',
    vendor: 'chronicle',
    format: 'chronicle',
    estimatedRules: 400,
    color: '#4D7C6F',
  },
  {
    id: 'microsoft-sentinel',
    name: 'Microsoft Sentinel Detections',
    shortName: 'Sentinel',
    description: 'Microsoft Sentinel analytic rules and detection templates',
    repoOwner: 'Azure',
    repoName: 'Azure-Sentinel',
    basePath: 'Detections',
    vendor: 'kql',
    format: 'kql',
    estimatedRules: 800,
    color: '#a855f7',
  },
  {
    id: 'defender-xdr',
    name: 'Defender XDR Hunting Queries',
    shortName: 'Defender',
    description: 'Microsoft 365 Defender advanced hunting queries',
    repoOwner: 'Azure',
    repoName: 'Azure-Sentinel',
    basePath: 'Hunting Queries/Microsoft 365 Defender',
    vendor: 'kql',
    format: 'kql',
    estimatedRules: 500,
    color: '#14b8a6',
  },
] as const;

// ============================================
// SOURCE STATUS & STATE
// ============================================

/** Lifecycle status for a source during onboarding */
export type SourceStatus =
  | 'idle'
  | 'recon'
  | 'ready'
  | 'fetching'
  | 'parsing'
  | 'validating'
  | 'inserting'
  | 'complete'
  | 'error'
  | 'paused';

/** A selectable folder discovered during recon */
export interface FolderInfo {
  name: string;
  path: string;
  fileCount: number;
  selected: boolean;
}

/** Full runtime state for a single source throughout the onboarding pipeline */
export interface SourceState {
  source: OfficialSource;
  selected: boolean;
  status: SourceStatus;
  folders: FolderInfo[];
  reconReport?: ReconReport;
  progress?: ImportProgress;
  errors: CategorizedError[];
  importedCount: number;
  duplicateCount: number;
  errorMessage?: string;
}

// ============================================
// PIPELINE VISUALIZATION
// ============================================

/** Discrete stage in the import pipeline */
export type PipelineStage = 'fetch' | 'parse' | 'validate' | 'normalize' | 'store';

/** Runtime state for a single pipeline stage */
export interface StageState {
  stage: PipelineStage;
  status: 'idle' | 'active' | 'complete' | 'error';
  counter: number;
  secondaryCounter?: number;
  label: string;
}

/** An animated stream connecting pipeline stages */
export interface StreamState {
  sourceId: string;
  from: PipelineStage | 'source';
  to: PipelineStage | 'destination';
  status: 'idle' | 'active' | 'complete' | 'error' | 'paused';
  color: string;
}

// ============================================
// LIVE STATISTICS
// ============================================

/** Aggregated real-time statistics across all sources */
export interface LiveStats {
  totalImported: number;
  byPlatform: Record<string, number>;
  bySeverity: Record<string, number>;
  bySource: Record<string, number>;
  mitreTactics: Set<string>;
  mitreTechniques: Set<string>;
  avgQualityScore: number;
}

// ============================================
// CONSOLE LOG
// ============================================

/** Severity level for a console entry */
export type ConsoleLevel = 'info' | 'ok' | 'warn' | 'error';

/** A single log entry in the onboarding console */
export interface ConsoleEntry {
  id: string;
  timestamp: Date;
  sourceId: string;
  sourceName: string;
  message: string;
  level: ConsoleLevel;
}

// ============================================
// ONBOARDING ORCHESTRATION
// ============================================

/** Top-level phase the onboarding UI is in */
export type OnboardingPhase = 'selection' | 'processing' | 'confirming' | 'importing' | 'embedding' | 'complete';

/** Full context value exposed by the OnboardingProvider */
export interface OnboardingContextValue {
  // State
  phase: OnboardingPhase;
  sources: SourceState[];
  stages: StageState[];
  streams: StreamState[];
  liveStats: LiveStats;
  consoleEntries: ConsoleEntry[];
  incompleteJobId?: string;

  // Actions
  toggleSource: (sourceId: string) => void;
  toggleFolder: (sourceId: string, folderPath: string) => void;
  selectAllFolders: (sourceId: string) => void;
  deselectAllFolders: (sourceId: string) => void;
  initializeOnboarding: () => Promise<void>;
  retrySource: (sourceId: string) => Promise<void>;
  retryAll: () => Promise<void>;
  abort: () => void;
  getParsedRulesForImport: () => ParsedRule[];
  getValidatedRulesForImport: () => { rules: ValidatedRule[]; jobConfig: ImportJobConfig };
  resetPhase: (phase: OnboardingPhase) => void;
  syncImportProgress: (progress: ImportProgress) => void;
  /** Marks the pipeline complete once the visual queue has drained (capped), then enters the complete phase. */
  completeImportPipeline: () => Promise<void>;
}
