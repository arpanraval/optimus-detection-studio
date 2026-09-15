// CONSTRUCTED FROM DOCS + one real tenant response shape — not captured live.
// Source: https://learn.microsoft.com/en-us/graph/api/resources/security-detectionrule?view=graph-rest-beta
//         https://learn.microsoft.com/en-us/graph/api/resources/security-ruleschedule?view=graph-rest-beta
//
// Field shapes below (`isEnabled`, `schedule.period`, `status`,
// `schedule.frequency`, `detectorId`, `lastRunDetails`) come from Microsoft's
// property tables (doc-dated 2026-05-25), which mark `isEnabled` and
// `schedule.period` deprecated with removal on 2026-10-01. The
// `detectionAction.organizationalScope` / `detectionAction.responseActions`
// shape is NOT in that doc page (which only documents `automatedActions`) --
// it is carried over from `deployment_history.response`, three successful
// rows recorded against the user's real tenant on 2026-02-12. That is
// historical stored data, not a live probe, and it shows the tenant was
// served ONLY the deprecated shape (isEnabled/schedule.period/detectorId
// present; status/schedule.frequency absent).
//
// This is the shape produced by `defenderXdrListRules`
// (supabase/functions/integration-ops/index.ts) after it renames
// id/displayName/queryCondition.queryText and passes the rest of the Graph
// rule through unchanged -- i.e. exactly what reaches
// `normalizeVendorRule`'s `defender_xdr` branch as `raw`.

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
