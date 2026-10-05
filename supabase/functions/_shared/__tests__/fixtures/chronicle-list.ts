// CONSTRUCTED FROM DOCS — not captured from a live tenant. Source (execution/alerting/archived
// separation concept; this codebase's connector targets the already-configured legacy shape --
// see the header comment in siem-readers/chronicle.ts):
// https://docs.cloud.google.com/chronicle/docs/reference/rest/v1/projects.locations.instances.rules
// https://docs.cloud.google.com/chronicle/docs/reference/rest/v1/projects.locations.instances.rules/getDeployment
import type { ChronicleRuleEntry } from '../../siem-readers/chronicle.ts';

const RULE_PATH = (id: string) => `projects/proj-1/locations/us/instances/inst-1/rules/${id}`;

export const CHRONICLE_RULE_LIVE_AND_ALERTING: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0001'), ruleName: 'Suspicious Outbound Beaconing', versionId: 'v1',
  revisionCreateTime: '2026-01-01T00:00:00Z', compilationState: 'SUCCEEDED',
  ruleText: 'rule suspicious_beaconing { meta: severity = "HIGH" condition: $e }',
  metadata: { description: 'Detects periodic C2 beaconing', severity: 'HIGH' },
  liveRuleEnabled: true, alertingEnabled: true, archived: false,
};

/** Revision id changes under a stable rule identity -- name segment stays the same. */
export const CHRONICLE_RULE_REVISION_2: ChronicleRuleEntry = {
  ...CHRONICLE_RULE_LIVE_AND_ALERTING, versionId: 'v2', revisionCreateTime: '2026-02-01T00:00:00Z',
  ruleText: 'rule suspicious_beaconing { meta: severity = "HIGH" condition: $e and $f }',
};

/** Source present but execution disabled. */
export const CHRONICLE_RULE_SOURCE_PRESENT_DISABLED: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0002'), ruleName: 'Disabled Detection', versionId: 'v1',
  ruleText: 'rule disabled_detection { meta: severity = "LOW" condition: $e }',
  metadata: { description: 'Kept for reference, not live', severity: 'LOW' },
  liveRuleEnabled: false, alertingEnabled: false, archived: false,
};

/** Live execution without alerting -- execution and alerting are independent observations. */
export const CHRONICLE_RULE_LIVE_NO_ALERTING: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0003'), ruleName: 'Silent Live Rule', versionId: 'v1',
  ruleText: 'rule silent_live { meta: severity = "MEDIUM" condition: $e }',
  metadata: { severity: 'MEDIUM' }, liveRuleEnabled: true, alertingEnabled: false, archived: false,
};

/** Unknown deployment state -- no execution/alerting/archived signal on the list entry at all.
 *  Must resolve to 'unknown' for each, never defaulted to disabled/false. */
export const CHRONICLE_RULE_UNKNOWN_DEPLOYMENT: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0004'), ruleName: 'Unknown Deployment Rule', versionId: 'v1',
  ruleText: 'rule unknown_deployment { meta: severity = "LOW" condition: $e }',
  metadata: { severity: 'LOW' },
};

/** Parse/compile error -- still identifiable, source still present, but flagged. */
export const CHRONICLE_RULE_COMPILE_ERROR: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0005'), ruleName: 'Broken Rule', versionId: 'v1',
  ruleText: 'rule broken { meta: severity = "LOW" condition: $undefined_reference }',
  compilationState: 'FAILED', compilationError: 'undefined reference: $undefined_reference',
  metadata: { severity: 'LOW' }, liveRuleEnabled: false, alertingEnabled: false, archived: false,
};

/** Referenced list unavailable -- surfaced via an unmapped field rather than crashing. */
export const CHRONICLE_RULE_REFERENCED_LIST_UNAVAILABLE: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0006'), ruleName: 'Uses Missing Reference List', versionId: 'v1',
  ruleText: 'rule uses_list { meta: severity = "LOW" condition: $e and $ip in %missing_list }',
  metadata: { severity: 'LOW' }, liveRuleEnabled: true, alertingEnabled: true, archived: false,
  referenceListUnavailable: true,
};

/** Curated/managed content with unavailable source text -- must stay unsupported, never
 *  fabricated as an editable detection with an empty query. */
export const CHRONICLE_RULE_CURATED_NO_TEXT: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0007'), ruleName: 'Curated Detection (managed)', versionId: 'v1',
  metadata: { description: 'Google-managed curated rule', severity: 'MEDIUM' },
  liveRuleEnabled: true, alertingEnabled: true, archived: false,
  // Deliberately no ruleText -- matches the BASIC-view/curated case where source is not returned.
};

export const CHRONICLE_RULE_ARCHIVED: ChronicleRuleEntry = {
  name: RULE_PATH('ru_0008'), ruleName: 'Archived Rule', versionId: 'v1',
  ruleText: 'rule archived_rule { meta: severity = "LOW" condition: $e }',
  metadata: { severity: 'LOW' }, liveRuleEnabled: false, alertingEnabled: false, archived: true,
};

export const CHRONICLE_PAGE_1 = {
  rules: [CHRONICLE_RULE_LIVE_AND_ALERTING, CHRONICLE_RULE_SOURCE_PRESENT_DISABLED],
  nextPageToken: 'page-2-token',
};
export const CHRONICLE_PAGE_2 = {
  rules: [CHRONICLE_RULE_LIVE_NO_ALERTING],
  nextPageToken: null,
};
