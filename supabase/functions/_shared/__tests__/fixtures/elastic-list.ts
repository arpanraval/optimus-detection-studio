// CONSTRUCTED FROM DOCS — not captured from a live tenant. Source:
// https://www.elastic.co/docs/api/doc/kibana/operation/operation-findrules
// https://www.elastic.co/docs/api/doc/kibana/operation/operation-createrule
// https://www.elastic.co/docs/solutions/security/detect-and-alert/threshold
import type { ElasticRuleEntry } from '../../siem-readers/elastic.ts';

/** Same prebuilt rule installed in two different Kibana spaces -- same rule_id, different
 *  saved-object id and different provider_scope (space is part of scope), so these are two
 *  independent installations, not a collision (G21). */
export const ELASTIC_PREBUILT_TWO_SPACES: ElasticRuleEntry[] = [
  {
    id: 'so-space-default-0001', rule_id: 'elastic-prebuilt-suspicious-rdp', type: 'query', language: 'kuery',
    name: 'Suspicious RDP Login From New Country', enabled: true, revision: 3, version: 3,
    query: 'event.category:authentication and winlog.logon.type:RemoteInteractive', index: ['winlogbeat-*'],
    severity: 'medium', risk_score: 47, interval: '5m', from: 'now-6m', immutable: true,
  },
  {
    id: 'so-space-soc-0002', rule_id: 'elastic-prebuilt-suspicious-rdp', type: 'query', language: 'kuery',
    name: 'Suspicious RDP Login From New Country', enabled: false, revision: 3, version: 3,
    query: 'event.category:authentication and winlog.logon.type:RemoteInteractive', index: ['winlogbeat-*'],
    severity: 'medium', risk_score: 47, interval: '5m', from: 'now-6m', immutable: true,
  },
];

/** kuery vs Kusto KQL: the reader must map `kuery` -> `Kuery`, never `KQL` (Microsoft Kusto). */
export const ELASTIC_KUERY_RULE: ElasticRuleEntry = {
  id: 'so-0003', rule_id: 'custom-suspicious-rdp-login', type: 'query', language: 'kuery',
  name: 'Suspicious RDP Login', enabled: true, revision: 1, version: 1,
  query: 'event.category:authentication and event.action:logon-success', index: ['winlogbeat-*'],
  severity: 'medium', risk_score: 47, interval: '5m', from: 'now-6m',
};

export const ELASTIC_LUCENE_RULE: ElasticRuleEntry = {
  id: 'so-0004', rule_id: 'custom-lucene-rule', type: 'query', language: 'lucene',
  name: 'Lucene Query Rule', enabled: true, revision: 1, version: 1,
  query: 'event.category:authentication', index: ['winlogbeat-*'], severity: 'low', risk_score: 21,
};

export const ELASTIC_EQL_RULE: ElasticRuleEntry = {
  id: 'so-0005', rule_id: 'custom-eql-rule', type: 'eql', language: 'eql',
  name: 'EQL Sequence Rule', enabled: true, revision: 1, version: 1,
  query: 'sequence [process where process.name == "cmd.exe"] [process where process.name == "powershell.exe"]',
  index: ['logs-endpoint.events.*'], severity: 'high', risk_score: 73,
};

/** ES|QL: the exact query-text field name is UNSETTLED by recon -- read from `query` defensively
 *  and surface an unmapped-field note rather than guessing a different field name. */
export const ELASTIC_ESQL_RULE: ElasticRuleEntry = {
  id: 'so-0006', rule_id: 'custom-esql-rule', type: 'esql', language: 'esql',
  name: 'ESQL Rule', enabled: true, revision: 2, version: 2,
  query: 'FROM logs-* | WHERE event.category == "authentication"', severity: 'medium', risk_score: 47,
};

/** id vs rule_id: the saved-object id changes on reinstall but rule_id (the canonical key) does
 *  not -- the reader must key on rule_id, never the object id. */
export const ELASTIC_OBJECT_RECREATED_STABLE_RULE_ID: ElasticRuleEntry[] = [
  { id: 'so-original-0007', rule_id: 'stable-rule-id-0007', type: 'query', language: 'kuery',
    name: 'Recreated Object Rule', enabled: true, revision: 1, version: 1,
    query: 'event.category:network', index: ['packetbeat-*'], severity: 'low', risk_score: 21 },
  { id: 'so-recreated-0007-v2', rule_id: 'stable-rule-id-0007', type: 'query', language: 'kuery',
    name: 'Recreated Object Rule', enabled: true, revision: 2, version: 2,
    query: 'event.category:network', index: ['packetbeat-*'], severity: 'low', risk_score: 21 },
];

export const ELASTIC_DISABLED_PREBUILT_RULE: ElasticRuleEntry = {
  id: 'so-0008', rule_id: 'elastic-prebuilt-disabled', type: 'query', language: 'kuery',
  name: 'Disabled Prebuilt Rule', enabled: false, revision: 5, version: 5, immutable: true,
  query: 'event.category:malware', index: ['logs-*'], severity: 'critical', risk_score: 99,
};

export const ELASTIC_THRESHOLD_CARDINALITY_RULE: ElasticRuleEntry = {
  id: 'so-0009', rule_id: 'custom-port-scan-threshold', type: 'threshold', language: 'kuery',
  name: 'Possible Port Scan Detected', enabled: false, revision: 1, version: 1,
  query: 'event.category: "network" and event.type: "connection"',
  threshold: { field: ['source.ip'], value: 50, cardinality: [{ field: 'destination.port', value: 25 }] },
  index: ['packetbeat-*', 'logs-endpoint.events.*'], severity: 'medium', risk_score: 47,
};

/** Excluded families -- stay visible with a precise reason, never flattened into a plain query. */
export const ELASTIC_SAVED_QUERY_RULE: ElasticRuleEntry = {
  id: 'so-0010', rule_id: 'custom-saved-query-rule', type: 'saved_query', language: 'kuery',
  name: 'Saved Query Rule', enabled: true, revision: 1, version: 1,
};
export const ELASTIC_ML_RULE: ElasticRuleEntry = {
  id: 'so-0011', rule_id: 'custom-ml-rule', type: 'machine_learning', name: 'ML Anomaly Rule', enabled: true,
};
export const ELASTIC_THREAT_MATCH_RULE: ElasticRuleEntry = {
  id: 'so-0012', rule_id: 'custom-threat-match-rule', type: 'threat_match', name: 'Threat Match Rule', enabled: true,
};
export const ELASTIC_NEW_TERMS_RULE: ElasticRuleEntry = {
  id: 'so-0013', rule_id: 'custom-new-terms-rule', type: 'new_terms', name: 'New Terms Rule', enabled: true,
};

export const ELASTIC_PAGE_1 = { page: 1, perPage: 2, total: 3, data: [ELASTIC_KUERY_RULE, ELASTIC_LUCENE_RULE] };
export const ELASTIC_PAGE_2 = { page: 2, perPage: 2, total: 3, data: [ELASTIC_EQL_RULE] };

/** Empty page with a stale total -- `total` moved down during the scan (or was always wrong);
 *  the reader must stop on the empty page, not loop forever chasing a number that never resolves. */
export const ELASTIC_EMPTY_PAGE_STALE_TOTAL = { page: 3, perPage: 2, total: 99, data: [] };
