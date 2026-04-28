// Environment Profile types — v2

// ── Legacy: kept for backward compat (IndustryStep → SectorStep migration) ──
export const INDUSTRIES = [
  'Financial Services',
  'Healthcare',
  'Government',
  'Technology',
  'Retail / E-commerce',
  'Energy / Utilities',
  'Manufacturing',
  'Telecommunications',
  'Education',
  'Legal / Professional Services',
] as const;

export type Industry = typeof INDUSTRIES[number];

// ── Sector Groups: maps display categories to exact DB target_sectors values ──
export interface SectorGroup {
  label: string;
  icon: string;
  sectors: string[];
}

export const SECTOR_GROUPS: Record<string, SectorGroup> = {
  financial_services: {
    label: 'Financial Services',
    icon: 'shield',
    sectors: ['Finance', 'Financial', 'Financial services', 'Cryptocurrency'],
  },
  government_defense: {
    label: 'Government & Defense',
    icon: 'flag',
    sectors: ['Government', 'Government agencies and services', 'Government Institutions', 'Defense', 'Defense industrial base', 'Military', 'Intergovernmental'],
  },
  healthcare_pharma: {
    label: 'Healthcare & Pharma',
    icon: 'activity',
    sectors: ['Healthcare', 'Health', 'Medical', 'Pharmaceuticals', 'Covid-19 research organizations'],
  },
  technology: {
    label: 'Technology',
    icon: 'monitor',
    sectors: ['Information technology', 'High-Tech'],
  },
  energy_utilities: {
    label: 'Energy & Utilities',
    icon: 'zap',
    sectors: ['Energy', 'Petroleum'],
  },
  manufacturing: {
    label: 'Manufacturing',
    icon: 'tool',
    sectors: ['Manufacturing', 'Critical manufacturing', 'Automotive'],
  },
  telecommunications: {
    label: 'Telecommunications',
    icon: 'globe',
    sectors: ['Telecommunications', 'Telecomms', 'Telecoms'],
  },
  education_research: {
    label: 'Education & Research',
    icon: 'brain',
    sectors: ['Education', 'Universities'],
  },
  retail_hospitality: {
    label: 'Retail & Hospitality',
    icon: 'package',
    sectors: ['Retail', 'Business', 'Hospitality', 'Travel', 'Gambling companies'],
  },
  media_entertainment: {
    label: 'Media & Entertainment',
    icon: 'film',
    sectors: ['Media', 'Media and Entertainment'],
  },
  legal_professional: {
    label: 'Legal & Professional Services',
    icon: 'layers',
    sectors: ['Legal', 'Services', 'Private sector', 'Private Sector'],
  },
  transportation: {
    label: 'Transportation',
    icon: 'truck',
    sectors: ['Transportation', 'Transportation systems', 'Rail'],
  },
  civil_society_ngos: {
    label: 'Civil Society & NGOs',
    icon: 'heart',
    sectors: ['Civil society', 'Civil Society', 'NGOs', 'Individuals', 'Religious organization', 'Pro-democracy and human rights political organizations'],
  },
  food_agriculture: {
    label: 'Food & Agriculture',
    icon: 'leaf',
    sectors: ['Food and agriculture'],
  },
};

/** Get all individual sector values from selected group keys */
export function getSectorsFromGroupKeys(groupKeys: string[]): string[] {
  const sectors: string[] = [];
  for (const key of groupKeys) {
    const group = SECTOR_GROUPS[key];
    if (group) sectors.push(...group.sectors);
  }
  return sectors;
}

/** Reverse: given raw sector values, find which group keys they belong to */
export function getGroupKeysFromSectors(sectors: string[]): string[] {
  const sectorSet = new Set(sectors);
  const keys: string[] = [];
  for (const [key, group] of Object.entries(SECTOR_GROUPS)) {
    if (group.sectors.some(s => sectorSet.has(s))) {
      keys.push(key);
    }
  }
  return keys;
}

