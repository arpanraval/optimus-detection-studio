/** Registry-driven dispatch for the durable SIEM import worker (Task 12, part 2).
 *
 *  `processNativeSync` (native-siem-service.ts) used to speak CrowdStrike directly: its discovery
 *  request was `queries/rules/v1?limit=&offset=` and nothing else was reachable. This file is the
 *  seam that lets the SAME lease/checkpoint/commit machinery drive Splunk, Sentinel, Elastic,
 *  Defender XDR and Chronicle too, each through its own already-qualified reader
 *  (splunk.ts/sentinel.ts/elastic.ts/defender-xdr.ts/chronicle.ts).
 *
 *  Cursor persistence: `cursor_offset` (an integer column) is kept for providers that page by a
 *  numeric offset or page number -- Splunk (count/offset) and Elastic (page number). Sentinel and
 *  Defender XDR hand back an opaque absolute continuation URL (`nextLink` / `@odata.nextLink`) and
 *  Chronicle an opaque `pageToken`; none of those are integers, and stringifying a URL into
 *  `cursor_offset` would either truncate it or require parsing a fake number back out of it. They
 *  are persisted instead in `cursor_token` (migration 20260916100000), a nullable text column
 *  siem_commit_chunk/siem_commit_inventory_chunk now also accept and store -- CrowdStrike and
 *  every other offset-paged provider never write it, so their behaviour is byte-for-byte
 *  unchanged (verified by the existing native-siem-service.test.ts, run unmodified).
 *
 *  Termination: every `discover()` below returns `done: true` the moment its own cursor stops
 *  advancing (an empty page, or a repeated/echoed cursor) -- the run then completes discovery
 *  rather than being re-claimed forever against a cursor that never moves (G11).
 *
 *  Per-rule outcomes: `readRule()` distinguishes ok / not_found / access_denied /
 *  temporary_failure / unsupported. A thrown network/auth error is never turned into an empty
 *  successful page -- it propagates out of `readRule` and out of the chunk, which is exactly how
 *  CrowdStrike's own readRuleDetails already behaves (see native-siem-service.ts). Only a
 *  provider that explicitly answers "not found" is reported as such. */
import type { Json, RuleContent } from '../native-siem-model.ts';
import { providerEndpoint, type ImportProvider } from '../siem-providers.ts';
import { normalizeSplunkEntry, splunkVendorRuleId, type NormalizedSplunkRule, type SplunkEntry, type SplunkPage } from './splunk.ts';
import { normalizeSentinelEntry, isUnsupportedSentinelRule, type NormalizedSentinelRule, type SentinelPage } from './sentinel.ts';
import { normalizeElasticEntry, isUnsupportedElasticRule, type NormalizedElasticRule, type ElasticPage } from './elastic.ts';
import { normalizeDefenderEntry, UnsupportedDefenderRule, type NormalizedDefenderRule, type DefenderPage } from './defender-xdr.ts';
import { normalizeChronicleEntry, UnsupportedChronicleRule, type NormalizedChronicleRule, type ChroniclePage } from './chronicle.ts';

export type VendorRequest = (path: string, options?: RequestInit) => Promise<Record<string, Json>>;

/** Uniform cursor shape persisted across `cursor_offset` (numeric pagers) and `cursor_token`
 *  (opaque URL/token pagers) -- see file header. A provider only ever populates the half of this
 *  it actually uses; the other half stays at its default and is never read back by that provider. */
export interface ReaderCursor {
  offset: number;
  token: string | null;
}

export interface DiscoveryResult {
  ids: string[];
  cursor: ReaderCursor;
  done: boolean;
}

export type ReadOutcome =
  | { status: 'ok'; content: RuleContent; raw: Record<string, Json>; name: string; family: string }
  | { status: 'not_found' | 'access_denied' | 'temporary_failure' | 'unsupported'; error: string };

export interface ImportReader {
  discover(request: VendorRequest, cursor: ReaderCursor): Promise<DiscoveryResult>;
  readRule(request: VendorRequest, config: Record<string, unknown>, vendorRuleId: string): Promise<ReadOutcome>;
}

function accessDenied(status: number): boolean {
  return status === 401 || status === 403;
}

/** A vendor error carries a status when it came from a non-OK HTTP response (see `client()`'s
 *  VendorRequestError-shaped throws in native-siem-service.ts and the ad-hoc errors thrown below);
 *  anything else (network failure, JSON parse) is a temporary failure, never a silent drop. */
