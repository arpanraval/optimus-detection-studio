// Threat Intelligence Report Digest Types

// ============================================
// ENUMS
// ============================================

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

export enum TTPSourceType {
  Explicit = 'explicit',
  Contextual = 'contextual'
}

export enum IoCType {
  // Network
  IPv4 = 'ipv4',
  IPv6 = 'ipv6',
  Domain = 'domain',
  Subdomain = 'subdomain',
  URL = 'url',
  URI = 'uri',
  Email = 'email',
  EmailSubject = 'email_subject',
  ASN = 'asn',
  CIDR = 'cidr',

  // Hashes
  MD5 = 'md5',
  SHA1 = 'sha1',
  SHA256 = 'sha256',
  SHA512 = 'sha512',
  SSDEEP = 'ssdeep',
  IMPHASH = 'imphash',

  // Files
  FilePath = 'file_path',
  FilePathWin = 'file_path_win',
  FilePathUnix = 'file_path_unix',
  FileName = 'file_name',
  Directory = 'directory',

  // Windows
  Registry = 'registry',
  RegistryKey = 'registry_key',
  RegistryValue = 'registry_value',
  Mutex = 'mutex',
  PipeName = 'pipe_name',
  ServiceName = 'service_name',
  ScheduledTask = 'scheduled_task',
  ProcessName = 'process_name',
  CommandLine = 'command_line',
  PowerShellCommand = 'powershell_command',

  // Certificates
  CertificateSerial = 'certificate_serial',
  CertificateThumbprint = 'certificate_thumbprint',
  CertificateIssuer = 'certificate_issuer',

  // Network Fingerprints
  UserAgent = 'user_agent',
  JA3 = 'ja3',
  JA3S = 'ja3s',
  JARM = 'jarm',

  // Vulnerabilities
  CVE = 'cve',
  Vulnerability = 'vulnerability',

  // Crypto
  BitcoinAddress = 'bitcoin_address',
  EthereumAddress = 'ethereum_address',

  // Rules
  YARARule = 'yara_rule_name',
  SigmaRule = 'sigma_rule_name',

  // Other
  Other = 'other'
}

export enum IoCCategory {
  Network = 'network',
  Hashes = 'hashes',
  Files = 'files',
  Windows = 'windows',
  Certificates = 'certificates',
  Vulnerabilities = 'vulnerabilities',
  Crypto = 'crypto',
  Other = 'other'
}

export enum ExtractedRuleType {
  YARA = 'yara',
  Sigma = 'sigma',
  KQL = 'kql',
  SPL = 'spl',
  EQL = 'eql',
  Snort = 'snort',
  Suricata = 'suricata',
  GitHub = 'github_reference',
  Other = 'other'
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

// ============================================
// CORE INTERFACES
// ============================================

export interface ThreatReport {
  id: string;
  createdAt: string;
  updatedAt: string;

  // Input
  sourceType: 'url' | 'paste';
  sourceUrl?: string;
  rawContentPreview?: string; // First 500 chars for reference
  rawContent?: string; // Full content for retry (only stored if paste or needed for retry)

  // Extracted Data
  summary: ReportSummary;
  classification: ReportClassification;
  ttps: ExtractedTTP[];
  iocs: ExtractedIoC[];
  rules: ExtractedRule[];
  mitreMapping: MitreMapping;
  libraryMatches: LibraryMatch[];

  // Processing State
  processingStage: ProcessingStage;
  processingError?: string;
  processingDurationMs?: number;

  // Section-level errors for retry
  sectionErrors?: {
    summary?: string;
    classification?: string;
    ttps?: string;
    iocs?: string;
    rules?: string;
    mitre?: string;
    library?: string;
  };
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
  mitreId: string;           // T1059.001
  techniqueName: string;     // PowerShell
  tacticName: string;        // Execution
  tacticId: string;          // TA0002
  sourceType: TTPSourceType;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;          // Quote or context from report
  explanation: string;       // Why this TTP was identified
  isSubTechnique: boolean;
  parentTechniqueId?: string;

