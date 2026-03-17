/**
 * @deprecated Use directFeasibilityService.ts instead.
 * This service uses a 4-hop MITRE analytics chain (log sources → analytics → strategies → techniques).
 * The new directFeasibilityService matches detections directly by logSource field, which is faster
 * and more accurate.
 */

import { supabase } from '../lib/supabaseClient';

/**
 * ATT&CK v18.1 Feasibility Service
 * @deprecated — replaced by directFeasibilityService.ts
 *
 * Maps user-facing log sources to MITRE analytics log source patterns,
 * then traces: Analytics → Detection Strategies → Techniques
 *
 * Chain: User Log Sources → Analytics (x_mitre_log_source_references.name)
 *        → Detection Strategies (x_mitre_analytic_refs)
 *        → Techniques (detects relationships)
 */

/**
 * Maps user-facing log source names to analytics log source name patterns.
 * These patterns are matched as prefixes against x_mitre_log_source_references[].name
 * in x-mitre-analytic objects.
 */
const LOG_SOURCE_TO_ANALYTIC_PATTERNS: Record<string, string[]> = {
  'Windows Security Event Log': ['WinEventLog:Security'],
  'Windows PowerShell Logs': ['WinEventLog:PowerShell'],
  'Windows Sysmon': ['WinEventLog:Sysmon'],
  'Windows WMI': ['WinEventLog:WMI'],
  'Windows Defender': ['WinEventLog:Windows Defender', 'WinEventLog:Microsoft-Windows-Windows Defender'],
  'Linux Syslog': ['linux:syslog', 'linuxsyslog', 'linus:syslog', 'journald:'],
  'Linux Auditd': ['auditd:'],
  'macOS Unified Logs': ['macos:unifiedlog', 'macos:syslog', 'macos:'],
  'EDR Telemetry': ['EDR:'],
  'Firewall Logs': ['NSM:firewall', 'NSM:Firewall', 'networkdevice:Firewall', 'Firewall Audit Logs', 'Windows Firewall Log', 'WinEventLog:Microsoft-Windows-Windows Firewall', 'PF:Logs', 'iptables:', 'Netfilter'],
  'DNS Logs': ['dns:query'],
  'Proxy Logs': ['NSM:Content', 'NSM:Connections'],
  'Active Directory Audit': ['WinEventLog:ADFS', 'WinEventLog:Kerberos', 'Defender for Identity', 'etw:Microsoft-Windows-Directory-Services'],
  'Azure AD / Entra ID Logs': ['azure:ad', 'azure:signinlogs', 'azure:audit', 'Microsoft Entra ID', 'Microsoft Graph API', 'm365:signinlogs', 'm365:dirsync'],
  'AWS CloudTrail': ['AWS:CloudTrail', 'CloudTrail:'],
  'AWS GuardDuty': ['AWS:CloudWatch', 'AWS:CloudMetrics'],
  'GCP Audit Logs': ['gcp:audit', 'gcp:iam', 'gcp:config', 'gcp:workspaceaudit', 'GCPAuditLogs:', 'Google Admin Audit'],
  'Office 365 Audit Logs': ['m365:audit', 'm365:unified', 'm365:office', 'm365:oauth', 'm365:purview'],
  'Email Gateway Logs': ['m365:exchange', 'm365:messagetrace', 'm365:mailboxaudit', 'ApplicationLog:MailServer', 'Application:Mail', 'saas:email'],
  'VPN Logs': ['network:auth', 'VPCFlowLogs:'],
  'IDS/IPS Alerts': ['networkdevice:IDS', 'IDS:', 'WIDS:'],
  'WAF Logs': ['ALB:HTTPLogs', 'ApplicationLog:IIS', 'ApplicationLog:WebServer', 'WinEventLog:Microsoft-IIS', 'apache:access_log'],
  'Database Audit Logs': ['ApplicationLogs:SQL'],
  'Container Logs': ['containerd:', 'container:', 'docker:'],
  'Kubernetes Audit Logs': ['kubernetes:'],
  'Network Flow Data': ['NetFlow:', 'NSM:Flow', 'NSM:FLow', 'cni:netflow', 'networkdevice:Flow', 'NSX:FlowLogs', 'sar:network'],
  'DHCP Logs': ['wineventlog:dhcp'],
  'Authentication Logs': ['linux:auth', 'macos:auth', 'Okta:', 'saas:auth', 'saas-app:auth', 'saas:okta'],
  'Certificate Logs': ['Certificate'],
};

// Keep backward-compatible export name
export const LOG_SOURCE_TO_MITRE_DATA_SOURCES = LOG_SOURCE_TO_ANALYTIC_PATTERNS;

/** Helper: paginate through a Supabase table to get all rows */
async function fetchAllRows<T>(
  table: string,
  select: string,
  filters?: { column: string; value: any }[]
): Promise<T[]> {
  const pageSize = 1000;
  const allData: T[] = [];
  let from = 0;
  let done = false;

  while (!done) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (filters) {
      for (const f of filters) {
        query = query.eq(f.column, f.value);
      }
    }
    const { data, error } = await query;
    if (error) {
      console.warn(`[Feasibility] fetchAllRows(${table}) error:`, error.message);
      break;
    }
    if (!data || data.length === 0) {
      done = true;
    } else {
      allData.push(...(data as T[]));
      if (data.length < pageSize) done = true;
      else from += pageSize;
    }
  }
  return allData;
}

