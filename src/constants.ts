
import { Status, Severity, DetectionType, Maturity, Confidence } from './types';

// Query language options
export const QUERY_LANGUAGES = [
  'SPL',
  'KQL',
  'Kuery',
  'Sigma',
  'EQL',
  'ESQL',
  'CQL',
  'SQL',
  'YARA',
  'YARA-L',
  'Lucene',
  'Carbon Black',
  'Datadog',
  'Elasticsearch DSL'
] as const;

// Log sources
export const LOG_SOURCES = [
  "Windows Security Event Log",
  "Windows PowerShell Logs",
  "Windows Sysmon",
  "Windows WMI",
  "Windows Defender",
  "Linux Syslog",
  "Linux Auditd",
  "macOS Unified Logs",
  "EDR Telemetry",
  "Firewall Logs",
  "DNS Logs",
  "Proxy Logs",
  "Active Directory Audit",
  "Azure AD / Entra ID Logs",
  "AWS CloudTrail",
  "AWS GuardDuty",
  "GCP Audit Logs",
  "Office 365 Audit Logs",
  "Email Gateway Logs",
  "VPN Logs",
  "IDS/IPS Alerts",
  "WAF Logs",
  "Database Audit Logs",
  "Container Logs",
  "Kubernetes Audit Logs",
  "Network Flow Data",
  "DHCP Logs",
  "Authentication Logs",
  "Certificate Logs"
] as const;

// MITRE Platforms (aligned with ATT&CK)
export const MITRE_PLATFORMS = [
  "Windows",
  "Linux",
  "macOS",
  "AWS",
  "Azure",
  "Azure AD",
  "GCP",
  "SaaS",
  "Office 365",
  "Google Workspace",
  "IaaS",
  "Containers",
  "Network",
  "PRE"
] as const;

// Technologies
export const TECHNOLOGIES = [
  "Windows",
  "Linux",
  "macOS",
  "AWS",
  "Azure",
  "GCP",
  "Active Directory",
  "Azure AD / Entra ID",
  "VMware ESXi",
  "Docker",
  "Kubernetes",
  "Office 365",
  "Google Workspace",
  "Microsoft Defender",
  "CrowdStrike Falcon",
  "SentinelOne",
  "Carbon Black",
  "Palo Alto Networks",
  "Cisco",
  "Okta",
  "Duo",
  "Salesforce"
] as const;

// All enum values as arrays for dropdowns
export const STATUSES = Object.values(Status);
export const MATURITIES = Object.values(Maturity);
export const DETECTION_TYPES = Object.values(DetectionType);
export const SEVERITIES = Object.values(Severity);
export const CONFIDENCES = Object.values(Confidence);

// Color mappings
export const SEVERITY_COLORS: Record<Severity, string> = {
  [Severity.Critical]: 'bg-red-500/20 text-red-400 border-red-500/30',
  [Severity.High]: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  [Severity.Medium]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  [Severity.Low]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [Severity.Informational]: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
};

export const CONFIDENCE_COLORS: Record<Confidence, string> = {
  [Confidence.High]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  [Confidence.Medium]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  [Confidence.Low]: 'bg-red-500/20 text-red-400 border-red-500/30'
};

export const STATUS_COLORS: Record<Status, string> = {
  [Status.Backlog]: 'bg-gray-500/20 text-gray-400',
  [Status.Draft]: 'bg-gray-500/20 text-gray-400',
  [Status.Development]: 'bg-blue-500/20 text-blue-400',
  [Status.Review]: 'bg-purple-500/20 text-purple-400',
  [Status.Testing]: 'bg-yellow-500/20 text-yellow-400',
  [Status.Production]: 'bg-emerald-500/20 text-emerald-400',
  [Status.Deprecated]: 'bg-red-500/20 text-red-400',
  [Status.Archived]: 'bg-gray-500/20 text-gray-500'
};
