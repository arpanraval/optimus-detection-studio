// CONSTRUCTED FROM DOCS — not captured from a live tenant. Source:
// https://learn.microsoft.com/en-us/graph/api/security-rulesroot-list-detectionrules?view=graph-rest-beta
import type { DefenderRuleEntry } from '../../siem-readers/defender-xdr.ts';

// -----------------------------------------------------------------------------------------------
// Pre-existing fixtures (legacyShapeRule / currentShapeRule / noStateShapeRule /
// continuousLegacyShapeRule) consumed by src/lib/__tests__/defenderXdrRuleFields.test.ts, which
// pins normalizeVendorRule's dual-read contract. CONSTRUCTED FROM DOCS + one real tenant response
// shape (see original provenance note this batch preserves verbatim): the
// `detectionAction.organizationalScope` / `detectionAction.responseActions` shape is carried over
// from `deployment_history.response`, three successful rows recorded against the user's real
// tenant on 2026-02-12 -- historical stored data, not a live probe.
//
// This is the shape produced by `defenderXdrListRules` (integration-ops/index.ts) after it renames
// id/displayName/queryCondition.queryText and passes the rest of the Graph rule through unchanged
// -- i.e. exactly what reaches `normalizeVendorRule`'s `defender_xdr` branch as `raw`. Kept
// unmodified per "append corrections, never rewrite" -- this batch adds reader-level fixtures below
// rather than replacing these.

/** A rule from a tenant still served only the deprecated shape. */
export const legacyShapeRule = {
  id: 'legacy-rule-1',
  name: 'Suspicious PowerShell Encoded Command',
  query: 'DeviceProcessEvents | where ProcessCommandLine has "-enc"',
  isEnabled: false,
  schedule: { period: '24H' },
  detectorId: 'detector-legacy-1',
  description: 'Flags encoded PowerShell execution consistent with obfuscated payload delivery.',
  detectionAction: {
    alertTemplate: {
      title: 'Suspicious PowerShell Encoded Command',
      severity: 'medium',
      category: 'Execution',
      description: 'Flags encoded PowerShell execution consistent with obfuscated payload delivery.',
      impactedAssets: [],
      recommendedActions: ['Isolate the device', 'Review the parent process'],
      mitreTechniques: ['T1204'],
    },
    organizationalScope: { deviceGroups: ['all'] },
    responseActions: [{ action: 'isolateDevice' }],
  },
}

/** A rule from a tenant already served the current shape, disabled by Microsoft (not a human). */
export const currentShapeRule = {
  id: 'current-rule-1',
  name: 'Impossible Travel Sign-in',
  query: 'SigninLogs | where isnotempty(Location)',
  status: 'autoDisabled',
  schedule: { frequency: 'PT1H' },
  detectionAction: {
    alertTemplate: {
      title: 'Impossible Travel Sign-in',
      severity: 'high',
      category: 'InitialAccess',
      description: 'Flags sign-ins from geographically implausible locations in a short window.',
      impactedAssets: [],
      recommendedActions: ['Force password reset', 'Require re-authentication with MFA'],
      mitreTechniques: ['T1078'],
    },
    automatedActions: [{ action: 'requireMfa' }],
  },
}

/** A rule carrying neither the current nor the deprecated state field. */
export const noStateShapeRule = {
  id: 'no-state-rule-1',
  name: 'Rule With No Reported State',
  query: 'DeviceEvents | take 1',
  schedule: {},
  detectionAction: {
    alertTemplate: {
      title: 'Rule With No Reported State',
      severity: 'low',
      category: 'Discovery',
      mitreTechniques: [],
    },
  },
}

/** A continuous-schedule rule under the deprecated shape (`period === '0'`). */
export const continuousLegacyShapeRule = {
  id: 'legacy-rule-continuous-1',
  name: 'Continuous Credential Dumping Watch',
  query: 'DeviceProcessEvents | where FileName =~ "procdump.exe"',
  isEnabled: true,
  schedule: { period: '0' },
  detectionAction: {
    alertTemplate: {
      title: 'Continuous Credential Dumping Watch',
      severity: 'high',
      category: 'CredentialAccess',
      mitreTechniques: ['T1003'],
    },
    organizationalScope: { deviceGroups: ['all'] },
    responseActions: [],
  },
}

// -----------------------------------------------------------------------------------------------
// Batch-4 reader fixtures (siem-readers-defender-xdr.test.ts) -- the DefenderRuleEntry shape
// consumed directly by siem-readers/defender-xdr.ts's normalizer/pager, distinct from the fixtures
// above which exercise normalizeVendorRule instead.

export const DEFENDER_RULE_STATUS_ONLY: DefenderRuleEntry = {
  id: 'dr-0001', displayName: 'Suspicious PowerShell Download', description: 'Encoded download cradle',
  status: 'enabled', schedule: { frequency: 'PT1H' },
  queryCondition: { queryText: 'DeviceProcessEvents | where ProcessCommandLine has "DownloadString"' },
  detectionAction: {
    alertTemplate: {
      title: 'Suspicious PowerShell Download', description: 'Encoded download cradle', severity: 'high',
      category: 'Execution', tactics: [{ tactic: 'Execution', techniques: [{ technique: 'T1059.001' }] }],
      mitreTechniques: ['T1059.001'],
    },
    automatedActions: { isolateDevices: [{ deviceIdColumn: 'DeviceId', isolationType: 'full' }] },
  },
};