/**
 * Given user's selected log sources, compute which MITRE technique IDs are feasible.
 *
 * ATT&CK v18.1 chain:
 * 1. Map user log sources → analytics log source patterns
 * 2. Find analytics whose x_mitre_log_source_references match
 * 3. Find detection strategies referencing those analytics
 * 4. Find techniques detected by those strategies
 */
export async function computeFeasibleTechniques(
  logSources: string[],
  _customLogSources?: string[]
): Promise<{ feasibleTechniqueIds: string[]; totalTechniques: number; coveredDataSources: string[] }> {
  // Step 1: Build the set of analytics log source patterns to match
  const patterns: string[] = [];
  for (const source of logSources) {
    const p = LOG_SOURCE_TO_ANALYTIC_PATTERNS[source];
    if (p) patterns.push(...p);
  }

  if (patterns.length === 0) {
    console.warn('[Feasibility] No log sources mapped to analytic patterns. Selected:', logSources);
    return { feasibleTechniqueIds: [], totalTechniques: 0, coveredDataSources: [] };
  }

  const patternsLower = patterns.map(p => p.toLowerCase());
  console.log(`[Feasibility] Matching ${patternsLower.length} analytic log source patterns`);

  // Step 2: Get total technique count
  const { count: totalTechniques } = await supabase
    .from('mitre_objects')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'attack-pattern');

  // Step 3: Fetch all analytics with their log source references
  const allAnalytics = await fetchAllRows<{ stix_id: string; data: any }>(
    'mitre_objects',
    'stix_id, data',
    [{ column: 'type', value: 'x-mitre-analytic' }]
  );

  console.log(`[Feasibility] Fetched ${allAnalytics.length} analytics`);

  // Step 4: Find analytics that match user's log sources
  const matchedAnalyticIds = new Set<string>();
  for (const analytic of allAnalytics) {
    const data = analytic.data as Record<string, any> | null;
    const logRefs = data?.x_mitre_log_source_references as Array<{ name: string }> | undefined;
    if (!logRefs || logRefs.length === 0) continue;

    for (const ref of logRefs) {
      const refName = ref.name?.toLowerCase();
      if (!refName) continue;
      const matched = patternsLower.some(p => refName.startsWith(p) || refName === p);
      if (matched) {
        matchedAnalyticIds.add(analytic.stix_id);
        break;
      }
    }
  }

  console.log(`[Feasibility] Matched ${matchedAnalyticIds.size} analytics out of ${allAnalytics.length}`);

  if (matchedAnalyticIds.size === 0) {
    return { feasibleTechniqueIds: [], totalTechniques: totalTechniques || 0, coveredDataSources: patterns };
  }

  // Step 5: Fetch detection strategies and find ones referencing matched analytics
  const allStrategies = await fetchAllRows<{ stix_id: string; data: any }>(
    'mitre_objects',
    'stix_id, data',
    [{ column: 'type', value: 'x-mitre-detection-strategy' }]
  );

  const matchedStrategyIds = new Set<string>();
  for (const strategy of allStrategies) {
    const data = strategy.data as Record<string, any> | null;
    const analyticRefs = data?.x_mitre_analytic_refs as string[] | undefined;
    if (!analyticRefs) continue;

    for (const ref of analyticRefs) {
      if (matchedAnalyticIds.has(ref)) {
        matchedStrategyIds.add(strategy.stix_id);
        break;
      }
    }
  }

  console.log(`[Feasibility] Matched ${matchedStrategyIds.size} detection strategies out of ${allStrategies.length}`);

  if (matchedStrategyIds.size === 0) {
    return { feasibleTechniqueIds: [], totalTechniques: totalTechniques || 0, coveredDataSources: patterns };
  }

  // Step 6: Get detects relationships and find techniques
  const detectsRels = await fetchAllRows<{ source_ref: string; target_ref: string }>(
    'mitre_relationships',
    'source_ref, target_ref',
    [{ column: 'relationship_type', value: 'detects' }]
  );

  const matchedTechStixIds = new Set<string>();
  for (const rel of detectsRels) {
    if (matchedStrategyIds.has(rel.source_ref)) {
      matchedTechStixIds.add(rel.target_ref);
    }
  }

  console.log(`[Feasibility] Found ${matchedTechStixIds.size} detectable techniques from ${detectsRels.length} detects relationships`);

  // Step 7: Map technique stix_ids to mitre_ids
  const allTechs = await fetchAllRows<{ stix_id: string; mitre_id: string | null }>(
    'mitre_objects',
    'stix_id, mitre_id',
    [{ column: 'type', value: 'attack-pattern' }]
  );

  const stixToMitre = new Map<string, string>();
  for (const t of allTechs) {
    if (t.mitre_id) stixToMitre.set(t.stix_id, t.mitre_id);
  }

  const feasibleTechniqueIds = Array.from(matchedTechStixIds)
    .map(sid => stixToMitre.get(sid))
    .filter(Boolean) as string[];

  console.log(`[Feasibility] Final: ${feasibleTechniqueIds.length} feasible techniques out of ${totalTechniques || allTechs.length} total`);

  return {
    feasibleTechniqueIds,
    totalTechniques: totalTechniques || allTechs.length,
    coveredDataSources: patterns,
  };
}