  // Library coverage (populated after MITRE mapping)
  hasExistingDetection?: boolean;
  existingDetectionCount?: number;
  existingDetectionIds?: string[];
}

export interface ExtractedIoC {
  id: string;
  type: IoCType;
  category: IoCCategory;
  value: string;
  severity: 'malicious' | 'suspicious' | 'unknown';
  context?: string;          // Where in report it appeared
  firstSeen?: string;
  lastSeen?: string;
  tags?: string[];
  relatedIoCs?: string[];    // IDs of related IoCs
  defanged?: boolean;        // If URL/IP was defanged in original
  originalValue?: string;    // Original defanged value if re-fanged
}

export interface ExtractedRule {
  id: string;
  type: ExtractedRuleType;
  name?: string;
  content: string;
  sourceUrl?: string;        // GitHub link or original source
  description?: string;
  author?: string;
  relatedTTPs?: string[];    // MITRE IDs this rule covers
}

export interface MitreMapping {
  // Matched existing MITRE entities
  matchedGroups: MitreEntityMatch[];
  matchedCampaigns: MitreEntityMatch[];
  matchedSoftware: MitreEntityMatch[];

  // Validated techniques
  matchedTechniques: TechniqueMatch[];

  // Tactic coverage analysis
  tacticCoverage: TacticCoverage[];

  // Suggestions for new/unmatched entities
  suggestedNewGroup?: SuggestedMitreEntity;
  suggestedNewCampaign?: SuggestedMitreEntity;
  suggestedNewSoftware?: SuggestedMitreEntity[];
}

export interface MitreEntityMatch {
  stixId: string;
  mitreId: string;           // G0016, S0154, C0001
  name: string;
  type: 'intrusion-set' | 'campaign' | 'malware' | 'tool';
  matchConfidence: 'high' | 'medium' | 'low';
  matchReason: string;       // Why this entity was matched
  aliases?: string[];
  existsInDb: boolean;

  // From report
  mentionedAliases?: string[];
  evidenceQuotes?: string[];
}

export interface TechniqueMatch {
  mitreId: string;
  techniqueName: string;
  tacticId: string;
  tacticName: string;
  isValid: boolean;          // Does it exist in MITRE database
  existsInDb: boolean;
  platforms?: string[];
  dataSources?: string[];
}

export interface TacticCoverage {
  tacticId: string;
  tacticName: string;
  techniqueCount: number;
  techniques: string[];      // MITRE IDs
}

export interface SuggestedMitreEntity {
  suggestedName: string;
  suggestedAliases?: string[];
  suggestedDescription: string;
  entityType: 'intrusion-set' | 'campaign' | 'malware' | 'tool';
  relatedTechniques?: string[];  // MITRE IDs
  relatedSoftware?: string[];
  confidence: 'high' | 'medium' | 'low';
  evidenceQuotes?: string[];
}

export interface LibraryMatch {
  detectionId: string;
  detectionName: string;
  matchType: 'ttp_match' | 'group_related' | 'ioc_coverage' | 'similar_threat';
  matchedTTPs?: string[];     // Which TTPs this detection covers
  matchedIoCs?: string[];     // Which IoCs this detection covers
  coverageScore: number;      // 0-100
  status: string;             // Detection status
  severity: string;

  // For group_related matches
  relatedGroupStixId?: string;
  relatedGroupName?: string;
}

// ============================================
// SESSION & UI STATE
// ============================================

export interface ThreatIntelSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  report?: ThreatReport;

  // User selections
  selectedTTPIds: string[];
  selectedIoCIds: string[];

  // Actions taken
  createdDetectionIds: string[];
  updatedEntities: UpdatedEntityRecord[];

  // Auto-digest provenance & feasibility (populated from DB for auto-digested reports)
  source?: 'manual' | 'auto';
  sourceFeedName?: string;
  sourceArticleUrl?: string;
  feasibleGapCount?: number;
  infeasibleGapCount?: number;
}

export interface UpdatedEntityRecord {
  entityType: 'group' | 'campaign' | 'software';
  entityId: string;
  entityName: string;
  updateType: 'reference_added' | 'alias_added' | 'technique_added';
  timestamp: string;
}

