/** Microsoft Sentinel analytics-rule reader (ARM `alertRules` list).
 *
 *  Source of truth: siem-multi-provider-library-import-plan/recon-provider-apis.md section 2.
 *  One item is UNSETTLED by that recon and MUST NOT be fixture-guessed: the full `NrtAlertRule`
 *  property set beyond the documented "no queryFrequency/queryPeriod/trigger*" absence -- NRT
 *  rules are read defensively (present -> used, absent -> unknown) and unmapped fields are noted.
 *
 *  Identity: the ARM resource `name` (a GUID) within the workspace is the stable key.
 *  `alertRuleTemplateName` is provenance ("this rule was created from template X"), never
 *  identity. */
import type { Json } from '../native-siem-model.ts';

export type SentinelKind = 'Scheduled' | 'NRT' | 'MicrosoftSecurityIncidentCreation' | 'Fusion' | 'ThreatIntelligence' | string;

export type SentinelRuleEntry = {
  id?: string;
  name?: string;
  kind?: SentinelKind;
  properties?: Record<string, Json>;
};

export type SentinelPage = { value?: SentinelRuleEntry[]; nextLink?: string | null };

/** Kinds this reader can faithfully represent as an importable analytics rule. Every other kind
 *  (Fusion, MicrosoftSecurityIncidentCreation, ThreatIntelligence, and any future kind) stays
 *  visible with its own `kind` and a precise unsupported-import reason instead of being dropped or
 *  miscoded as one of these two (G19). */
const IMPORTABLE_KINDS = new Set<SentinelKind>(['Scheduled', 'NRT']);

export interface NormalizedSentinelRule {
  vendorRuleId: string;
  /** Full ARM resource locator -- preserved as identity provenance, not the identity itself. */
  armId: string | null;
  kind: SentinelKind;
  displayName: string;
  description: string;
  severity: string;
  enabled: boolean | 'unknown';
  query: string;
  language: 'KQL';
  /** Scheduled-only. Absent (not defaulted) for NRT -- Scheduled's cadence must never be injected
   *  into an NRT rule, which the recon confirms has no configurable analog (fixed 1-minute
   *  interval, 2-minute delay, per the near-real-time-rules conceptual doc). */
  queryFrequency: string | null;
  queryPeriod: string | null;
  triggerOperator: string | null;
  triggerThreshold: number | null;
  tactics: string[];
  techniques: string[];
  entityMappings: Json;
  eventGroupingSettings: Json;
  incidentConfiguration: Json;
  alertDetailsOverride: Json;
  customDetails: Json;
  suppressionEnabled: boolean | 'unknown';
  suppressionDuration: string | null;
  alertRuleTemplateName: string | null;
  templateVersion: string | null;
  /** Fields the reader did not map for this kind, e.g. any NRT property beyond the documented
   *  shared set -- surfaced rather than silently dropped, since the full NrtAlertRule schema is
   *  unsettled. */
  unmappedFields: string[];
  properties: Record<string, Json>;
  /** The whole ARM entry as returned, not just `properties`. The durable importer snapshots
   *  this so a field nobody mapped is still inspectable later; `properties` alone drops the
   *  envelope (id, name, kind, etag, systemData) that identifies and versions the resource. */
  raw: Record<string, Json>;
}

export type SentinelUnsupportedRule = {
  vendorRuleId: string;
  armId: string | null;
  kind: SentinelKind;
  displayName: string;
  reason: string;
  raw: Record<string, Json>;
};

function parseEnabled(value: Json | undefined): boolean | 'unknown' {
  if (typeof value === 'boolean') return value;
  return 'unknown';
}