function classifyThrown(error: unknown): { status: 'access_denied' | 'temporary_failure'; error: string } {
  const status = (error as { status?: number } | undefined)?.status;
  const message = error instanceof Error ? error.message : 'Read failed';
  return { status: typeof status === 'number' && accessDenied(status) ? 'access_denied' : 'temporary_failure', error: message };
}

// ---------------------------------------------------------------------------------------------
// Splunk -- offset/count paging (cursor.offset), owner-scoped single-item GET (recon section 1,
// "Single item (GET): GET /servicesNS/{owner}/{app}/saved/searches/{name}").
// ---------------------------------------------------------------------------------------------
const splunkReader: ImportReader = {
  async discover(request, cursor) {
    const pageSize = 100;
    const page = await request(`saved/searches?output_mode=json&count=${pageSize}&offset=${cursor.offset}`) as SplunkPage;
    const entries = Array.isArray(page.entry) ? page.entry : [];
    const ids: string[] = [];
    for (const raw of entries) {
      try { ids.push(splunkVendorRuleId(normalizeSplunkEntry(raw).identity)); } catch { /* unsupported entries are simply not importable ids */ }
    }
    const done = entries.length === 0 || entries.length < pageSize;
    return { ids, cursor: { offset: cursor.offset + entries.length, token: null }, done };
  },
  async readRule(request, config, vendorRuleId) {
    const [owner, app, ...nameParts] = vendorRuleId.split('/');
    const name = nameParts.join('/');
    if (!owner || !app || !name) return { status: 'unsupported', error: `Malformed Splunk identity "${vendorRuleId}"` };
    const { baseUrl } = providerEndpoint('splunk', config);
    const url = `${baseUrl}/servicesNS/${encodeURIComponent(owner)}/${encodeURIComponent(app)}/saved/searches/` +
      `${encodeURIComponent(name)}?output_mode=json`;
    try {
      const page = await request(url) as SplunkPage;
      const raw = (page.entry ?? [])[0] as SplunkEntry | undefined;
      if (!raw) return { status: 'not_found', error: 'Splunk did not return this saved search' };
      const normalized = normalizeSplunkEntry(raw);
      return { status: 'ok', content: splunkContent(normalized.content, normalized), raw: raw as unknown as Record<string, Json>,
        name: normalized.name, family: 'correlation_search' };
    } catch (error) {
      if (error instanceof Error && /Unsupported rule/.test(error.message)) return { status: 'unsupported', error: error.message };
      const { status, error: message } = classifyThrown(error);
      return { status, error: message };
    }
  },
};

function splunkContent(content: Record<string, Json>, rule: NormalizedSplunkRule): RuleContent {
  return {
    name: rule.name, description: rule.description, query: rule.query, language: 'SPL',
    severity: 'unknown', enabled: rule.observedState === 'unknown' ? null : rule.observedState === 'enabled',
    config: { ...content, acl: rule.acl as unknown as Json, stateSignals: rule.stateSignals as unknown as Json },
  };
}

// ---------------------------------------------------------------------------------------------
// Sentinel -- ARM nextLink paging (cursor.token), single rule GET (recon section 2: "Single rule
// GET: same path + /{ruleId}?api-version=2025-06-01").
// ---------------------------------------------------------------------------------------------
const SENTINEL_API_VERSION = '2025-06-01';
const sentinelReader: ImportReader = {
  async discover(request, cursor) {
    const path = cursor.token ?? `alertRules?api-version=${SENTINEL_API_VERSION}`;
    const page = await request(path) as SentinelPage;
    const entries = Array.isArray(page.value) ? page.value : [];
    const ids: string[] = [];
    for (const raw of entries) {
      const id = normalizeSentinelEntry(raw).vendorRuleId;
      if (id) ids.push(id);
    }
    const next = typeof page.nextLink === 'string' && page.nextLink ? page.nextLink : null;
    // A provider echoing the same nextLink back must not spin the run forever (G11).
    const done = !next || next === cursor.token;
    return { ids, cursor: { offset: 0, token: done ? null : next }, done };
  },
  async readRule(request, _config, vendorRuleId) {
    try {
      const raw = await request(`alertRules/${encodeURIComponent(vendorRuleId)}?api-version=${SENTINEL_API_VERSION}`);
      const normalized = normalizeSentinelEntry(raw as never);
      if (isUnsupportedSentinelRule(normalized)) return { status: 'unsupported', error: normalized.reason };
      return { status: 'ok', content: sentinelContent(normalized), raw: raw as Record<string, Json>,
        name: normalized.displayName, family: normalized.kind.toLowerCase() };
    } catch (error) {
      const { status, error: message } = classifyThrown(error);
      if (status === 'temporary_failure' && (error as { status?: number }).status === 404) return { status: 'not_found', error: message };
      return { status, error: message };
    }
  },
};

