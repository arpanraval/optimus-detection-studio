import { Status } from './enums';

// ============================================
// INTEGRATION TYPES
// ============================================

/** Supported integration providers */
export type IntegrationProvider =
  | 'splunk'
  | 'sentinel'
  | 'defender_xdr'
  | 'elastic'
  | 'crowdstrike'
  | 'github'
  | 'gitlab'
  | 'azure_devops'
  | 'chronicle'
  | 'jira'
  | 'slack';

/** Integration category grouping */
export type IntegrationCategory = 'siem' | 'version_control' | 'automation';

/** Connection lifecycle status */
export type IntegrationStatus = 'configured' | 'testing' | 'connected' | 'error' | 'disabled';

/** Authentication method for the integration */
export type IntegrationAuthType =
  | 'basic'
  | 'token'
  | 'api_key'
  | 'oauth2_client_credentials'
  | 'webhook';

// -- Provider-specific non-secret configs --

export interface SplunkConfig {
  host: string;
  port: number;
  app?: string;
  owner?: string;
  ssl: boolean;
}

export interface SentinelConfig {
  tenantId: string;
  subscriptionId: string;
  resourceGroup: string;
  workspaceName: string;
}

export interface DefenderXdrConfig {
  tenantId: string;
}

export interface ElasticConfig {
  host?: string;
  port?: number;
  cloudId?: string;
  ssl: boolean;
  spaceId?: string;
}

export interface CrowdStrikeConfig {
  baseUrl: string;       // e.g. "https://api.crowdstrike.com" (varies by cloud region)
  customerId: string;    // CID -- required for rule creation
}

export interface ChronicleConfig {
  region: string;        // "us", "europe", "asia-southeast1"
  customerId: string;    // Chronicle customer ID (UUID format)
  projectId?: string;    // GCP project ID (for newer v1 resource-based API)
  instanceId?: string;   // SecOps instance ID (for v1 API)
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch?: string;
}

export interface GitLabConfig {
  host?: string;
  projectId: string;
  branch?: string;
}

export interface AzureDevOpsConfig {
  organization: string;
  project: string;
  repository: string;
}

export interface JiraConfig {
  host: string;
  projectKey: string;
}

export interface SlackConfig {
  channel?: string;
}

/** Union of all provider configs */
export type IntegrationConfig =
  | SplunkConfig
  | SentinelConfig
  | DefenderXdrConfig
  | ElasticConfig
  | CrowdStrikeConfig
  | ChronicleConfig
  | GitHubConfig
  | GitLabConfig
  | AzureDevOpsConfig
  | JiraConfig
  | SlackConfig;

/** Map provider to its config type */
export interface ProviderConfigMap {
  splunk: SplunkConfig;
  sentinel: SentinelConfig;
  defender_xdr: DefenderXdrConfig;
  elastic: ElasticConfig;
  github: GitHubConfig;
  gitlab: GitLabConfig;
  azure_devops: AzureDevOpsConfig;
  jira: JiraConfig;
  slack: SlackConfig;
  crowdstrike: CrowdStrikeConfig;
  chronicle: ChronicleConfig;
}

// -- Core integration record --

export interface Integration {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  name: string;
  category: IntegrationCategory;
  config: IntegrationConfig;
  auth_type: IntegrationAuthType;
  status: IntegrationStatus;
  last_tested_at: string | null;
  last_test_result: ConnectionTestResult | null;
  last_synced_at: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Result of a connection test */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms: number;
}

// -- Deployment tracking --

export type DeploymentAction = 'create' | 'update' | 'delete' | 'enable' | 'disable';
export type DeploymentRecordStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back';

export interface DeploymentRecord {
  id: string;
  user_id: string;
  integration_id: string;
  detection_id: string;
  action: DeploymentAction;
  status: DeploymentRecordStatus;
  vendor_rule_id: string | null;
  query_language: string | null;
  deployed_query: string | null;
  rule_config: VendorRuleConfig | null;
  response: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  detection_version: number | null;
  detection_hash: string | null;
  created_at: string;
}

// -- Deployment eligibility validation --

