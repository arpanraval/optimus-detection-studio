/**
 * Log Source Discovery Service
 *
 * Queries the detection library to discover available log sources dynamically,
 * grouped into user-friendly categories. Replaces the static LOG_SOURCE_CATEGORIES
 * with groups that map directly to detection logSource field values.
 */
import { supabase } from '../lib/supabaseClient';

// ── Log Source Group Definitions ──
// Maps user-friendly groups to detection logSource field prefixes (Sigma-style: "platform / category")

export interface LogSourceGroupDef {
  label: string;
  category: string;
  logSourcePrefixes: string[];
  /** Technology field values that also imply this group */
  technologyValues?: string[];
}

export const LOG_SOURCE_GROUPS: Record<string, LogSourceGroupDef> = {
  windows_sysmon: {
    label: 'Windows / Sysmon',
    category: 'Windows',
    logSourcePrefixes: [
      'windows / process_creation',
      'windows / file_event',
      'windows / registry_set',
      'windows / registry_event',
      'windows / registry_add',
      'windows / registry_delete',
      'windows / image_load',
      'windows / network_connection',
      'windows / dns_query',
      'windows / pipe_created',
      'windows / create_remote_thread',
      'windows / driver_load',
      'windows / file_delete',
      'windows / file_access',
      'windows / file_change',
      'windows / file_rename',
      'windows / file_executable_detected',
      'windows / process_access',
      'windows / process_tampering',
      'windows / create_stream_hash',
      'windows / raw_access_thread',
      'windows / sysmon',
      'windows / wmi_event',
      'windows / wmi',
    ],
  },
  windows_security: {
    label: 'Windows / Security',
    category: 'Windows',
    logSourcePrefixes: [
      'windows / security',
      'windows / ntlm',
      'windows / ldap',
    ],
  },
  windows_powershell: {
    label: 'Windows / PowerShell',
    category: 'Windows',
    logSourcePrefixes: [
      'windows / ps_script',
      'windows / ps_module',
      'windows / ps_classic_start',
      'windows / ps_classic_provider_start',
      'windows / powershell-classic',
    ],
  },
  windows_system: {
    label: 'Windows / System & App Logs',
    category: 'Windows',
    logSourcePrefixes: [
      'windows / system',
      'windows / application',
      'windows / bits-client',
      'windows / dns-client',
      'windows / dns-server',
      'windows / firewall-as',
      'windows / windefend',
      'windows / taskscheduler',
      'windows / applocker',
      'windows / codeintegrity-operational',
      'windows / appxdeployment-server',
      'windows / appmodel-runtime',
      'windows / appxpackaging-om',
      'windows / shell-core',
      'windows / capi2',
      'windows / lsa-server',
      'windows / openssh',
      'windows / security-mitigations',
      'windows / smbclient-security',
      'windows / smbserver-connectivity',
      'windows / terminalservices-localsessionmanager',
      'windows / diagnosis-scripted',
      'windows / driver-framework',
      'windows / microsoft-servicebus-client',
      'windows / certificateservicesclient-lifecycle-system',
      'windows / iis-configuration',
      'windows / msexchange-management',
      'Windows Event Logs',
      'Windows Security Event Log',
      'Windows IIS',
    ],
  },
  linux_process: {
    label: 'Linux / Process & File',
    category: 'Linux / macOS',
    logSourcePrefixes: [
      'linux / process_creation',
      'linux / file_event',
      'linux / network_connection',
      'linux / syslog',
      'linux / sshd',
      'linux / cron',
      'linux / vsftpd',
      'linux / guacamole',
      'linux / clamav',
    ],
  },
  linux_auditd: {
    label: 'Linux / Auditd',
    category: 'Linux / macOS',
    logSourcePrefixes: [
      'linux / auditd',
    ],
  },
  macos: {
    label: 'macOS',
    category: 'Linux / macOS',
    logSourcePrefixes: [
      'macos / process_creation',
      'macos / file_event',
    ],
  },
  aws_cloudtrail: {
    label: 'AWS CloudTrail',
    category: 'Cloud',
    logSourcePrefixes: [
      'aws / cloudtrail',
      'AWS Cloudfront',
    ],
    technologyValues: ['aws', 'AWS'],
  },
  azure_audit: {
    label: 'Azure / Entra ID',
    category: 'Cloud',
    logSourcePrefixes: [
      'azure / activitylogs',
      'azure / auditlogs',
      'azure / signinlogs',
      'azure / riskdetection',
      'azure / pim',
      'azure ad',
      'azure ad audit',
      'Azure Activity',
      'Azure AD / Entra ID Logs',
    ],
    technologyValues: ['azure', 'Azure'],
  },
  gcp_audit: {
    label: 'GCP Audit',
    category: 'Cloud',
    logSourcePrefixes: [
      'gcp / gcp.audit',
      'gcp / google_workspace.admin',
    ],
    technologyValues: ['gcp', 'GCP'],
  },
  m365_office: {
    label: 'Microsoft 365',
    category: 'Cloud',
    logSourcePrefixes: [
      'm365 / threat_management',
      'm365 / threat_detection',
      'm365 / audit',
      'm365 / exchange',
      'o365',
      'Office365',
      'Office 365 Audit Logs',
      'Workspace Activity, azure ad',
    ],
  },
  kubernetes: {
    label: 'Kubernetes',
    category: 'Cloud',
    logSourcePrefixes: [
      'kubernetes / audit / application',
      'kubernetes / audit',
    ],
  },
  okta_auth: {
    label: 'Okta',
    category: 'Identity',
    logSourcePrefixes: [
      'okta / okta',
    ],
  },
  onelogin: {
    label: 'OneLogin',
    category: 'Identity',
    logSourcePrefixes: [
      'onelogin / onelogin.events',
    ],
  },
  network_ids: {
    label: 'Network IDS / Suricata',
    category: 'Network',
    logSourcePrefixes: [
      'Suricata',
      'Palo Alto Network Threat',
    ],
  },
  network_proxy: {
    label: 'Proxy / DNS',
    category: 'Network',
    logSourcePrefixes: [
      'proxy',
      'dns',
    ],
  },
  network_zeek: {
    label: 'Zeek',
    category: 'Network',
    logSourcePrefixes: [
      'zeek / smb_files',
      'zeek / dns',
      'zeek / dce_rpc',
      'zeek / http',
      'zeek / kerberos',
      'zeek / rdp',
      'zeek / x509',
    ],
  },
  network_firewall: {
    label: 'Firewall',
    category: 'Network',
    logSourcePrefixes: [
      'fortigate / event',
      'cisco / aaa',
      'cisco / bgp',
      'cisco / ldp',
      'cisco / duo',
      'rpc_firewall / application',
      'firewall',
      'huawei / bgp',
      'juniper / bgp',
    ],
  },
  webserver: {
    label: 'Web Server',
    category: 'Application',
    logSourcePrefixes: [
      'Nginx Access',
      'nginx',
      'apache',
      'webserver',
      'CrushFTP',
    ],
  },
  application_code: {
    label: 'Application Logs',
    category: 'Application',
    logSourcePrefixes: [
      'jvm / application',
      'spring / application',
      'django / application',
      'nodejs / application',
      'python / application',
      'ruby_on_rails / application',
      'sql / application',
      'velocity / application',
      'database',
    ],
  },
  scm_audit: {
    label: 'SCM Audit (GitHub/Bitbucket)',
    category: 'Application',
    logSourcePrefixes: [
      'github / audit',
      'bitbucket / audit',
    ],
  },
  edr_telemetry: {
    label: 'EDR Telemetry',
    category: 'Endpoint',
    logSourcePrefixes: [
      'Endpoint',
      'EDR (Endpoint Detection & Response)',
      'Microsoft Defender for Endpoint',
    ],
  },
  antivirus: {
    label: 'Antivirus',
    category: 'Endpoint',
    logSourcePrefixes: [
      'antivirus',
    ],
  },
  honeypot: {
    label: 'Honeypot (OpenCanary)',
    category: 'Other',
    logSourcePrefixes: [
      'opencanary / application',
    ],
  },
  splunk_stream: {
    label: 'Splunk Stream',
    category: 'Other',
    logSourcePrefixes: [
      'Splunk Stream HTTP',
    ],
  },
  system_logs: {
    label: 'System Logs',
    category: 'Other',
    logSourcePrefixes: [
      'System Logs',
      'Authentication Logs',
    ],
  },
};