/** Map legacy industry to sector group keys */
export function industryToSectorGroupKeys(industry: string): string[] {
  const map: Record<string, string[]> = {
    'Financial Services': ['financial_services'],
    'Healthcare': ['healthcare_pharma'],
    'Government': ['government_defense'],
    'Technology': ['technology'],
    'Retail / E-commerce': ['retail_hospitality'],
    'Energy / Utilities': ['energy_utilities'],
    'Manufacturing': ['manufacturing'],
    'Telecommunications': ['telecommunications'],
    'Education': ['education_research'],
    'Legal / Professional Services': ['legal_professional'],
  };
  return map[industry] || [];
}

/** Map legacy industry to raw sector values for migration */
export function industryToSectors(industry: string): string[] {
  const groupKeys = industryToSectorGroupKeys(industry);
  return getSectorsFromGroupKeys(groupKeys);
}

// ── Threat Origin Countries (from DB intrusion-set data) ──
export interface OriginCountry {
  code: string;
  name: string;
  groupCount: number;
}

export const ORIGIN_COUNTRIES: OriginCountry[] = [
  { code: 'CN', name: 'China', groupCount: 46 },
  { code: 'RU', name: 'Russia', groupCount: 20 },
  { code: 'IR', name: 'Iran', groupCount: 15 },
  { code: 'KP', name: 'North Korea', groupCount: 7 },
  { code: 'PS', name: 'Palestine', groupCount: 3 },
  { code: 'LB', name: 'Lebanon', groupCount: 3 },
  { code: 'IN', name: 'India', groupCount: 3 },
  { code: 'TR', name: 'Turkey', groupCount: 2 },
  { code: 'PK', name: 'Pakistan', groupCount: 2 },
  { code: 'US', name: 'United States', groupCount: 2 },
  { code: 'NG', name: 'Nigeria', groupCount: 1 },
  { code: 'VN', name: 'Vietnam', groupCount: 1 },
  { code: 'KR', name: 'South Korea', groupCount: 1 },
  { code: 'AE', name: 'United Arab Emirates', groupCount: 1 },
  { code: 'RO', name: 'Romania', groupCount: 1 },
  { code: 'BY', name: 'Belarus', groupCount: 1 },
  { code: 'BR', name: 'Brazil', groupCount: 1 },
];

// ── Target Countries (for user's country selection) ──
// Top countries by threat group targeting frequency
export const TARGET_COUNTRIES: string[] = [
  'United States', 'Germany', 'United Kingdom', 'China', 'India',
  'Japan', 'South Korea', 'France', 'Israel', 'Canada',
  'Hong Kong', 'Russian Federation', 'Saudi Arabia', 'Taiwan', 'Thailand',
  'Australia', 'Turkey', 'Singapore', 'Switzerland', 'Belgium',
  'Iran', 'Vietnam', 'Malaysia', 'Pakistan', 'Brazil',
  'Italy', 'Ukraine', 'Afghanistan', 'Indonesia', 'Philippines',
  'Poland', 'United Arab Emirates', 'Cambodia', 'Georgia', 'Kazakhstan',
  'Myanmar', 'Netherlands', 'South Africa', 'Spain', 'Bangladesh',
  'Iraq', 'Mexico', 'Belarus', 'Ecuador', 'Guatemala',
  'Jordan', 'Kuwait', 'Nepal', 'Norway', 'Qatar',
  'Romania', 'Sweden', 'Uzbekistan', 'Armenia', 'Azerbaijan',
  'Colombia', 'Czech Republic', 'Hungary', 'Ireland', 'Kenya',
  'Kyrgyzstan', 'Laos', 'Lebanon', 'Libya', 'Mongolia',
  'New Zealand', 'Nigeria', 'Peru', 'Sri Lanka', 'Syria',
  'Tajikistan', 'Venezuela',
];