function stringArray(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function stringOrNull(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

/** The property names every alert-rule `kind` shares, per recon's field diff. Anything else on a
 *  Scheduled rule's `properties` beyond this set plus the Scheduled-only fields is unmapped;
 *  anything on an NRT rule beyond this set is ALSO unmapped, since the full NRT schema is
 *  unsettled and nothing beyond the shared set is confirmed to exist on it. */
const SHARED_PROPERTY_KEYS = new Set([
  'displayName', 'description', 'severity', 'enabled', 'tactics', 'techniques', 'query',
  'entityMappings', 'eventGroupingSettings', 'alertDetailsOverride', 'customDetails',
  'incidentConfiguration', 'suppressionDuration', 'suppressionEnabled', 'alertRuleTemplateName',
  'templateVersion', 'lastModifiedUtc',
]);
const SCHEDULED_ONLY_KEYS = new Set(['queryFrequency', 'queryPeriod', 'triggerOperator', 'triggerThreshold']);

export function normalizeSentinelEntry(entry: SentinelRuleEntry): NormalizedSentinelRule | SentinelUnsupportedRule {
  const armId = typeof entry.id === 'string' ? entry.id : null;
  const vendorRuleId = typeof entry.name === 'string' && entry.name
    ? entry.name : (armId?.match(/\/alertRules\/([^/]+)$/i)?.[1] ?? '');
  const kind: SentinelKind = typeof entry.kind === 'string' ? entry.kind : 'Unknown';
  const props = entry.properties && typeof entry.properties === 'object' ? entry.properties : {};
  // The whole entry, envelope included. Snapshotted verbatim so an unmapped field stays
  // inspectable; secrets are stripped later by sanitizeSnapshot, not here.
  const raw = entry as unknown as Record<string, Json>;
  const displayName = typeof props.displayName === 'string' ? props.displayName : vendorRuleId;
  if (!vendorRuleId) {
    return { vendorRuleId: '', armId, kind, displayName, raw,
      reason: 'Missing ARM resource name; cannot establish identity' };
  }
  if (!IMPORTABLE_KINDS.has(kind)) {
    return { vendorRuleId, armId, kind, displayName, raw,
      reason: `Sentinel rule kind "${kind}" is not an importable analytics rule family` };
  }
  const query = typeof props.query === 'string' ? props.query : '';
  if (!query.trim()) return { vendorRuleId, armId, kind, displayName, raw, reason: 'Rule source query is unavailable' };
  const isScheduled = kind === 'Scheduled';
  // NRT: Scheduled's cadence defaults must NEVER be injected here. Presence is read defensively --
  // if a future/undocumented NRT payload does carry these fields they are still surfaced, but
  // absence on NRT is expected and correctly yields null, not a fabricated default.
  const queryFrequency = typeof props.queryFrequency === 'string' ? props.queryFrequency : null;
  const queryPeriod = typeof props.queryPeriod === 'string' ? props.queryPeriod : null;
  const triggerOperator = typeof props.triggerOperator === 'string' ? props.triggerOperator : null;
  const triggerThreshold = typeof props.triggerThreshold === 'number' ? props.triggerThreshold : null;
  const allowedKeys = isScheduled ? new Set([...SHARED_PROPERTY_KEYS, ...SCHEDULED_ONLY_KEYS]) : SHARED_PROPERTY_KEYS;
  const unmappedFields = Object.keys(props).filter(key => !allowedKeys.has(key));
  return {
    vendorRuleId, armId, kind, displayName,
    description: typeof props.description === 'string' ? props.description : '',
    severity: typeof props.severity === 'string' ? props.severity : 'unknown',
    enabled: parseEnabled(props.enabled),
    query, language: 'KQL',
    queryFrequency, queryPeriod, triggerOperator, triggerThreshold,
    tactics: stringArray(props.tactics),
    techniques: stringArray(props.techniques),
    entityMappings: props.entityMappings ?? null,
    eventGroupingSettings: props.eventGroupingSettings ?? null,
    incidentConfiguration: props.incidentConfiguration ?? null,
    alertDetailsOverride: props.alertDetailsOverride ?? null,
    customDetails: props.customDetails ?? null,
    suppressionEnabled: parseEnabled(props.suppressionEnabled),
    suppressionDuration: stringOrNull(props.suppressionDuration),
    alertRuleTemplateName: stringOrNull(props.alertRuleTemplateName),
    templateVersion: stringOrNull(props.templateVersion),
    unmappedFields,
    properties: props,
    raw,
  };
}

export function isUnsupportedSentinelRule(rule: NormalizedSentinelRule | SentinelUnsupportedRule): rule is SentinelUnsupportedRule {
  return 'reason' in rule;
}

export type SentinelPageFetcher = (url: string) => Promise<SentinelPage>;

export interface SentinelListOutcome {
  rules: NormalizedSentinelRule[];
  unsupported: SentinelUnsupportedRule[];
  pagesRead: number;
  stoppedOnRepeatedCursor: boolean;
}

/** Bounded stop for a repeated/non-advancing `nextLink` (G11): never an endless worker. */
const MAX_PAGES = 500;

/** Follows `nextLink` until exhausted (recon section 2: standard ARM `value[]` + `nextLink`
 *  envelope, absent/null `nextLink` = last page) -- replacing the previous single-response read
 *  that silently truncated large workspaces. `fetchPage` is expected to have already validated
 *  the continuation URL's origin (native-siem-service.ts `client()` / `validateContinuationUrl`,
 *  G38) before this reader ever sees it; this function does not bypass that check by constructing
 *  or following any URL other than the one the provider returned. A repeated `nextLink` (the same
 *  URL seen twice) stops the loop rather than looping forever. */
export async function readSentinelAlertRules(
  fetchPage: SentinelPageFetcher,
  firstUrl: string,
): Promise<SentinelListOutcome> {
  const rules: NormalizedSentinelRule[] = [];
  const unsupported: SentinelUnsupportedRule[] = [];
  const seenUrls = new Set<string>();
  let url: string | null = firstUrl;
  let pagesRead = 0;
  let stoppedOnRepeatedCursor = false;
  while (url && pagesRead < MAX_PAGES) {
    if (seenUrls.has(url)) { stoppedOnRepeatedCursor = true; break; }
    seenUrls.add(url);
    const page: SentinelPage = await fetchPage(url);
    pagesRead++;
    const entries = Array.isArray(page.value) ? page.value : [];
    for (const raw of entries) {
      const normalized = normalizeSentinelEntry(raw);
      if (isUnsupportedSentinelRule(normalized)) unsupported.push(normalized);
      else rules.push(normalized);
    }
    url = typeof page.nextLink === 'string' && page.nextLink ? page.nextLink : null;
  }
  return { rules, unsupported, pagesRead, stoppedOnRepeatedCursor };
}
