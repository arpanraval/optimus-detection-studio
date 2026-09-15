// CONSTRUCTED FROM DOCS — not captured from a live tenant. Source:
// https://learn.microsoft.com/en-us/rest/api/securityinsights/alert-rules/list?view=rest-securityinsights-2025-06-01
// https://learn.microsoft.com/en-us/azure/sentinel/near-real-time-rules
import type { SentinelRuleEntry } from '../../siem-readers/sentinel.ts';

const GUID_A = '11111111-2222-3333-4444-555555555555';
const GUID_B = '66666666-7777-8888-9999-000000000000';

function armId(workspace: string, guid: string): string {
  return `/subscriptions/sub-1/resourceGroups/rg-1/providers/Microsoft.OperationalInsights/` +
    `workspaces/${workspace}/providers/Microsoft.SecurityInsights/alertRules/${guid}`;
}

/** Same GUID in two different workspaces -- these are different rules and must not collide. */
export const SENTINEL_SAME_GUID_TWO_WORKSPACES: SentinelRuleEntry[] = [
  {
    id: armId('workspace-a', GUID_A), name: GUID_A, kind: 'Scheduled',
    properties: {
      displayName: 'Excessive Failed Logins', description: 'Detects brute force attempts',
      severity: 'Medium', enabled: true, query: 'SigninLogs | where ResultType != 0',
      queryFrequency: 'PT5M', queryPeriod: 'PT1H', triggerOperator: 'GreaterThan', triggerThreshold: 10,
      tactics: ['CredentialAccess'], techniques: ['T1110'],
    },
  },
  {
    id: armId('workspace-b', GUID_A), name: GUID_A, kind: 'Scheduled',
    properties: {
      displayName: 'Different Rule, Same GUID', description: 'Unrelated workspace copy',
      severity: 'Low', enabled: true, query: 'SigninLogs | where ResultType == 50053',
      queryFrequency: 'PT15M', queryPeriod: 'PT1H', triggerOperator: 'GreaterThan', triggerThreshold: 5,
    },
  },
];

export const SENTINEL_SCHEDULED_RULE: SentinelRuleEntry = {
  id: armId('workspace-a', GUID_B), name: GUID_B, kind: 'Scheduled',
  properties: {
    displayName: 'Suspicious PowerShell', description: 'Encoded command execution',
    severity: 'High', enabled: true, query: 'DeviceProcessEvents | where ProcessCommandLine has "-enc"',
    queryFrequency: 'PT5M', queryPeriod: 'PT1H', triggerOperator: 'GreaterThan', triggerThreshold: 0,
    tactics: ['Execution'], techniques: ['T1059.001'],
    entityMappings: [{ entityType: 'Host', fieldMappings: [{ identifier: 'HostName', columnName: 'DeviceName' }] }],
    suppressionEnabled: false, alertRuleTemplateName: 'template-123', templateVersion: '1.0.0',
  },
};

/** NRT: no queryFrequency/queryPeriod/trigger* -- must not have Scheduled defaults injected. */
export const SENTINEL_NRT_RULE: SentinelRuleEntry = {
  id: armId('workspace-a', '99999999-aaaa-bbbb-cccc-dddddddddddd'),
  name: '99999999-aaaa-bbbb-cccc-dddddddddddd', kind: 'NRT',
  properties: {
    displayName: 'Near Real-Time Impossible Travel', description: 'NRT alert', severity: 'Medium',
    enabled: true, query: 'SigninLogs | where isnotempty(Location)',
    tactics: ['InitialAccess'],
    // Deliberately includes one field outside the documented shared set, since the full
    // NrtAlertRule schema is unsettled -- the reader must surface it as unmapped, not drop it
    // silently or crash.
    someUndocumentedNrtField: 'value-not-in-any-fetched-schema',
  },
};

/** A non-query kind (Fusion) that must stay visible with a precise unsupported reason. */
export const SENTINEL_FUSION_RULE: SentinelRuleEntry = {
  id: armId('workspace-a', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  name: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', kind: 'Fusion',
  properties: { displayName: 'Advanced Multistage Attack Detection', enabled: true },
};

/** A disabled Scheduled rule. */
export const SENTINEL_DISABLED_RULE: SentinelRuleEntry = {
  id: armId('workspace-a', 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'),
  name: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', kind: 'Scheduled',
  properties: {
    displayName: 'Retired Detection', enabled: false, query: 'AuditLogs | take 1',
    queryFrequency: 'PT1H', queryPeriod: 'P1D', triggerOperator: 'GreaterThan', triggerThreshold: 1,
  },
};

/** Two pages, for nextLink-following tests. */
export const SENTINEL_PAGE_1 = { value: [SENTINEL_SCHEDULED_RULE, SENTINEL_NRT_RULE],
  nextLink: 'https://management.azure.com/subscriptions/sub-1/.../alertRules?api-version=2025-06-01&$skiptoken=page2' };
export const SENTINEL_PAGE_2 = { value: [SENTINEL_FUSION_RULE, SENTINEL_DISABLED_RULE], nextLink: null };