// ── Existing constants (unchanged) ──
export const EDR_TOOLS = [
  'CrowdStrike Falcon',
  'SentinelOne',
  'Microsoft Defender for Endpoint',
  'Carbon Black',
  'Palo Alto Cortex XDR',
  'Elastic Agent',
  'Trend Micro Vision One',
  'Sophos Intercept X',
] as const;

export const CROWN_JEWELS = [
  'Domain Controllers',
  'Financial Systems',
  'Customer Databases',
  'Source Code Repositories',
  'Executive Accounts',
  'Medical Records',
  'Payment Systems',
  'SCADA / ICS',
  'Email Systems',
  'HR / PII Systems',
] as const;

// ── Legacy LOG_SOURCE_CATEGORIES kept for backward compat ──
// (LogSourcesStep now uses dynamic discovery, but other code may reference this)
export const LOG_SOURCE_CATEGORIES: Record<string, string[]> = {
  'Windows': [
    'Windows Security Event Log',
    'Windows PowerShell Logs',
    'Windows Sysmon',
    'Windows WMI',
    'Windows Defender',
  ],
  'Linux / macOS': [
    'Linux Syslog',
    'Linux Auditd',
    'macOS Unified Logs',
  ],
  'Endpoint': [
    'EDR Telemetry',
  ],
  'Network': [
    'Firewall Logs',
    'DNS Logs',
    'Proxy Logs',
    'IDS/IPS Alerts',
    'WAF Logs',
    'Network Flow Data',
    'DHCP Logs',
  ],
  'Identity': [
    'Active Directory Audit',
    'Azure AD / Entra ID Logs',
    'Authentication Logs',
    'VPN Logs',
  ],
  'Cloud': [
    'AWS CloudTrail',
    'AWS GuardDuty',
    'GCP Audit Logs',
    'Office 365 Audit Logs',
    'Kubernetes Audit Logs',
    'Container Logs',
  ],
  'Email & Data': [
    'Email Gateway Logs',
    'Database Audit Logs',
    'Certificate Logs',
  ],
};

export interface CloudPlatformConfig {
  aws?: { enabled: boolean; services: string[] };
  azure?: { enabled: boolean; services: string[] };
  gcp?: { enabled: boolean; services: string[] };
}

export const CLOUD_SERVICES: Record<string, string[]> = {
  aws: ['EC2', 'S3', 'Lambda', 'IAM', 'RDS', 'EKS', 'CloudFront', 'Route53'],
  azure: ['Virtual Machines', 'Blob Storage', 'Azure AD', 'Azure Functions', 'AKS', 'SQL Database'],
  gcp: ['Compute Engine', 'Cloud Storage', 'IAM', 'Cloud Functions', 'GKE', 'BigQuery'],
};

// ── Interface (v2) ──
export interface EnvironmentProfile {
  id: string;
  user_id: string;
  industry: string | null;
  sectors: string[];
  user_country: string | null;
  threat_origin_countries: string[];
  siem_platforms: string[];
  log_sources: string[];
  custom_log_sources: string[];
  edr_tools: string[];
  cloud_platforms: CloudPlatformConfig;
  crown_jewels: string[];
  profile_completeness: number;
  created_at: string;
  updated_at: string;
}

// ── Profile Completeness (v2: 6 sections) ──
export function computeProfileCompleteness(profile: Partial<EnvironmentProfile>): number {
  let score = 0;
  const weight = 100 / 6; // ~16.67 per section
  if ((profile.sectors && profile.sectors.length > 0) || profile.industry) score += weight;
  if (profile.user_country || (profile.threat_origin_countries && profile.threat_origin_countries.length > 0)) score += weight;
  if (profile.siem_platforms && profile.siem_platforms.length > 0) score += weight;
  if (profile.log_sources && profile.log_sources.length > 0) score += weight;
  if (profile.edr_tools && profile.edr_tools.length > 0) score += weight;
  if (profile.crown_jewels && profile.crown_jewels.length > 0) score += weight;
  return Math.round(score);
}
