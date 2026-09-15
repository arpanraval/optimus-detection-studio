/** Elastic Security (Kibana Detection Engine) rule reader.
 *
 *  Source of truth: siem-multi-provider-library-import-plan/recon-provider-apis.md section 3
 *  (compiled from official Elastic documentation, no live tenant). One item is explicitly
 *  UNSETTLED by that recon and MUST NOT be fixture-guessed here: the exact ES|QL query-text field
 *  name (the createRule schema truncated before the esql branch). This reader reads the `query`
 *  field defensively for esql rules -- present -> used, absent -> the rule is still imported with
 *  an empty query and a note in `unmappedFields`, never a thrown "unsupported" for that reason
 *  alone, since the rule IS a supported family, only the field name is unconfirmed.
 *
 *  Identity: `rule_id` is the stable, durable key (Elastic's own prebuilt content and the
 *  Detection Rules repo key on it). The saved-object `id` is a per-instance locator only -- it is
 *  NOT stable across space export/import or reinstall, so it must never be used as the primary
 *  key. `revision`/`version` are observations, not identity. `provider_scope` already carries the
 *  endpoint + Kibana space (see siem-providers.ts `providerScope('elastic', ...)`), so the same
 *  `rule_id` installed in two different spaces is two different provider_scope values -- not a
 *  collision -- and both installations are surfaced independently. */
import type { Json } from '../native-siem-model.ts';

export type ElasticRuleType =
  | 'query' | 'eql' | 'esql' | 'threshold'
  | 'saved_query' | 'machine_learning' | 'threat_match' | 'new_terms' | string;

export type ElasticThreshold = {
  field?: Json;
  value?: number;
  cardinality?: Array<{ field?: string; value?: number }>;
};

export type ElasticRuleEntry = {
  id?: string;
  rule_id?: string;
  type?: ElasticRuleType;
  language?: string;
  name?: string;
  enabled?: boolean;
  revision?: number;
  version?: number;
  query?: string;
  index?: string[];
  filters?: Json;
  threshold?: ElasticThreshold;
  risk_score?: number;
  severity?: string;
  interval?: string;
  from?: string;
  exceptions_list?: Json;
  actions?: Json;
  alert_suppression?: Json;
  immutable?: boolean;
  rule_source?: Json;
  [key: string]: Json | undefined;
};

export type ElasticPage = { page?: number; perPage?: number; total?: number; data?: ElasticRuleEntry[] };

/** Kibana `language` id -> Optimus's constants.ts query-language id (src/constants.ts:5-20).
 *  NEVER map any of `kuery`/`lucene`/`eql`/`esql` to `KQL` -- that identifier means Microsoft
 *  Kusto, a different language entirely (per the batch brief). A previous bug did exactly this;
 *  this map exists specifically to make that mistake impossible to repeat quietly. */
const ELASTIC_LANGUAGE_MAP: Record<string, string> = {
  kuery: 'Kuery',
  lucene: 'Lucene',
  eql: 'EQL',
  esql: 'ESQL',
};

function mapElasticLanguage(type: ElasticRuleType, language: string | undefined): string {
  if (type === 'eql') return 'EQL';
  if (type === 'esql') return 'ESQL';
  if (language && ELASTIC_LANGUAGE_MAP[language]) return ELASTIC_LANGUAGE_MAP[language];
  // Defensive default for `query` rules whose language is missing/unrecognized: Kibana's own
  // default for a `query`-type rule is kuery, never Kusto KQL.
  return 'Kuery';
}

/** Types this reader can faithfully represent as an importable rule (batch-4 brief). Every other
 *  type stays visible with its own `type` and a precise unsupported-import reason instead of being
 *  flattened into a plain query rule (G19). */
const IMPORTABLE_TYPES = new Set<ElasticRuleType>(['query', 'eql', 'esql', 'threshold']);

const UNSUPPORTED_REASONS: Record<string, string> = {
  saved_query: 'References a saved search object (saved_id) rather than an inline query',
  machine_learning: 'Anomaly-detection job rule; no inline query to import',
  threat_match: 'Indicator-match rule; requires a threat index/mapping Optimus does not model yet',
  new_terms: 'New-terms rule; requires history-window fields Optimus does not model yet',
};

export interface NormalizedElasticRule {
  vendorRuleId: string; // rule_id -- the stable key
  objectId: string | null; // saved-object id -- locator only, never identity
  type: ElasticRuleType;
  name: string;
  language: string;
  query: string;
  index: string[];
  filters: Json;
  threshold: { field: string[]; value: number; cardinality: Array<{ field: string; value: number }> } | null;
  riskScore: number | null;
  severity: string;
  interval: string | null;
  from: string | null;
  enabled: boolean | 'unknown';
  revision: number | null;
  version: number | null;
  exceptionsList: Json;
  actions: Json;
  alertSuppression: Json;
  /** Prebuilt/customized provenance: a prebuilt rule being locally editable in Kibana does not
   *  imply the installed instance is writable -- surfaced, never assumed. */
  immutable: boolean | 'unknown';
  raw: ElasticRuleEntry;
  /** Fields not represented above -- e.g. the ES|QL query-text field, which recon leaves
   *  unsettled; surfaced rather than silently dropped. */
  unmappedFields: string[];
}

export type ElasticUnsupportedRule = {
  vendorRuleId: string;
  objectId: string | null;
  type: ElasticRuleType;
  name: string;
  reason: string;
};

const MAPPED_KEYS = new Set([
  'id', 'rule_id', 'type', 'language', 'name', 'enabled', 'revision', 'version', 'query', 'index',
  'filters', 'threshold', 'risk_score', 'severity', 'interval', 'from', 'exceptions_list',
  'actions', 'alert_suppression', 'immutable', 'rule_source',
]);

