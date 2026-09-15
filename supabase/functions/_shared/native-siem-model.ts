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
export type NativeDrift = 'in_sync' | 'local_changed' | 'remote_changed' | 'conflict' | 'missing'
  | 'no_baseline' | 'unknown';
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

export function classifyDrift(baseline: RuleContent | null, local: RuleContent, remote: RuleContent,
  availability = 'present'): NativeDrift {
  if (availability === 'missing') return 'missing';
  if (availability !== 'present') return 'unknown';
  // Linked, but never reconciled. siem_link_existing refuses to invent a baseline when the chosen
  // query already differs from production, and without a common ancestor "who changed what" has no
  // answer -- local_changed and remote_changed are indistinguishable. Saying so is the only honest
  // classification; guessing one manufactures agreement nobody decided on.
  if (baseline === null) return canonicalJson(local) === canonicalJson(remote) ? 'in_sync' : 'no_baseline';
  const b = canonicalJson(baseline), l = canonicalJson(local), r = canonicalJson(remote);
  if (l === r) return 'in_sync';
  if (l === b) return 'remote_changed';
  if (r === b) return 'local_changed';
  return 'conflict';
}

/** The production mutations this adapter can perform. */
export type NativeOperation = 'update' | 'enable' | 'disable' | 'delete';
export const NATIVE_OPERATIONS: NativeOperation[] = ['update', 'enable', 'disable', 'delete'];

/** What each provider's adapter has actually been built and qualified for.
 *
 *  Declared as data rather than scattered `provider === 'crowdstrike'` conditionals so that adding
 *  a provider is an explicit statement about what it supports, not an emergent property of which
 *  branches happened to be written. A provider absent from this table supports nothing: it cannot
 *  be imported from and cannot be written to, which is the safe default for one whose payload
 *  contract has not been verified.
 *
 *  Query-language compatibility is deliberately NOT a capability. Two providers accepting the same
 *  query text says nothing about whether their deployment payloads round-trip losslessly, and
 *  treating it as proof is the specific mistake this table exists to prevent. */
export interface ProviderCapabilities {
  /** Rule families the adapter can read and import. */
  readFamilies: string[];
  /** Families it can also serialize back for a production write. A subset of readFamilies:
   *  reading a rule is a much weaker claim than being able to write it without inventing fields. */
  writeFamilies: string[];
  operations: NativeOperation[];
}

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  crowdstrike: {
    readFamilies: ['correlation'],
    writeFamilies: ['correlation'],
    operations: ['update', 'enable', 'disable', 'delete'],
  },
  // The five providers below are read/import-only: P5 (production writes) is out of scope for
  // this entire project, so every one of them declares no writeFamilies and no operations.
  splunk: {
    // Real family qualified by the Splunk reader (siem-readers/splunk.ts): ES correlation
    // searches, identified by `action.correlationsearch.enabled`. Plain saved searches without
    // that field are out of scope and never surfaced by the reader.
    readFamilies: ['correlation_search'],
    writeFamilies: [],
    operations: [],
  },
  sentinel: {
    // Real families qualified by the Sentinel reader (siem-readers/sentinel.ts): Scheduled is
    // fully mapped and importable; NRT is read defensively and mapped best-effort (no
    // queryFrequency/queryPeriod exists for it). Every other `kind` (Fusion,
    // MicrosoftSecurityIncidentCreation, ThreatIntelligence, ...) stays outside readFamilies and
    // is surfaced with an unsupported-family reason instead.
    readFamilies: ['scheduled', 'nrt'],
    writeFamilies: [],
    operations: [],
  },
  elastic: {
    // Real families qualified by the Elastic reader (siem-readers/elastic.ts): query (kuery or
    // lucene), eql, esql, and threshold (with its full threshold{field,value,cardinality}).
    // saved_query, machine_learning, threat_match and new_terms stay outside readFamilies and are
    // surfaced with an unsupported-family reason instead of being flattened into a plain query.
    readFamilies: ['query', 'eql', 'esql', 'threshold'],
    writeFamilies: [],
    operations: [],
  },
  defender_xdr: {
    readFamilies: ['detection'],
    writeFamilies: [],
    operations: [],
  },
  chronicle: {
    readFamilies: ['rule'],
    writeFamilies: [],
    operations: [],
  },
};

export function providerCapabilities(provider: string | null | undefined): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider ?? ''] ?? { readFamilies: [], writeFamilies: [], operations: [] };
}

/** Kept as the CrowdStrike-specific name the rest of the adapter already used. */
export const SUPPORTED_MUTATION_FAMILIES = PROVIDER_CAPABILITIES.crowdstrike.writeFamilies;

export interface MutationContext {
  /** Installation-wide write gate (NATIVE_SIEM_MUTATIONS). */
  writesEnabled: boolean;
  /** Defaults to crowdstrike for callers predating multi-provider support. */
  provider?: string | null;
  ruleFamily: string | null;
  bindingStatus: string;
  availability: string;
  drift: NativeDrift;
  /** A vendor write for this rule is already in flight or ended uncertain. */
  pendingOperation: boolean;
}