// ── Discovery Results ──
export interface LogSourceGroupResult {
  key: string;
  label: string;
  category: string;
  detectionCount: number;
  logSourcePrefixes: string[];
}

export interface DiscoveryResult {
  groups: LogSourceGroupResult[];
  totalDetections: number;
  categories: string[];
}

/**
 * Query the detections table and return log source groups with actual detection counts.
 * Uses a single query to get all logSource values with counts, then matches against group definitions.
 */
export async function discoverLogSourceGroups(): Promise<DiscoveryResult> {
  // Get all logSource values with counts via direct query
  const logSourceCounts = await fetchLogSourceCountsFallback();

  const groups: LogSourceGroupResult[] = [];
  const categorySet = new Set<string>();
  let totalMatched = 0;

  for (const [key, def] of Object.entries(LOG_SOURCE_GROUPS)) {
    let count = 0;
    for (const prefix of def.logSourcePrefixes) {
      // Exact match first
      const exact = logSourceCounts.get(prefix);
      if (exact) {
        count += exact;
        continue;
      }
      // Prefix match (case-insensitive)
      const prefixLower = prefix.toLowerCase();
      for (const [ls, cnt] of logSourceCounts) {
        if (ls.toLowerCase().startsWith(prefixLower) && ls.toLowerCase() !== prefixLower) {
          count += cnt;
        }
      }
    }

    if (count > 0) {
      categorySet.add(def.category);
    }

    groups.push({
      key,
      label: def.label,
      category: def.category,
      detectionCount: count,
      logSourcePrefixes: def.logSourcePrefixes,
    });

    totalMatched += count;
  }

  // Sort: groups with detections first, then by count desc
  groups.sort((a, b) => {
    if (a.detectionCount === 0 && b.detectionCount > 0) return 1;
    if (a.detectionCount > 0 && b.detectionCount === 0) return -1;
    return b.detectionCount - a.detectionCount;
  });

  return {
    groups,
    totalDetections: totalMatched,
    categories: Array.from(categorySet),
  };
}