export type DeployValidationErrorCode =
  | 'DETECTION_NOT_FOUND'
  | 'DETECTION_NOT_DEPLOYABLE_STATUS'
  | 'DETECTION_NO_QUERY'
  | 'QUERY_LANGUAGE_MISMATCH'
  | 'INTEGRATION_NOT_CONNECTED'
  | 'MISSING_RULE_NAME'
  | 'PERMISSION_DENIED';

export type DeployValidationWarningCode =
  | 'LOW_QUALITY_SCORE'
  | 'NO_MITRE_MAPPING'
  | 'NO_DESCRIPTION';

export interface DeployValidation {
  eligible: boolean;
  errors: Array<{ code: DeployValidationErrorCode; message: string }>;
  warnings: Array<{ code: DeployValidationWarningCode; message: string }>;
}

/** Statuses that allow deployment */
export const DEPLOYABLE_STATUSES: Status[] = [
  Status.Production,
  Status.Testing,
  Status.Review,
];

/** Map SIEM provider to accepted query languages */
export const PROVIDER_QUERY_LANGUAGES: Record<string, string[]> = {
  splunk: ['SPL'],
  sentinel: ['KQL'],
  defender_xdr: ['KQL'],
  elastic: ['Lucene', 'EQL', 'ES|QL', 'Elasticsearch DSL'],
  crowdstrike: ['CQL'],
  chronicle: ['YARA-L'],
};

// -- Vendor-specific rule configuration --

export type SplunkSecurityDomain = 'endpoint' | 'network' | 'access' | 'threat' | 'audit';

export interface SplunkRuleConfig {
  cronSchedule: string;
  earliestTime: string;
  latestTime: string;
  app: string;
  alertActions: string[];
  // Enterprise-grade Splunk fields
  securityDomain: SplunkSecurityDomain;
  enableNotable: boolean;
  enableRba: boolean;
  riskScore: number;          // 0-100
  riskMessage: string;        // template with $field$ vars
  drilldownSearch: string;    // override drilldown
}

export interface SentinelRuleConfig {
  queryFrequency: string;
  queryPeriod: string;
  triggerOperator: 'GreaterThan' | 'LessThan' | 'Equal' | 'NotEqual';
  triggerThreshold: number;
  severity: 'High' | 'Medium' | 'Low' | 'Informational';
  tactics: string[];
  techniques: string[];
}

export interface DefenderXdrRuleConfig {
  frequency: '0' | '1H' | '3H' | '12H' | '24H';
  detectionAction?: Record<string, unknown>;
}

export interface ElasticRuleConfig {
  type: 'query' | 'eql' | 'threshold' | 'esql';
  language: 'lucene' | 'eql' | 'esql';
  index: string[];
  riskScore: number;
  interval: string;
  from: string;
  maxSignals: number;
  tags: string[];
}

export interface CrowdStrikeRuleConfig {
  severity: number;            // 10=Info, 30=Low, 50=Medium, 70=High, 90=Critical
  outcome: 'detection' | 'incident';
  lookback: string;            // e.g. "1h0m", "5h0m"
  schedule: string;            // e.g. "@every 1h0m", "@every 0h5m"
  triggerMode: 'summary' | 'verbose';
  status: 'active' | 'inactive';
}

export interface ChronicleRuleConfig {
  severity: 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
}

export type VendorRuleConfig =
  | SplunkRuleConfig
  | SentinelRuleConfig
  | DefenderXdrRuleConfig
  | ElasticRuleConfig
  | CrowdStrikeRuleConfig
  | ChronicleRuleConfig;

// -- Normalized vendor rule (live SIEM rules) --

export interface VendorRule {
  vendorRuleId: string;
  name: string;
  enabled: boolean;
  provider: IntegrationProvider;
  integrationId: string;
  integrationName: string;
  query: string | null;
  queryLanguage: string;
  severity?: string;
  description?: string;
  lastModified?: string;
  schedule?: string;
  ruleKind?: string;
  // Optimus linkage
  isFromOptimus: boolean;
  optimusDetectionId?: string;
  lastDeploymentId?: string;
  // Provider-specific extras
  rawMetadata: Record<string, unknown>;
}
