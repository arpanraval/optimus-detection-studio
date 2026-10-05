// Pure shared policy: imported by both the browser and Edge Functions.
export const DEPLOYABLE_STATUS_NAMES = ['Production', 'Testing', 'Review'];
export const SIEM_QUERY_LANGUAGES: Record<string, string[]> = {
  splunk: ['SPL'],
  sentinel: ['KQL'],
  defender_xdr: ['KQL'],
  elastic: ['Lucene', 'EQL', 'ESQL', 'Elasticsearch DSL'],
  crowdstrike: ['CQL'],
  chronicle: ['YARA-L'],
};

export interface PackDetection {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  severity?: string;
  status: string;
  library_type?: string;
  version?: number;
  queries?: Array<{ id?: string; language?: string; query?: string }>;
  queryLanguage?: string;
  detectionQuery?: string;
  mitreTactics?: string[];
  mitreAttackIds?: string[];
}

export function selectPackQuery(detection: PackDetection, provider: string) {
  const languages = SIEM_QUERY_LANGUAGES[provider] ?? [];
  const normalize = (language: string) => language.trim().toUpperCase().replace('ES|QL', 'ESQL');
  const candidates = [
    ...(detection.queries ?? []),
    { language: detection.queryLanguage, query: detection.detectionQuery },
  ];
  const query = candidates.find(
    (q) => q.query?.trim() && languages.some((l) => normalize(l) === normalize(q.language ?? '')),
  );
  return query
    ? { query: query.query!, language: languages.find((l) => normalize(l) === normalize(query.language!))! }
    : null;
}

export function packSkipReason(detection: PackDetection, provider: string, tracked = false): string | null {
  if (detection.library_type !== 'production') return 'Promote to the Production library first';
  if (!DEPLOYABLE_STATUS_NAMES.includes(detection.status))
    return `Status ${detection.status}: requires Production, Testing or Review`;
  if (!detection.name?.trim()) return 'Detection has no name';
  if (!SIEM_QUERY_LANGUAGES[provider]) return 'Provider does not support deployment';
  if (!selectPackQuery(detection, provider)) return `No non-empty ${SIEM_QUERY_LANGUAGES[provider].join('/')} query`;
  if (provider === 'elastic' && selectPackQuery(detection, provider)?.language === 'Elasticsearch DSL') {
    return 'Elasticsearch DSL requires an individual rule configuration; use Deploy on this rule';
  }
  if (tracked) return 'Already tracked: use Deploy on this rule to review its update';
  return null;
}

export function packRuleConfig(detection: PackDetection, provider: string, shared: Record<string, unknown>) {
  const severity = (detection.severity || 'medium').toLowerCase();
  const rank = ({ critical: 5, high: 4, medium: 3, low: 2, informational: 1 } as Record<string, number>)[severity] ?? 3;
  const config: Record<string, unknown> = {
    ...shared,
    name: detection.name,
    description: detection.description || detection.name,
    tactics: detection.mitreTactics ?? [],
    techniques: detection.mitreAttackIds ?? [],
  };
  // Provider defaults are schedule/settings, not an implicit override of every detection's severity.
  config.severity =
    provider === 'crowdstrike'
      ? rank * 20
      : provider === 'sentinel'
        ? rank >= 4
          ? 'High'
          : rank === 3
            ? 'Medium'
            : rank === 2
              ? 'Low'
              : 'Informational'
        : rank >= 4
          ? 'high'
          : rank === 3
            ? 'medium'
            : 'low';
  if (shared.severity !== undefined && shared.severity !== '') config.severity = shared.severity;
  if (provider === 'defender_xdr') config.category = defenderCategoryFromTactics(detection.mitreTactics ?? []);
  if (provider === 'splunk') config.alertSeverity = String(rank);
  if (provider === 'elastic') {
    const language = selectPackQuery(detection, provider)?.language;
    config.type = language === 'EQL' ? 'eql' : language === 'ESQL' ? 'esql' : 'query';
    config.language = language === 'EQL' ? 'eql' : language === 'ESQL' ? 'esql' : 'lucene';
  }
  // Never accept write actions or target IDs as pack-wide settings.
  delete config.action;
  delete config.vendorRuleId;
  return config;
}

// Defender's single category uses the first supported tactic in detection order.
// Accept both ATT&CK IDs and display names; never impose a pack-wide category.
export function defenderCategoryFromTactics(tactics: string[] = []): string {
  const categories: Record<string, string> = {
    TA0001: 'InitialAccess', TA0002: 'Execution', TA0003: 'Persistence',
    TA0004: 'PrivilegeEscalation', TA0005: 'DefenseEvasion', TA0006: 'CredentialAccess',
    TA0007: 'Discovery', TA0008: 'LateralMovement', TA0009: 'Collection',
    TA0011: 'CommandAndControl', TA0010: 'Exfiltration', TA0040: 'Impact',
  };
  for (const tactic of tactics) {
    const normalized = tactic.trim().replace(/[\s_-]+/g, '').toLowerCase();
    const category = categories[tactic.trim().toUpperCase()] ??
      Object.values(categories).find((value) => value.toLowerCase() === normalized);
    if (category) return category;
  }
  return 'SuspiciousActivity';
}