function sentinelContent(rule: NormalizedSentinelRule): RuleContent {
  return {
    name: rule.displayName, description: rule.description, query: rule.query, language: 'KQL',
    severity: rule.severity, enabled: rule.enabled === 'unknown' ? null : rule.enabled,
    config: { ...rule.properties, armId: rule.armId, kind: rule.kind, unmappedFields: rule.unmappedFields as unknown as Json },
  };
}

// ---------------------------------------------------------------------------------------------
// Elastic -- page-number paging (cursor.offset used as page), single rule GET (recon section 3:
// "Single rule GET: GET /api/detection_engine/rules?rule_id={rule_id} or ?id={id}").
// ---------------------------------------------------------------------------------------------
const elasticReader: ImportReader = {
  async discover(request, cursor) {
    const page = Math.max(1, cursor.offset);
    const perPage = 50;
    const result = await request(`detection_engine/rules/_find?per_page=${perPage}&page=${page}`) as ElasticPage;
    const data = Array.isArray(result.data) ? result.data : [];
    const ids: string[] = [];
    for (const raw of data) {
      const normalized = normalizeElasticEntry(raw);
      if (normalized.vendorRuleId) ids.push(normalized.vendorRuleId);
    }
    const done = data.length === 0 || data.length < perPage;
    return { ids, cursor: { offset: done ? page : page + 1, token: null }, done };
  },
  async readRule(request, _config, vendorRuleId) {
    try {
      const raw = await request(`detection_engine/rules?rule_id=${encodeURIComponent(vendorRuleId)}`);
      const normalized = normalizeElasticEntry(raw as never);
      if (isUnsupportedElasticRule(normalized)) return { status: 'unsupported', error: normalized.reason };
      return { status: 'ok', content: elasticContent(normalized), raw: raw as Record<string, Json>,
        name: normalized.name, family: normalized.type };
    } catch (error) {
      const { status, error: message } = classifyThrown(error);
      if (status === 'temporary_failure' && (error as { status?: number }).status === 404) return { status: 'not_found', error: message };
      return { status, error: message };
    }
  },
};

function elasticContent(rule: NormalizedElasticRule): RuleContent {
  return {
    name: rule.name, description: '', query: rule.query, language: rule.language,
    severity: rule.severity, enabled: rule.enabled === 'unknown' ? null : rule.enabled,
    config: { objectId: rule.objectId, type: rule.type, index: rule.index as unknown as Json,
      filters: rule.filters, threshold: rule.threshold as unknown as Json, riskScore: rule.riskScore,
      interval: rule.interval, from: rule.from, revision: rule.revision, version: rule.version,
      exceptionsList: rule.exceptionsList, actions: rule.actions, alertSuppression: rule.alertSuppression,
      immutable: rule.immutable === 'unknown' ? null : rule.immutable, unmappedFields: rule.unmappedFields as unknown as Json },
  };
}

// ---------------------------------------------------------------------------------------------
// Defender XDR -- Graph @odata.nextLink paging (cursor.token), single rule GET (recon section 4:
// "Single rule GET: GET /beta/security/rules/detectionRules/{detectionRuleId}").
// ---------------------------------------------------------------------------------------------
const defenderReader: ImportReader = {
  async discover(request, cursor) {
    const path = cursor.token ?? 'rules/detectionRules?$top=50';
    const page = await request(path) as DefenderPage;
    const entries = Array.isArray(page.value) ? page.value : [];
    const ids: string[] = [];
    for (const raw of entries) {
      try { ids.push(normalizeDefenderEntry(raw).vendorRuleId); } catch { /* missing id: not importable */ }
    }
    const next = typeof page['@odata.nextLink'] === 'string' && page['@odata.nextLink'] ? page['@odata.nextLink'] : null;
    const done = !next || next === cursor.token;
    return { ids, cursor: { offset: 0, token: done ? null : next }, done };
  },
  async readRule(request, _config, vendorRuleId) {
    try {
      const raw = await request(`rules/detectionRules/${encodeURIComponent(vendorRuleId)}`);
      const normalized = normalizeDefenderEntry(raw as never);
      return { status: 'ok', content: defenderContent(normalized), raw: raw as Record<string, Json>,
        name: normalized.displayName, family: 'detection' };
    } catch (error) {
      if (error instanceof UnsupportedDefenderRule) return { status: 'unsupported', error: error.message };
      const { status, error: message } = classifyThrown(error);
      if (status === 'temporary_failure' && (error as { status?: number }).status === 404) return { status: 'not_found', error: message };
      return { status, error: message };
    }
  },
};