function parseEnabled(value: Json | undefined): boolean | 'unknown' {
  return typeof value === 'boolean' ? value : 'unknown';
}

function stringArray(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeThreshold(threshold: ElasticThreshold | undefined): NormalizedElasticRule['threshold'] {
  if (!threshold) return null;
  return {
    field: stringArray(threshold.field as Json),
    value: typeof threshold.value === 'number' ? threshold.value : 0,
    cardinality: Array.isArray(threshold.cardinality)
      ? threshold.cardinality
        .filter((entry): entry is { field: string; value: number } =>
          !!entry && typeof entry.field === 'string' && typeof entry.value === 'number')
        .map(entry => ({ field: entry.field, value: entry.value }))
      : [],
  };
}

export function normalizeElasticEntry(entry: ElasticRuleEntry): NormalizedElasticRule | ElasticUnsupportedRule {
  const objectId = typeof entry.id === 'string' ? entry.id : null;
  const vendorRuleId = typeof entry.rule_id === 'string' && entry.rule_id ? entry.rule_id : (objectId ?? '');
  const type: ElasticRuleType = typeof entry.type === 'string' ? entry.type : 'unknown';
  const name = typeof entry.name === 'string' ? entry.name : vendorRuleId;
  if (!vendorRuleId) {
    return { vendorRuleId: '', objectId, type, name, reason: 'Missing rule_id; cannot establish a stable identity' };
  }
  if (!IMPORTABLE_TYPES.has(type)) {
    return {
      vendorRuleId, objectId, type, name,
      reason: UNSUPPORTED_REASONS[type] ?? `Elastic rule type "${type}" is not an importable detection family`,
    };
  }
  const query = typeof entry.query === 'string' ? entry.query : '';
  const unmappedFields = Object.keys(entry).filter(key => !MAPPED_KEYS.has(key));
  return {
    vendorRuleId, objectId, type, name,
    language: mapElasticLanguage(type, entry.language),
    query,
    index: stringArray(entry.index as Json),
    filters: entry.filters ?? null,
    threshold: type === 'threshold' ? normalizeThreshold(entry.threshold) : null,
    riskScore: typeof entry.risk_score === 'number' ? entry.risk_score : null,
    severity: typeof entry.severity === 'string' ? entry.severity : 'unknown',
    interval: typeof entry.interval === 'string' ? entry.interval : null,
    from: typeof entry.from === 'string' ? entry.from : null,
    enabled: parseEnabled(entry.enabled),
    revision: typeof entry.revision === 'number' ? entry.revision : null,
    version: typeof entry.version === 'number' ? entry.version : null,
    exceptionsList: entry.exceptions_list ?? null,
    actions: entry.actions ?? null,
    alertSuppression: entry.alert_suppression ?? null,
    immutable: parseEnabled(entry.immutable),
    raw: entry,
    unmappedFields: type === 'esql' ? [...unmappedFields, 'esql query-text field name is unsettled by recon -- read from `query`'] : unmappedFields,
  };
}

export function isUnsupportedElasticRule(rule: NormalizedElasticRule | ElasticUnsupportedRule): rule is ElasticUnsupportedRule {
  return 'reason' in rule;
}

export type ElasticPageFetcher = (page: number, perPage: number) => Promise<ElasticPage>;

export interface ElasticListOutcome {
  rules: NormalizedElasticRule[];
  unsupported: ElasticUnsupportedRule[];
  pagesRead: number;
  /** True if paging stopped because the cursor stopped advancing (G11/G12) -- e.g. an empty page
   *  returned while `total` still claims more rows exist (a stale total, since `total` can move
   *  during a scan per the brief). Never trusted as the sole stop condition. */
  stoppedOnNonAdvancingCursor: boolean;
}

const DEFAULT_PAGE_SIZE = 50;
/** Bounded stop for a repeated/non-advancing page (G11): never an endless worker even if `total`
 *  keeps claiming more rows than are actually returned. */
const MAX_PAGES = 500;

/** Checkpointed `page`/`per_page` paging replacing the previous in-invocation `while (true)` loop
 *  that compared accumulated length against `data.total` alone. `total` can move during a scan
 *  (Elastic recon section 3), so termination here is: an empty page, a short page (fewer entries
 *  than requested), OR a repeated page number seen twice (bounded by MAX_PAGES) -- never a bare
 *  `accumulated >= total` comparison, which would loop forever against a total that keeps
 *  climbing, or stop early against one that shrinks. */
export async function readElasticRules(
  fetchPage: ElasticPageFetcher,
  startPage = 1,
  perPage = DEFAULT_PAGE_SIZE,
): Promise<ElasticListOutcome> {
  const rules: NormalizedElasticRule[] = [];
  const unsupported: ElasticUnsupportedRule[] = [];
  let page = startPage;
  let pagesRead = 0;
  let stoppedOnNonAdvancingCursor = false;
  const seenPages = new Set<number>();
  while (pagesRead < MAX_PAGES) {
    if (seenPages.has(page)) { stoppedOnNonAdvancingCursor = true; break; }
    seenPages.add(page);
    const result = await fetchPage(page, perPage);
    pagesRead++;
    const data = Array.isArray(result.data) ? result.data : [];
    for (const raw of data) {
      const normalized = normalizeElasticEntry(raw);
      if (isUnsupportedElasticRule(normalized)) unsupported.push(normalized);
      else rules.push(normalized);
    }
    if (data.length === 0) break;
    if (data.length < perPage) break;
    page++;
  }
  return { rules, unsupported, pagesRead, stoppedOnNonAdvancingCursor };
}
