import type { IntegrationProvider } from '../types';

/**
 * Per-provider default rule configuration. Used by both single-rule deploy
 * (DeployDetectionModal) and pack deploy (PackDeployPickerModal) via the
 * shared ProviderRuleConfigForm component.
 */
export function getDefaultRuleConfig(provider: IntegrationProvider): Record<string, unknown> {
  switch (provider) {
    case 'splunk':
      return {
        cronSchedule: '*/5 * * * *',
        earliestTime: '-5m@m',
        latestTime: 'now',
        alertActions: ['notable'],
        securityDomain: 'endpoint',
        enableNotable: true,
        enableRba: false,
        riskScore: 50,
        riskMessage: '',
        drilldownSearch: '',
      };
    case 'sentinel':
      return {
        ruleType: 'Scheduled',
        queryFrequency: 'PT1H',
        queryPeriod: 'PT1H',
        triggerOperator: 'GreaterThan',
        triggerThreshold: 0,
        severity: 'Medium',
        suppressionDuration: 'PT1H',
        suppressionEnabled: false,
        eventGrouping: 'AlertPerResult',
        createIncident: true,
        groupAlerts: false,
        enabled: false,
        tactics: [],
        techniques: [],
      };
    case 'defender_xdr':
      return { frequency: '24H', severity: 'Medium', category: 'SuspiciousActivity' };
    case 'elastic':
      return {
        type: 'query',
        language: 'lucene',
        index: ['logs-*', 'filebeat-*', 'winlogbeat-*'],
        riskScore: 50,
        interval: '5m',
        from: 'now-6m',
        maxSignals: 100,
        tags: ['Optimus'],
      };
    case 'crowdstrike':
      return {
        severity: 50,
        outcome: 'detection',
        lookback: '1h0m',
        schedule: '@every 1h0m',
        triggerMode: 'summary',
        status: 'inactive',
      };
    default:
      return {};
  }
}