export interface ThreatIntelSessionSummary {
  id: string;
  name: string;
  updatedAt: number;
  reportTitle?: string;
  ttpCount: number;
  iocCount: number;
  ruleCount: number;
  threatLevel?: ThreatLevel;
  attackType?: AttackType;
  attribution?: string;
  organization?: string;
  coveragePercent?: number;
  source?: 'manual' | 'auto';
  sourceFeedName?: string;
  sourceArticleUrl?: string;
  reviewStatus?: 'pending' | 'reviewed' | 'actioned' | 'deferred' | 'dismissed';
  reviewNote?: string;
  relevanceScore?: number;
  feasibleGapCount?: number;
  infeasibleGapCount?: number;
  campaignId?: string;
}

// ============================================
// API REQUEST/RESPONSE
// ============================================

export interface DigestReportRequest {
  sourceType: 'url' | 'paste';
  url?: string;
  content?: string;
  model?: string;
  options?: DigestOptions;
  // For retry functionality
  retrySection?: RetrySectionType;
  existingReport?: ThreatReport;
}

export type RetrySectionType = 'summary' | 'classification' | 'ttps' | 'iocs' | 'rules' | 'mitre' | 'library';

export interface DigestOptions {
  extractIoCs: boolean;
  extractRules: boolean;
  mapToMitre: boolean;
  findLibraryMatches: boolean;
}

export interface DigestReportResponse {
  success: boolean;
  report?: ThreatReport;
  error?: string;
  processingTimeMs?: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getIoCCategory(type: IoCType): IoCCategory {
  const networkTypes = [IoCType.IPv4, IoCType.IPv6, IoCType.Domain, IoCType.Subdomain, IoCType.URL, IoCType.URI, IoCType.Email, IoCType.EmailSubject, IoCType.ASN, IoCType.CIDR, IoCType.UserAgent, IoCType.JA3, IoCType.JA3S, IoCType.JARM];
  const hashTypes = [IoCType.MD5, IoCType.SHA1, IoCType.SHA256, IoCType.SHA512, IoCType.SSDEEP, IoCType.IMPHASH];
  const fileTypes = [IoCType.FilePath, IoCType.FileName, IoCType.Directory];
  const windowsTypes = [IoCType.RegistryKey, IoCType.RegistryValue, IoCType.Mutex, IoCType.PipeName, IoCType.ServiceName, IoCType.ScheduledTask, IoCType.ProcessName, IoCType.CommandLine, IoCType.PowerShellCommand];
  const certTypes = [IoCType.CertificateSerial, IoCType.CertificateThumbprint, IoCType.CertificateIssuer];
  const vulnTypes = [IoCType.CVE, IoCType.Vulnerability];
  const cryptoTypes = [IoCType.BitcoinAddress, IoCType.EthereumAddress];

  if (networkTypes.includes(type)) return IoCCategory.Network;
  if (hashTypes.includes(type)) return IoCCategory.Hashes;
  if (fileTypes.includes(type)) return IoCCategory.Files;
  if (windowsTypes.includes(type)) return IoCCategory.Windows;
  if (certTypes.includes(type)) return IoCCategory.Certificates;
  if (vulnTypes.includes(type)) return IoCCategory.Vulnerabilities;
  if (cryptoTypes.includes(type)) return IoCCategory.Crypto;
  return IoCCategory.Other;
}

export function getThreatLevelColor(level: ThreatLevel): string {
  switch (level) {
    case ThreatLevel.Critical: return '#DC2626'; // red-600
    case ThreatLevel.High: return '#EA580C'; // orange-600
    case ThreatLevel.Medium: return '#D97706'; // amber-600
    case ThreatLevel.Low: return '#2563EB'; // blue-600
    case ThreatLevel.Informational: return '#6B7280'; // gray-500
    default: return '#6B7280';
  }
}

export function getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high': return '#16A34A'; // green-600
    case 'medium': return '#D97706'; // amber-600
    case 'low': return '#DC2626'; // red-600
    default: return '#6B7280';
  }
}

