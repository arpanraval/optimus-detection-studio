/**
 * Type definitions for the Threat Intel Digest v2 edge function.
 */

import { canonicalizeIoCType } from '../../_shared/ioc-type.ts'

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

export type RetrySectionType = 'summary' | 'classification' | 'ttps' | 'iocs' | 'rules' | 'mitre' | 'library';

export interface DigestRequest {
  sourceType: 'url' | 'paste';
  url?: string;
  content?: string;
  model?: string;
  options?: DigestOptions;
  retrySection?: RetrySectionType;
  existingReport?: ThreatReport;
  promptTemplates?: PromptTemplates;
  reportId?: string;
}

export interface DigestOptions {
  extractIoCs?: boolean;
  extractRules?: boolean;
  mapToMitre?: boolean;
  extractionMethod?: 'direct' | 'jina_reader';
  includeOwnedDevelopmentDetections?: boolean;
  findLibraryMatches?: boolean;
  autoDigest?: boolean;
}

export interface PromptTemplates {
  systemInstruction?: string;
  summary?: string;
  classification?: string;
  ttps?: string;
  iocsAndRules?: string;
}

export interface DigestResponse {
  success: boolean;
  report?: ThreatReport;
  error?: string;
  processingTimeMs?: number;
}

// =============================================================================
// ENUMS
// =============================================================================

export enum ThreatLevel {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  Informational = 'Informational'
}

export enum AttackType {
  APT = 'APT',
  Ransomware = 'Ransomware',
  SupplyChain = 'Supply Chain',
  Phishing = 'Phishing',
  Cryptomining = 'Cryptomining',
  Botnet = 'Botnet',
  Espionage = 'Espionage',
  Hacktivism = 'Hacktivism',
  FinancialCrime = 'Financial Crime',
  ZeroDay = 'Zero-Day Exploit',
  Wiper = 'Wiper',
  Infostealer = 'Infostealer',
  RAT = 'RAT',
  Other = 'Other',
  Unknown = 'Unknown'
}

export enum ProcessingStage {
  Idle = 'idle',
  Fetching = 'fetching',
  Parsing = 'parsing',
  ExtractingSummary = 'extracting_summary',
  ExtractingTTPs = 'extracting_ttps',
  ExtractingIoCs = 'extracting_iocs',
  ExtractingRules = 'extracting_rules',
  MappingMitre = 'mapping_mitre',
  FindingLibraryMatches = 'finding_library_matches',
  Complete = 'complete',
  Error = 'error'
}

// =============================================================================
export type ReportOutcome = 'complete' | 'partial' | 'failed' | 'cancelled';

// REPORT DATA STRUCTURES
// =============================================================================

export interface ThreatReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  outcome?: ReportOutcome;
  sectionOutcomes?: Record<string, 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'retained_previous'>;
  sourceType: 'url' | 'paste';
  sourceUrl?: string;
  rawContentPreview?: string;
  rawContent?: string;
  summary: ReportSummary | null;
  classification: ReportClassification | null;
  ttps: ExtractedTTP[];
  iocs: ExtractedIoC[];
  rules: ExtractedRule[];
  mitreMapping: MitreMapping;
  libraryMatches: LibraryMatch[];
  coveragePercent?: number | null;
  libraryOverlapPercent?: number | null;
  validatedOverlapPercent?: number | null;
  deploymentReadinessPercent?: number | null;
  /**
   * Assessed by the auto-digest orchestrator, which has the environment
   * profile; this function has no feasibility stage. Carried on the report
   * anyway because the client swaps its whole session for this object, so a
   * missing field reads as "feasibility not computed" on a report whose row
   * holds a number. `null` means a retry replaced the TTP set and the previous
   * assessment is void -- distinct from 0, which claims nothing is feasible.
   */
  feasibleGapCount?: number | null;
  infeasibleGapCount?: number | null;
  overlapCalculatedAt?: string;
  processingStage: ProcessingStage;
  processingError?: string;
  processingDurationMs?: number;
  sectionErrors?: Record<string, string>;
  lastRetrySection?: RetrySectionType;
  lastRetryTime?: string;
  sourceQuality?: 'full_article' | 'partial_article' | 'feed_summary' | 'title_only' | 'unavailable' | 'legacy_unverified';
  sourceContentLength?: number;
  sourceContentHash?: string;
  fetchedUrl?: string;
  qualityWarnings?: string[];
  possibleActorMentions?: string[];
}