export const DEFENDER_RULE_DEPRECATED_ONLY: DefenderRuleEntry = {
  id: 'dr-0002', displayName: 'Legacy Shape Rule', description: 'Still on the deprecated fields',
  isEnabled: true, schedule: { period: '24H' },
  queryCondition: { queryText: 'DeviceEvents | where ActionType == "AntivirusDetection"' },
  detectorId: 'legacy-detector-123',
};

export const DEFENDER_RULE_AUTO_DISABLED: DefenderRuleEntry = {
  id: 'dr-0003', displayName: 'Auto-Disabled Rule', status: 'autoDisabled', schedule: { frequency: 'PT12H' },
  queryCondition: { queryText: 'DeviceNetworkEvents | where RemoteUrl has "malicious.example"' },
};

export const DEFENDER_RULE_UNKNOWN_FUTURE_VALUE: DefenderRuleEntry = {
  id: 'dr-0004', displayName: 'Unknown Enum Rule', status: 'unknownFutureValue', schedule: { frequency: 'PT1H' },
  queryCondition: { queryText: 'DeviceFileEvents | where FileName endswith ".ps1"' },
};

/** Continuous rule -- period === '0' must be preserved as continuous, never a fake interval. */
export const DEFENDER_RULE_CONTINUOUS: DefenderRuleEntry = {
  id: 'dr-0005', displayName: 'Continuous Rule', isEnabled: true, schedule: { period: '0' },
  queryCondition: { queryText: 'DeviceProcessEvents | where FileName == "mimikatz.exe"' },
};

/** Absent description, and an unknown/undocumented action field preserved rather than dropped. */
export const DEFENDER_RULE_NO_DESCRIPTION_UNKNOWN_FIELD: DefenderRuleEntry = {
  id: 'dr-0006', displayName: 'No Description Rule', status: 'enabled', schedule: { frequency: 'PT6H' },
  queryCondition: { queryText: 'DeviceLogonEvents | where LogonType == "RemoteInteractive"' },
  organizationalScope: { scopeType: 'deviceGroups', groups: ['group-1'] },
};

/** Same displayName in two different tenants -- id is the only trustworthy identity. */
export const DEFENDER_RULE_TENANT_A: DefenderRuleEntry = {
  id: 'dr-tenant-a-0007', displayName: 'Duplicate Name Rule', status: 'enabled', schedule: { frequency: 'PT1H' },
  queryCondition: { queryText: 'DeviceProcessEvents | where ProcessCommandLine has "-enc"' },
};
export const DEFENDER_RULE_TENANT_B: DefenderRuleEntry = {
  id: 'dr-tenant-b-0007', displayName: 'Duplicate Name Rule', status: 'disabled', schedule: { frequency: 'PT3H' },
  queryCondition: { queryText: 'DeviceProcessEvents | where ProcessCommandLine has "-encodedcommand"' },
};

/** MITRE mapping ONLY via the current documented shape (`tactics[].techniques[].technique`) --
 *  no `mitreTechniques` field on this alertTemplate at all. */
export const DEFENDER_RULE_MITRE_TACTICS_ONLY: DefenderRuleEntry = {
  id: 'dr-0007', displayName: 'Documented Tactics Shape Rule', status: 'enabled', schedule: { frequency: 'PT3H' },
  queryCondition: { queryText: 'DeviceRegistryEvents | where RegistryKey has "Run"' },
  detectionAction: {
    alertTemplate: {
      title: 'Documented Tactics Shape Rule', severity: 'medium', category: 'Persistence',
      tactics: [
        { tactic: 'Persistence', techniques: [{ technique: 'T1547.001' }] },
        { tactic: 'DefenseEvasion', techniques: [{ technique: 'T1112' }, { technique: 'T1564' }] },
      ],
    },
  },
};

/** MITRE mapping ONLY via the observed tenant shape (`alertTemplate.mitreTechniques`) -- no
 *  `tactics` field on this alertTemplate at all. */
export const DEFENDER_RULE_MITRE_FIELD_ONLY: DefenderRuleEntry = {
  id: 'dr-0008', displayName: 'Observed Tenant Shape Rule', status: 'enabled', schedule: { frequency: 'PT1H' },
  queryCondition: { queryText: 'DeviceNetworkEvents | where RemotePort == 4444' },
  detectionAction: {
    alertTemplate: {
      title: 'Observed Tenant Shape Rule', severity: 'high', category: 'CommandAndControl',
      mitreTechniques: ['T1105', 'T1566'],
    },
  },
};

/** Neither MITRE shape present -- must yield an absent mapping, never a fabricated one. */
export const DEFENDER_RULE_MITRE_NONE: DefenderRuleEntry = {
  id: 'dr-0009', displayName: 'No MITRE Mapping Rule', status: 'enabled', schedule: { frequency: 'PT6H' },
  queryCondition: { queryText: 'DeviceFileEvents | where FileName endswith ".dll"' },
  detectionAction: {
    alertTemplate: { title: 'No MITRE Mapping Rule', severity: 'low', category: 'Discovery' },
  },
};

export const DEFENDER_PAGE_1 = {
  value: [DEFENDER_RULE_STATUS_ONLY, DEFENDER_RULE_DEPRECATED_ONLY],
  '@odata.nextLink': 'https://graph.microsoft.com/beta/security/rules/detectionRules?$skiptoken=page2',
};
export const DEFENDER_PAGE_2 = {
  value: [DEFENDER_RULE_AUTO_DISABLED],
  '@odata.nextLink': null,
};