export function getIoCTypeLabel(type: IoCType): string {
  const labels: Record<IoCType, string> = {
    [IoCType.IPv4]: 'IPv4',
    [IoCType.IPv6]: 'IPv6',
    [IoCType.Domain]: 'Domain',
    [IoCType.Subdomain]: 'Subdomain',
    [IoCType.URL]: 'URL',
    [IoCType.URI]: 'URI',
    [IoCType.Email]: 'Email',
    [IoCType.EmailSubject]: 'Email Subject',
    [IoCType.ASN]: 'ASN',
    [IoCType.CIDR]: 'CIDR',
    [IoCType.MD5]: 'MD5',
    [IoCType.SHA1]: 'SHA1',
    [IoCType.SHA256]: 'SHA256',
    [IoCType.SHA512]: 'SHA512',
    [IoCType.SSDEEP]: 'SSDEEP',
    [IoCType.IMPHASH]: 'IMPHASH',
    [IoCType.FilePath]: 'File Path',
    [IoCType.FilePathWin]: 'Windows File Path',
    [IoCType.FilePathUnix]: 'Unix File Path',
    [IoCType.FileName]: 'File Name',
    [IoCType.Directory]: 'Directory',
    [IoCType.Registry]: 'Registry',
    [IoCType.RegistryKey]: 'Registry Key',
    [IoCType.RegistryValue]: 'Registry Value',
    [IoCType.Mutex]: 'Mutex',
    [IoCType.PipeName]: 'Named Pipe',
    [IoCType.ServiceName]: 'Service Name',
    [IoCType.ScheduledTask]: 'Scheduled Task',
    [IoCType.ProcessName]: 'Process Name',
    [IoCType.CommandLine]: 'Command Line',
    [IoCType.PowerShellCommand]: 'PowerShell',
    [IoCType.CertificateSerial]: 'Cert Serial',
    [IoCType.CertificateThumbprint]: 'Cert Thumbprint',
    [IoCType.CertificateIssuer]: 'Cert Issuer',
    [IoCType.UserAgent]: 'User Agent',
    [IoCType.JA3]: 'JA3',
    [IoCType.JA3S]: 'JA3S',
    [IoCType.JARM]: 'JARM',
    [IoCType.CVE]: 'CVE',
    [IoCType.Vulnerability]: 'Vulnerability',
    [IoCType.BitcoinAddress]: 'Bitcoin',
    [IoCType.EthereumAddress]: 'Ethereum',
    [IoCType.YARARule]: 'YARA Rule',
    [IoCType.SigmaRule]: 'Sigma Rule',
    [IoCType.Other]: 'Other'
  };
  return labels[type] || type;
}

export function getRuleTypeLabel(type: ExtractedRuleType): string {
  const labels: Record<ExtractedRuleType, string> = {
    [ExtractedRuleType.YARA]: 'YARA',
    [ExtractedRuleType.Sigma]: 'Sigma',
    [ExtractedRuleType.KQL]: 'KQL',
    [ExtractedRuleType.SPL]: 'Splunk SPL',
    [ExtractedRuleType.EQL]: 'EQL',
    [ExtractedRuleType.Snort]: 'Snort',
    [ExtractedRuleType.Suricata]: 'Suricata',
    [ExtractedRuleType.GitHub]: 'GitHub Reference',
    [ExtractedRuleType.Other]: 'Other'
  };
  return labels[type] || type;
}

export const PROCESSING_STAGES: { id: ProcessingStage; label: string; activeLabel: string }[] = [
  { id: ProcessingStage.Fetching, label: 'Fetch content', activeLabel: 'Fetching content...' },
  { id: ProcessingStage.Parsing, label: 'Parse document', activeLabel: 'Parsing document...' },
  { id: ProcessingStage.ExtractingSummary, label: 'Extract summary', activeLabel: 'Extracting summary...' },
  { id: ProcessingStage.ExtractingTTPs, label: 'Identify TTPs', activeLabel: 'Identifying TTPs...' },
  { id: ProcessingStage.ExtractingIoCs, label: 'Extract indicators', activeLabel: 'Extracting indicators...' },
  { id: ProcessingStage.ExtractingRules, label: 'Find rules', activeLabel: 'Finding detection rules...' },
  { id: ProcessingStage.MappingMitre, label: 'Map to MITRE', activeLabel: 'Mapping to MITRE ATT&CK...' },
  { id: ProcessingStage.FindingLibraryMatches, label: 'Check coverage', activeLabel: 'Checking library coverage...' },
];

export function generateReportId(): string {
  return `report_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
}