function defenderContent(rule: NormalizedDefenderRule): RuleContent {
  return {
    name: rule.displayName, description: rule.description, query: rule.query, language: 'KQL',
    severity: rule.alertTemplate?.severity ?? 'unknown',
    enabled: rule.observedState === 'unknown' ? null : rule.observedState === 'enabled',
    config: { status: rule.status, statusSource: rule.statusSource, autoDisabled: rule.autoDisabled,
      frequency: rule.frequency, continuous: rule.continuous, scheduleSource: rule.scheduleSource,
      alertTemplate: rule.alertTemplate as unknown as Json, mitreTechniques: rule.mitreTechniques,
      automatedActions: rule.automatedActions, responseActions: rule.responseActions,
      detectorId: rule.detectorId, lastRunDetails: rule.lastRunDetails,
      unmappedFields: rule.unmappedFields as unknown as Json },
  };
}

// ---------------------------------------------------------------------------------------------
// Chronicle -- pageToken paging (cursor.token). No single-rule GET is confirmed on the configured
// legacy v2 Detection API (recon: v1's `rules/{name}` get is a different, unconfigured API
// surface -- see chronicle.ts file header). This reader follows the SAME resource convention the
// codebase already uses for the list (`{configured base}/rules`, chronicleBaseUrl in
// integration-ops/index.ts) rather than inventing an unrelated path, but that convention is not
// independently confirmed by recon for a GET -- a 404 here is reported as not_found rather than
// assumed to prove anything about the rule's existence beyond "this endpoint would not return it".
// ---------------------------------------------------------------------------------------------
const chronicleReader: ImportReader = {
  async discover(request, cursor) {
    const path = cursor.token ? `?pageSize=100&pageToken=${encodeURIComponent(cursor.token)}` : '?pageSize=100';
    const page = await request(path) as ChroniclePage;
    const entries = Array.isArray(page.rules) ? page.rules : [];
    const ids: string[] = [];
    for (const raw of entries) {
      try { ids.push(normalizeChronicleEntry(raw).vendorRuleId); } catch {
        // A rule whose text is unavailable at list time is not importable from this page alone;
        // it is simply not surfaced as a discoverable id (matching the one-shot importer's
        // handling of the same condition in integration-ops/index.ts chronicleListRules).
      }
    }
    const next = typeof page.nextPageToken === 'string' && page.nextPageToken ? page.nextPageToken : null;
    const done = !next || next === cursor.token;
    return { ids, cursor: { offset: 0, token: done ? null : next }, done };
  },
  async readRule(request, _config, vendorRuleId) {
    try {
      const raw = await request(`${encodeURIComponent(vendorRuleId)}`);
      const normalized = normalizeChronicleEntry(raw as never);
      return { status: 'ok', content: chronicleContent(normalized), raw: raw as Record<string, Json>,
        name: normalized.name, family: 'yara_l' };
    } catch (error) {
      if (error instanceof UnsupportedChronicleRule) return { status: 'unsupported', error: error.message };
      const { status, error: message } = classifyThrown(error);
      if (status === 'temporary_failure' && (error as { status?: number }).status === 404) return { status: 'not_found', error: message };
      return { status, error: message };
    }
  },
};

function chronicleContent(rule: NormalizedChronicleRule): RuleContent {
  return {
    name: rule.name, description: rule.description, query: rule.query, language: 'YARA-L',
    severity: rule.severity, enabled: rule.liveExecution === 'unknown' ? null : rule.liveExecution === 'true',
    config: { resourceName: rule.resourceName, revisionId: rule.revisionId, revisionCreateTime: rule.revisionCreateTime,
      compilationState: rule.compilationState, compilationError: rule.compilationError,
      alerting: rule.alerting, archived: rule.archived, unmappedFields: rule.unmappedFields as unknown as Json },
  };
}

/** CrowdStrike is deliberately absent -- it keeps its own bespoke, batch-oriented path in
 *  native-siem-service.ts (readRuleDetails) to preserve its two-step discovery/hydration protocol
 *  byte-for-byte (Task 12, part 1). Every other registered provider goes through this table. */
export const IMPORT_READERS: Partial<Record<ImportProvider, ImportReader>> = {
  splunk: splunkReader,
  sentinel: sentinelReader,
  elastic: elasticReader,
  defender_xdr: defenderReader,
  chronicle: chronicleReader,
};