export interface ReportSummary {
  title: string;
  publishDate?: string;
  author?: string;
  organization?: string;
  executiveSummary: string;
  keyFindings: string[];
  threatLevel: ThreatLevel;
  targetedIndustries?: string[];
  targetedRegions?: string[];
  attackTimeline?: {
    firstSeen?: string;
    lastSeen?: string;
    duration?: string;
  };
}

export interface ReportClassification {
  primaryType: AttackType;
  secondaryTypes?: AttackType[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface ExtractedTTP {
  id: string;
  mitreId: string;
  techniqueName: string;
  tacticName: string;
  tacticId: string;
  sourceType: 'explicit' | 'contextual';
  confidence: 'high' | 'medium' | 'low';
  provenance?: 'explicit' | 'inferred' | 'validated' | 'rejected' | 'analyst_verified';
  validationState?: 'pending' | 'validated' | 'rejected' | 'analyst_verified';
  evidence: string;
  explanation: string;
  isSubTechnique: boolean;
  parentTechniqueId?: string;
  hasExistingDetection?: boolean;
  existingDetectionCount?: number;
  existingDetectionIds?: string[];
  evidenceSupported?: boolean;
}

export interface ExtractedIoC {
  id: string;
  type: string;
  category: string;
  value: string;
  severity: 'malicious' | 'suspicious' | 'unknown';
  context?: string;
  defanged?: boolean;
  originalValue?: string;
  potentialFalsePositive?: boolean;
  falsePositiveReason?: string;
  evidenceSupported?: boolean;
}

export interface ExtractedRule {
  id: string;
  type: string;
  /** See E3 -- `type` conflated query languages with references and prose. */
  kind?: 'query' | 'reference' | 'description';
  typeRecognized?: boolean;
  name: string;
  content: string;
  description?: string;
  relatedTTPs?: string[];
  provenance?: 'verbatim' | 'pattern_extracted' | 'reconstructed' | 'generated' | 'external_link';
  isValidated?: boolean;
  validationStatus?: 'candidate' | 'validated' | 'rejected';
  evidenceSupported?: boolean;
}

// =============================================================================
// MITRE MAPPING
// =============================================================================

export interface MitreMapping {
  matchedGroups: MitreEntityMatch[];
  matchedCampaigns: MitreEntityMatch[];
  matchedSoftware: MitreEntityMatch[];
  matchedTechniques: TechniqueMatch[];
  tacticCoverage: TacticCoverage[];
}

export interface MitreEntityMatch {
  stixId: string;
  mitreId: string;
  name: string;
  type: string;
  matchConfidence: 'high' | 'medium' | 'low';
  matchReason: string;
  aliases?: string[];
  existsInDb: boolean;
}

export interface TechniqueMatch {
  mitreId: string;
  techniqueName: string;
  stixId: string;
  tacticId?: string;
  tacticName?: string;
  isValid: boolean;
  existsInDb: boolean;
  platforms?: string[];
  dataSources?: string[];
}

export interface TacticCoverage {
  tacticId: string;
  tacticName: string;
  techniqueCount: number;
  techniques: string[];
}

// =============================================================================
// LIBRARY MATCHES
// =============================================================================

export interface LibraryMatch {
  detectionId: string;
  detectionName: string;
  matchType: 'ttp_match' | 'group_related';
  matchedTTPs: string[];
  coverageScore: number;
  status: string;
  severity: string;
  relatedGroupStixId?: string;
  relatedGroupName?: string;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

export interface StageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

export interface FetchResult {
  content: string;
  title?: string;
  metadata?: {
    author?: string;
    publishDate?: string;
    organization?: string;
    sourceQuality?: 'full_article' | 'partial_article' | 'feed_summary' | 'title_only' | 'unavailable' | 'legacy_unverified';
    sourceContentLength?: number;
    sourceContentHash?: string;
    fetchedUrl?: string;
  };
}

export type Provider = 'google' | 'openai' | 'anthropic';

export const MODEL_PROVIDERS: Record<string, Provider> = {
  'gemini-3.6-flash': 'google',
  'gemini-3.5-flash-lite': 'google',
  'gemini-3.1-flash-lite-image': 'google',
  'gemini-3.8-flash': 'google',
  'gpt-5.6-sol': 'openai',
  'gpt-5.6-terra': 'openai',
  'gpt-5.6-luna': 'openai',
  'claude-opus-5': 'anthropic',
  'claude-sonnet-5': 'anthropic',
};

export const DEFAULT_MODEL = 'gemini-3.6-flash';

// =============================================================================
// IoC CATEGORIES
// =============================================================================

export const IOC_TYPE_TO_CATEGORY: Record<string, string> = {
  // Network
  ipv4: 'network',
  ipv6: 'network',
  domain: 'network',
  url: 'network',
  email: 'network',
  asn: 'network',
  cidr: 'network',
  user_agent: 'network',
  ja3: 'network',
  ja3s: 'network',
  ssl_cert: 'network',
  // Hashes
  md5: 'hashes',
  sha1: 'hashes',
  sha256: 'hashes',
  sha512: 'hashes',
  ssdeep: 'hashes',
  imphash: 'hashes',
  // `mapIoCType` falls back to the literal 'hash' when the model names no
  // `hash_type`, so this is a type this pipeline emits itself.
  hash: 'hashes',
  // Files
  file_path: 'files',
  file_name: 'files',
  pdb_path: 'files',
  // Windows
  // `registry` and `registry_key` are separate entries, not a merge: the
  // client enum declares both as distinct types and `mapIoCType` emits the
  // former for the `registry_keys` bucket. Whether they should be one type is
  // a taxonomy question (D3); which category they belong to is not.
  registry: 'windows',
  registry_key: 'windows',
  mutex: 'windows',
  named_pipe: 'windows',
  service_name: 'windows',
  scheduled_task: 'windows',
  // Execution
  process_name: 'execution',
  command_line: 'execution',
  // Vulnerabilities
  cve: 'vulnerabilities',
  // Crypto
  bitcoin_address: 'crypto',
  ethereum_address: 'crypto',
  // `mapIoCType` falls back to the literal 'crypto' when the model names no
  // `currency_type`, so this is a type this pipeline emits itself.
  crypto: 'crypto',
  // Mobile
  android_package: 'mobile',
  ios_bundle: 'mobile',
  // Other
  mac_address: 'other',
  ssh_key: 'other',
};

export interface ResolvedIoCCategory {
  /** The mapped category; 'other' when the type has no entry. */
  category: string;
  /** False when the type is absent from the map -- then 'other' is a guess. */
  recognized: boolean;
}

/**
 * Resolve a type to its category, reporting whether the answer was looked up
 * or defaulted.
 *
 * The distinction matters because 'other' is a legitimate category
 * (`mac_address`, `ssh_key`) as well as the default, so a caller reading a
 * bare string cannot tell "this belongs in Other" from "no idea". That
 * conflation is how `registry` and `crypto` were filed under OTHER for a
 * month: both are absent from the map, both got 'other', and nothing
 * distinguished that from an answer. Same reasoning as
 * `canonicalizeIoCType`'s `recognized` flag, which exists for the type what
 * this exists for the category.
 */
export function resolveIoCCategory(type: string): ResolvedIoCCategory {
  // Canonicalise first. This map is keyed on canonical spellings, so a
  // `sha-256` from the model missed every key and fell to 'other' -- the
  // reason 25 stored hashes sat outside the Hashes filter.
  const mapped = IOC_TYPE_TO_CATEGORY[canonicalizeIoCType(type).type];
  return mapped ? { category: mapped, recognized: true } : { category: 'other', recognized: false };
}

export function getIoCCategory(type: string): string {
  return resolveIoCCategory(type).category;
}
