/** Pure contracts shared by the worker, diff UI and adapter tests. No credentials or runtime dependencies. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RuleContent = {
  name: string;
  description: string;
  query: string;
  language: string;
  severity: string;
  enabled: boolean | null;
  config: Record<string, Json>;
};
export type NativeDrift = 'in_sync' | 'local_changed' | 'remote_changed' | 'conflict' | 'missing' | 'unknown';
export const ADAPTER_VERSION = 'crowdstrike-correlation-v1';

export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function contentHash(value: Json): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

const secretKey = /^(authorization|access_token|refresh_token|client_secret|password|api_key|credentials)$/i;
export function sanitizeSnapshot(value: Json): Json {
  if (Array.isArray(value)) return value.map(sanitizeSnapshot);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !secretKey.test(key))
      .map(([key, item]) => [key, sanitizeSnapshot(item)]));
  }
  return value;
}

function object(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function crowdStrikeScope(config: Record<string, unknown>): string {
  const base = new URL(String(config.baseUrl));
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
    throw new Error('CrowdStrike requires an HTTPS API origin');
  }
  const cid = String(config.customerId || '').replace(/-[0-9a-f]{2}$/i, '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(cid)) throw new Error('Set the CrowdStrike customer ID before syncing rules');
  return `${base.origin.toLowerCase()}/correlation-rules/${cid}`;
}

export function normalizeCrowdStrike(raw: Record<string, Json>): RuleContent {
  const search = object(raw.search);
  const operation = object(raw.operation);
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || !raw.name) {
    throw new Error('Unsupported rule: missing stable identity or name');
  }
  if (typeof search.filter !== 'string' || !search.filter.trim()) throw new Error('Unsupported rule: no CQL query');
  const severity = ({ 10: 'Informational', 30: 'Low', 50: 'Medium', 70: 'High', 90: 'Critical' } as Record<string, string>)[String(raw.severity)];
  if (!severity) throw new Error('Unsupported rule: unknown severity');
  // Preserve full search/operation configuration for comparison. Writes use a separate whitelist.
  const { filter: _filter, ...searchConfig } = search;
  return {
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : '',
    query: search.filter,
    language: 'CQL',
    severity,
    enabled: raw.status === 'active' ? true : raw.status === 'inactive' ? false : null,
    config: { search: searchConfig, operation, tactic: raw.tactic ?? null, technique: raw.technique ?? null,
      fields: Object.fromEntries(['notifications', 'guardrail_notifications', 'mitre_attack', 'anomaly']
        .filter(key => raw[key] !== undefined).map(key => [key, raw[key]])) },
  };
}

export function classifyDrift(baseline: RuleContent, local: RuleContent, remote: RuleContent,
  availability = 'present'): NativeDrift {
  if (availability === 'missing') return 'missing';
  if (availability !== 'present') return 'unknown';
  const b = canonicalJson(baseline), l = canonicalJson(local), r = canonicalJson(remote);
  if (l === r) return 'in_sync';
  if (l === b) return 'remote_changed';
  if (r === b) return 'local_changed';
  return 'conflict';
}

export function localContent(detection: {
  name: string; description: string; severity: string;
  queries?: Array<{ id?: string; language?: string; query?: string }>;
}, queryId: string, desired: RuleContent): RuleContent {
  const matches = (detection.queries || []).filter(query => query.id === queryId);
  if (matches.length !== 1 || matches[0].language !== desired.language || !matches[0].query?.trim()) {
    throw new Error('The bound query is missing, ambiguous, or has an incompatible language');
  }
  return { ...desired, name: detection.name, description: detection.description,
    severity: detection.severity, query: matches[0].query };
}

/** Reject configuration we cannot faithfully serialize rather than resetting it to provider defaults. */
export function crowdStrikeUpdate(id: string, content: RuleContent): Record<string, Json> {
  const search = object(content.config.search), operation = object(content.config.operation);
  const schedule = object(operation.schedule);
  if (content.enabled === null || content.language !== 'CQL') throw new Error('Unknown rule state or language');
  if (Object.keys(search).some(key => !['outcome', 'lookback', 'trigger_mode', 'execution_mode', 'use_ingest_time', 'case_template_id'].includes(key)) ||
      Object.keys(operation).some(key => !['schedule', 'start_on', 'stop_on', 'suppression'].includes(key)) ||
      Object.keys(schedule).some(key => key !== 'definition') ||
      typeof search.outcome !== 'string' || typeof search.lookback !== 'string' ||
      typeof schedule.definition !== 'string') {
    throw new Error('This rule configuration is not yet supported for lossless updates');
  }
  const severity = ({ Informational: 10, Low: 30, Medium: 50, High: 70, Critical: 90 } as Record<string, number>)[content.severity];
  if (!severity) throw new Error('Invalid severity');
  return {
    ...object(content.config.fields),
    id, name: content.name, description: content.description, severity,
    ...(content.config.tactic ? { tactic: content.config.tactic } : {}),
    ...(content.config.technique ? { technique: content.config.technique } : {}),
    search: { ...search, filter: content.query },
    operation, status: content.enabled ? 'active' : 'inactive',
  };
}

/** How a remote rule relates to the shared library. Classification itself lives in SQL
 *  (public.siem_inventory_relationship); this type only names the results. */
export type InventoryRelationship =
  | 'not_in_library'
  | 'already_in_library'
  | 'archived_in_library'
  | 'match_needed'
  | 'unsupported';

export type InventoryRow = {
  id: string;
  integration_id: string;
  vendor_rule_id: string;
  rule_family: string;
  display_name: string;
  observed_enabled: boolean | null;
  availability: 'present' | 'missing' | 'unknown';
  normalization_error: string | null;
  match_candidate_count: number;
  relationship: InventoryRelationship;
  binding_id: string | null;
  binding_status: string | null;
  detection_id: string | null;
  last_seen_at: string;
  /** The catalog's current snapshot id — required to revalidate at match-resolution commit time. */
  latest_snapshot_id: string | null;
};

export const RELATIONSHIP_LABELS: Record<InventoryRelationship, string> = {
  not_in_library: 'Not in library',
  already_in_library: 'Already in library',
  archived_in_library: 'Archived in library',
  match_needed: 'Match needed',
  unsupported: 'Unsupported',
};

/** Per-rule outcome of one submitted import job. Deliberately disjoint from
 *  RELATIONSHIP_LABELS: membership and job result are different columns. */
export const IMPORT_OUTCOME_LABELS: Record<string, string> = {
  pending: 'Waiting to import',
  imported: 'Newly imported',
  linked: 'Already present',
  unchanged: 'Already present',
  changed: 'Already present',
  changed_since_preview: 'Changed since you reviewed it',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  ignored: 'Tracking stopped',
  unsupported: 'Not supported',
  ambiguous: 'Skipped · needs matching',
  failed: 'Import failed',
  observed: 'Seen in CrowdStrike',
};

export function isImportEligible(relationship: InventoryRelationship): boolean {
  return relationship === 'not_in_library';
}