/** Fallback: query detections table directly for logSource counts */
async function fetchLogSourceCountsFallback(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from('detections')
      .select('logSource')
      .not('logSource', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[logSourceDiscovery] Fallback query error:', error.message, error.details);
      done = true;
    } else if (!data || data.length === 0) {
      done = true;
    } else {
      for (const row of data) {
        const ls = (row as any).logSource as string;
        if (ls) counts.set(ls, (counts.get(ls) || 0) + 1);
      }
      if (data.length < pageSize) done = true;
      else from += pageSize;
    }
  }

  return counts;
}

/**
 * Given selected log source group keys + custom sources,
 * match detections from the library and return matched detection IDs with metadata.
 */
export interface MatchedDetection {
  id: string;
  name: string;
  severity: string;
  mitreAttackIds: string[];
  mitreTechniques: string[];
  mitreTactics: string[];
  queryLanguage: string;
  logSource: string;
  technology: string[];
  status: string;
  qualityScore: number;
  testedAndValidated: boolean;
}

export interface MatchResult {
  matchedDetections: MatchedDetection[];
  feasibleTechniqueIds: string[];
  totalLibraryDetections: number;
  totalLibraryTechniques: number;
  tacticBreakdown: { name: string; count: number }[];
  matchedByGroup: Record<string, number>;
  /** For each unselected group, how many currently-unmatched detections it would cover */
  unmatchedByGroup: Record<string, number>;
}