/** Why this operation cannot be performed right now, or null if it can.
 *
 *  Every one of these conditions was already enforced somewhere on the server, but only as a
 *  thrown error AFTER the user committed to the action — so the UI offered buttons that could not
 *  work and explained why only on failure. Stating the reason in one place lets the server keep
 *  refusing and the UI explain up front, without the two drifting apart. */
export function mutationBlockedReason(operation: NativeOperation, context: MutationContext): string | null {
  const provider = context.provider ?? 'crowdstrike';
  const capabilities = providerCapabilities(provider);
  if (!context.writesEnabled) {
    return 'Sending changes to CrowdStrike is not enabled for this installation.';
  }
  if (!capabilities.operations.includes(operation)) {
    return `Optimus cannot ${operation} rules in ${provider}.`;
  }
  if (context.ruleFamily && !capabilities.writeFamilies.includes(context.ruleFamily)) {
    return `Optimus can read ${context.ruleFamily} rules but cannot change them in CrowdStrike.`;
  }
  if (context.bindingStatus !== 'active') {
    return 'This rule is no longer tracked in CrowdStrike. Restore tracking before changing it.';
  }
  if (context.pendingOperation) {
    return 'An earlier change to this rule has not finished. Fetch rules again to see where it got to.';
  }
  if (context.availability === 'missing') {
    return 'This rule is no longer in CrowdStrike.';
  }
  if (context.availability !== 'present') {
    return 'The last check could not read this rule. Fetch rules again before changing it.';
  }
  // Without an agreed baseline there is no way to tell which side changed, so no mutation can be
  // described honestly to the user -- including a toggle, which would silently carry the
  // unreconciled query along with it.
  if (context.drift === 'no_baseline') {
    return 'This rule has never been reconciled. Choose which version is correct first.';
  }
  if (operation === 'update') {
    if (context.drift === 'in_sync') return 'The library copy already matches CrowdStrike.';
    return null;
  }
  // Enable/disable sends the CURRENT remote content with one field flipped. Doing that while
  // production has moved on would quietly revert whatever changed there.
  if (context.drift === 'remote_changed' || context.drift === 'conflict') {
    return 'CrowdStrike changed since you last checked. Review the difference before enabling or disabling.';
  }
  return null;
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

/**
 * The update body CrowdStrike ACCEPTS, which is not the shape it returns.
 *
 * `trigger_mode`, `execution_mode`, `use_ingest_time`, `mitre_attack` and `operation.start_on` all
 * come back on a read and none of them are input parameters -- echoing them back is a 400, and a
 * `start_on` read from a rule created in February is in the past besides. The legacy deploy path
 * has always sent this narrower body, which is why deploying a NEW rule worked while updating a
 * tracked one did not.
 *
 * Fields that are not sent keep whatever production has. The readback after the write is what
 * proves it: if CrowdStrike resets something we did not send, the content hash no longer matches
 * the reviewed change and the operation fails rather than being recorded as a success.
 */
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
  // The API requires a tactic whenever a technique is given, so a technique without one is
  // dropped rather than sent to be refused.
  const tactic = content.config.tactic ? String(content.config.tactic) : '';
  const technique = tactic && content.config.technique ? String(content.config.technique) : '';
  return {
    id, name: content.name, description: content.description, severity,
    ...(tactic ? { tactic } : {}),
    ...(technique ? { technique } : {}),
    search: { outcome: search.outcome, filter: content.query, lookback: search.lookback },
    operation: { schedule: { definition: schedule.definition } },
    // No `status`: CrowdStrike refuses a status transition made in the same request as the
    // schedule attributes, so the caller sends that as its own request when it changes.
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

/** Why siem_start_import would refuse to freeze this row, or null if it would accept it.
 *
 *  Membership is only half the question. The server's freeze predicate also requires that the
 *  reviewed scan actually READ the rule (a snapshot exists) and that the rule is still present in
 *  CrowdStrike; a row failing either is recorded 'skipped' with a reason. The table used to key
 *  purely off relationship, so a never-read or since-deleted rule advertised "Ready to import" and
 *  offered a live checkbox for an import that could not happen. Keeping the two predicates in one
 *  place is what stops them drifting apart again. */
export function importBlockedReason(row: {
  relationship: InventoryRelationship;
  availability: 'present' | 'missing' | 'unknown';
  latest_snapshot_id: string | null;
  normalization_error: string | null;
}): string | null {
  switch (row.relationship) {
    case 'already_in_library': return 'Already in library';
    case 'archived_in_library': return 'Archived in library. Restore it from the library to track it again.';
    case 'match_needed': return 'Needs matching to an existing library rule first';
    case 'unsupported': return row.normalization_error || 'Not supported';
  }
  if (row.availability === 'missing') return 'No longer in CrowdStrike';
  if (row.availability !== 'present') return 'Could not be read in the last check';
  if (!row.latest_snapshot_id) return 'Not read from CrowdStrike yet';
  return null;
}