export async function matchDetectionsByLogSources(
  groupKeys: string[],
  customSources: string[]
): Promise<MatchResult> {
  if (groupKeys.length === 0 && customSources.length === 0) {
    return {
      matchedDetections: [],
      feasibleTechniqueIds: [],
      totalLibraryDetections: 0,
      totalLibraryTechniques: 0,
      tacticBreakdown: [],
      matchedByGroup: {},
      unmatchedByGroup: {},
    };
  }

  // Collect all logSource prefixes from selected groups
  const allPrefixes: string[] = [];
  const groupPrefixMap = new Map<string, string[]>(); // groupKey → prefixes
  for (const key of groupKeys) {
    const def = LOG_SOURCE_GROUPS[key];
    if (def) {
      allPrefixes.push(...def.logSourcePrefixes);
      groupPrefixMap.set(key, def.logSourcePrefixes);
    }
  }

  // Build OR conditions for the query
  // We'll fetch all detections and filter client-side for accuracy
  // (Supabase doesn't support OR-based prefix matching in a single query efficiently)
  const pageSize = 1000;
  const allDetections: MatchedDetection[] = [];
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from('detections')
      .select('id,name,severity,mitreAttackIds,mitreTechniques,mitreTactics,queryLanguage,logSource,technology,status,qualityScore,testedAndValidated')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[logSourceDiscovery] Supabase query error:', error.message, error.details);
      done = true;
    } else if (!data || data.length === 0) {
      done = true;
    } else {
      for (const row of data) {
        const d = row as any;
        allDetections.push({
          id: d.id,
          name: d.name,
          severity: d.severity || 'Medium',
          mitreAttackIds: d.mitreAttackIds || [],
          mitreTechniques: d.mitreTechniques || [],
          mitreTactics: d.mitreTactics || [],
          queryLanguage: d.queryLanguage || '',
          logSource: d.logSource || '',
          technology: Array.isArray(d.technology) ? d.technology : d.technology ? [d.technology] : [],
          status: d.status || 'Draft',
          qualityScore: d.qualityScore ?? 0,
          testedAndValidated: d.testedAndValidated ?? false,
        });
      }
      if (data.length < pageSize) done = true;
      else from += pageSize;
    }
  }

  const totalLibraryDetections = allDetections.length;

  // Build prefix set for matching (lowercase)
  const prefixSetLower = new Set(allPrefixes.map(p => p.toLowerCase()));
  const customLower = customSources.map(s => s.toLowerCase());

  // Match detections
  const matched: MatchedDetection[] = [];
  const matchedByGroup: Record<string, number> = {};
  for (const key of groupKeys) matchedByGroup[key] = 0;

  // Build unselected group data for missing-source suggestions
  const selectedKeySet = new Set(groupKeys);
  const unselectedGroups: { key: string; prefixesLower: string[]; technologyValues?: string[] }[] = [];
  for (const [key, def] of Object.entries(LOG_SOURCE_GROUPS)) {
    if (selectedKeySet.has(key)) continue;
    unselectedGroups.push({
      key,
      prefixesLower: def.logSourcePrefixes.map(p => p.toLowerCase()),
      technologyValues: def.technologyValues,
    });
  }
  const unmatchedByGroup: Record<string, number> = {};

  for (const det of allDetections) {
    const logSourceLower = det.logSource.toLowerCase();
    let isMatch = false;

    // Check exact prefix match
    if (prefixSetLower.has(logSourceLower)) {
      isMatch = true;
    }

    // Check startsWith match against all prefixes
    if (!isMatch) {
      for (const prefix of prefixSetLower) {
        if (logSourceLower.startsWith(prefix)) {
          isMatch = true;
          break;
        }
      }
    }

    // Check technology values from selected groups
    if (!isMatch && det.technology.length > 0) {
      for (const key of groupKeys) {
        const def = LOG_SOURCE_GROUPS[key];
        if (def?.technologyValues) {
          for (const tv of def.technologyValues) {
            if (det.technology.some(t => t.toLowerCase() === tv.toLowerCase())) {
              isMatch = true;
              break;
            }
          }
          if (isMatch) break;
        }
      }
    }

    // Check custom sources (keyword match in logSource only)
    if (!isMatch && customLower.length > 0) {
      for (const custom of customLower) {
        if (logSourceLower.includes(custom)) {
          isMatch = true;
          break;
        }
      }
    }

    if (isMatch) {
      matched.push(det);

      // Count per group
      for (const [key, prefixes] of groupPrefixMap) {
        const prefixesLower = prefixes.map(p => p.toLowerCase());
        if (prefixesLower.some(p => logSourceLower === p || logSourceLower.startsWith(p))) {
          matchedByGroup[key] = (matchedByGroup[key] || 0) + 1;
        }
        // Also check technology
        const def = LOG_SOURCE_GROUPS[key];
        if (def?.technologyValues) {
          for (const tv of def.technologyValues) {
            if (det.technology.some(t => t.toLowerCase() === tv.toLowerCase())) {
              matchedByGroup[key] = (matchedByGroup[key] || 0) + 1;
              break;
            }
          }
        }
      }
    } else {
      // Track which unselected groups would have matched this detection
      for (const ug of unselectedGroups) {
        const matchesByPrefix = ug.prefixesLower.some(
          p => logSourceLower === p || logSourceLower.startsWith(p)
        );
        const matchesByTech = ug.technologyValues != null && det.technology.some(
          t => ug.technologyValues!.some(tv => t.toLowerCase() === tv.toLowerCase())
        );
        if (matchesByPrefix || matchesByTech) {
          unmatchedByGroup[ug.key] = (unmatchedByGroup[ug.key] || 0) + 1;
        }
      }
    }
  }

  // Compute feasible technique IDs
  const techniqueSet = new Set<string>();
  for (const det of matched) {
    for (const id of det.mitreAttackIds) {
      if (id) techniqueSet.add(id);
    }
  }

  // Compute total library techniques
  const allTechniqueSet = new Set<string>();
  for (const det of allDetections) {
    for (const id of det.mitreAttackIds) {
      if (id) allTechniqueSet.add(id);
    }
  }

  // Compute tactic breakdown from matched detections
  const tacticCounts = new Map<string, number>();
  for (const det of matched) {
    if (det.mitreTactics) {
      for (const tactic of det.mitreTactics) {
        if (tactic) tacticCounts.set(tactic, (tacticCounts.get(tactic) || 0) + 1);
      }
    }
  }

  const tacticBreakdown = Array.from(tacticCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    matchedDetections: matched,
    feasibleTechniqueIds: Array.from(techniqueSet),
    totalLibraryDetections,
    totalLibraryTechniques: allTechniqueSet.size,
    tacticBreakdown,
    matchedByGroup,
    unmatchedByGroup,
  };
}

// ── Missing Log Source Suggestions ──

export interface MissingLogSourceSuggestion {
  groupKey: string;
  groupLabel: string;
  additionalDetections: number;
}

/**
 * Given the unmatchedByGroup counts from a MatchResult, return the top N
 * unselected log source groups that would unlock the most additional detections.
 */
export function computeMissingLogSourceSuggestions(
  unmatchedByGroup: Record<string, number>,
  topN: number = 3
): MissingLogSourceSuggestion[] {
  return Object.entries(unmatchedByGroup)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({
      groupKey: key,
      groupLabel: LOG_SOURCE_GROUPS[key]?.label ?? key,
      additionalDetections: count,
    }))
    .sort((a, b) => b.additionalDetections - a.additionalDetections)
    .slice(0, topN);
}
