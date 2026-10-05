import React from 'react';
import { Select } from '../ui/Select';
import type { IntegrationProvider } from '../../types';

interface Props {
  provider: IntegrationProvider;
  ruleConfig: Record<string, unknown>;
  onChange: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  previewOnly?: boolean;
  packMode?: boolean;
}

/**
 * Provider-specific rule configuration form. Extracted from DeployDetectionModal
 * so both single-rule and pack deploy flows share the same rich UI.
 *
 * For pack deploy, the config applies as a pack-wide default to every detection
 * in the pack.
 */
export const ProviderRuleConfigForm: React.FC<Props> = ({
  provider,
  ruleConfig,
  onChange,
  previewOnly = false,
  packMode = false,
}) => {
  const setRuleConfig = onChange;

  return (
    <>
      {provider === 'splunk' && (
        <div className={`space-y-3 ${previewOnly ? 'opacity-60 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Cron Schedule</label>
              <input
                type="text"
                value={String(ruleConfig.cronSchedule || '')}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setRuleConfig((p) => ({ ...p, cronSchedule: value }));
                }}
                disabled={previewOnly}
                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Earliest Time</label>
              <input
                type="text"
                value={String(ruleConfig.earliestTime || '')}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setRuleConfig((p) => ({ ...p, earliestTime: value }));
                }}
                disabled={previewOnly}
                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Security Domain */}
          <div>
            <Select
              label="Security Domain"
              fullWidth
              value={String(ruleConfig.securityDomain || 'endpoint')}
              onChange={(value) => setRuleConfig((p) => ({ ...p, securityDomain: value }))}
              disabled={previewOnly}
              options={[
                { value: 'endpoint', label: 'Endpoint' },
                { value: 'network', label: 'Network' },
                { value: 'access', label: 'Access' },
                { value: 'threat', label: 'Threat' },
                { value: 'audit', label: 'Audit' },
              ]}
            />
          </div>

          {/* Notable Event checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(ruleConfig.enableNotable as boolean) ?? true}
              onChange={(e) => {
                const value = e.currentTarget.checked;
                setRuleConfig((p) => ({ ...p, enableNotable: value }));
              }}
              className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <span className="text-sm text-on-surface">Create Notable Event</span>
          </label>

          {/* RBA checkbox + risk score */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(ruleConfig.enableRba as boolean) ?? false}
              onChange={(e) => {
                const value = e.currentTarget.checked;
                setRuleConfig((p) => ({ ...p, enableRba: value }));
              }}
              className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <span className="text-sm text-on-surface">Enable Risk-Based Alerting (RBA)</span>
          </label>

          {ruleConfig.enableRba && (
            <div className="grid grid-cols-2 gap-3 ml-6">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Score (0-100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Number(ruleConfig.riskScore || 50)}
                  onChange={(e) => {
                    const value = Number(e.currentTarget.value);
                    setRuleConfig((p) => ({ ...p, riskScore: value }));
                  }}
                  className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Message</label>
                <input
                  type="text"
                  value={String(ruleConfig.riskMessage || '')}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setRuleConfig((p) => ({ ...p, riskMessage: value }));
                  }}
                  placeholder="$name$ triggered on $dest$"
                  className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {provider === 'sentinel' && (
        <div className={`space-y-3 ${previewOnly ? 'opacity-60 pointer-events-none' : ''}`}>
          {/* Rule Type (Scheduled vs NRT) */}
          <div>
            <Select
              label="Rule Type"
              fullWidth
              value={String(ruleConfig.ruleType || 'Scheduled')}
              onChange={(value) => setRuleConfig((p) => ({ ...p, ruleType: value }))}
              disabled={previewOnly}
              options={[
                { value: 'Scheduled', label: 'Scheduled Query Rule' },
                { value: 'NRT', label: 'NRT (Near Real-Time) Rule' },
              ]}
            />
            {ruleConfig.ruleType === 'NRT' && (
              <p className="text-[11px] text-on-surface-variant mt-1">
                NRT rules run every minute automatically. Query frequency, period, and trigger settings are not
                applicable.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Scheduled-only fields */}
            {ruleConfig.ruleType !== 'NRT' && (
              <>
                <div>
                  <Select
                    label="Query Frequency"
                    fullWidth
                    value={String(ruleConfig.queryFrequency || 'PT1H')}
                    onChange={(value) => {
                      const periods: Record<string, string> = {
                        PT5M: 'PT30M',
                        PT10M: 'PT1H',
                        PT1H: 'PT1H',
                        PT12H: 'P1D',
                        P1D: 'P2D',
                      };
                      setRuleConfig((p) => ({ ...p, queryFrequency: value, queryPeriod: periods[value] || value }));
                    }}
                    disabled={previewOnly}
                    options={[
                      { value: 'PT5M', label: 'Every 5 minutes' },
                      { value: 'PT10M', label: 'Every 10 minutes' },
                      { value: 'PT1H', label: 'Every hour' },
                      { value: 'PT12H', label: 'Every 12 hours' },
                      { value: 'P1D', label: 'Daily' },
                    ]}
                  />
                </div>
                <div>
                  <Select
                    label="Trigger Operator"
                    fullWidth
                    value={String(ruleConfig.triggerOperator || 'GreaterThan')}
                    onChange={(value) => setRuleConfig((p) => ({ ...p, triggerOperator: value }))}
                    disabled={previewOnly}
                    options={[
                      { value: 'GreaterThan', label: 'Greater Than' },
                      { value: 'LessThan', label: 'Less Than' },
                      { value: 'Equal', label: 'Equal' },
                      { value: 'NotEqual', label: 'Not Equal' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Trigger Threshold</label>
                  <input
                    type="number"
                    min={0}
                    value={Number(ruleConfig.triggerThreshold ?? 0)}
                    onChange={(e) => {
                      const value = Number(e.currentTarget.value);
                      setRuleConfig((p) => ({ ...p, triggerThreshold: value }));
                    }}
                    className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                  />
                </div>
              </>
            )}

            {/* Common fields for both Scheduled and NRT */}
            <div>
              <Select
                label="Severity"
                fullWidth
                value={String(ruleConfig.severity || (packMode ? '' : 'Medium'))}
                onChange={(value) => setRuleConfig((p) => ({ ...p, severity: value }))}
                disabled={previewOnly}
                options={[
                  ...(packMode ? [{ value: '', label: "Use each detection's severity" }] : []),
                  { value: 'High', label: 'High' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'Low', label: 'Low' },
                  { value: 'Informational', label: 'Informational' },
                ]}
              />
            </div>
            <div>
              <Select
                label="Event Grouping"
                fullWidth
                value={String(ruleConfig.eventGrouping || 'AlertPerResult')}
                onChange={(value) => setRuleConfig((p) => ({ ...p, eventGrouping: value }))}
                disabled={previewOnly}
                options={[
                  { value: 'AlertPerResult', label: 'Alert per result' },
                  { value: 'SingleAlert', label: 'Single alert' },
                ]}
              />
            </div>
          </div>

          {/* Incident & Safety Settings */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={ruleConfig.createIncident !== false}
                onChange={(e) => {
                  const value = e.currentTarget.checked;
                  setRuleConfig((p) => ({ ...p, createIncident: value }));
                }}
                className="rounded border-outline-variant/30"
              />
              Create incidents from alerts
            </label>
            {ruleConfig.createIncident !== false && (
              <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer ml-5">
                <input
                  type="checkbox"
                  checked={ruleConfig.groupAlerts === true}
                  onChange={(e) => {
                    const value = e.currentTarget.checked;
                    setRuleConfig((p) => ({ ...p, groupAlerts: value }));
                  }}
                  className="rounded border-outline-variant/30"
                />
                Group related alerts into incidents
              </label>
            )}
          </div>

          {/* Deploy as Enabled/Disabled — production safety */}
          <div className="p-3 rounded-lg border border-outline-variant/15 bg-surface-container-high/30">
            <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={ruleConfig.enabled === true}
                onChange={(e) => {
                  const value = e.currentTarget.checked;
                  setRuleConfig((p) => ({ ...p, enabled: value }));
                }}
                className="rounded border-outline-variant/30"
              />
              <span className="font-medium">Enable rule immediately after deployment</span>
            </label>
            <p className="text-[11px] text-on-surface-variant mt-1 ml-5">
              {ruleConfig.enabled
                ? 'Rule will start generating alerts immediately. Make sure the query is tested.'
                : 'Rule will be deployed as disabled. You can review and enable it in the Azure portal.'}
            </p>
          </div>
        </div>
      )}

      {provider === 'defender_xdr' && (
        <div className={`grid grid-cols-2 gap-3 ${previewOnly ? 'opacity-60 pointer-events-none' : ''}`}>
          <div>
            <Select
              label="Frequency"
              fullWidth
              value={String(ruleConfig.frequency || '24H')}
              onChange={(value) => setRuleConfig((p) => ({ ...p, frequency: value }))}
              disabled={previewOnly}
              options={[
                { value: '0', label: 'Continuous (NRT)' },
                { value: '1H', label: 'Every hour' },
                { value: '3H', label: 'Every 3 hours' },
                { value: '12H', label: 'Every 12 hours' },
                { value: '24H', label: 'Daily' },
              ]}
            />
          </div>
          <div>
            <Select
              label="Severity"
              fullWidth
              value={String(ruleConfig.severity || (packMode ? '' : 'Medium'))}
              onChange={(value) => setRuleConfig((p) => ({ ...p, severity: value }))}
              disabled={previewOnly}
              options={[
                ...(packMode ? [{ value: '', label: "Use each detection's severity" }] : []),
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' },
                { value: 'Informational', label: 'Informational' },
              ]}
            />
          </div>
          <div className="col-span-2">
            {packMode ? (
              <div className="rounded-lg border border-outline-variant/30 bg-surface-container p-3">
                <div className="text-xs font-medium text-on-surface">Alert Category</div>
                <p className="mt-1 text-sm text-on-surface">From each detection's MITRE tactics</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Uses the first supported tactic. Falls back to Suspicious Activity when none is mapped.
                </p>
              </div>
            ) : (
              <Select
                label="Alert Category"
                fullWidth
                value={String(ruleConfig.category || 'SuspiciousActivity')}
                onChange={(value) => setRuleConfig((p) => ({ ...p, category: value }))}
                disabled={previewOnly}
                options={[
                  { value: 'SuspiciousActivity', label: 'Suspicious Activity' },
                  { value: 'Execution', label: 'Execution' },
                  { value: 'InitialAccess', label: 'Initial Access' },
                  { value: 'Persistence', label: 'Persistence' },
                  { value: 'PrivilegeEscalation', label: 'Privilege Escalation' },
                  { value: 'DefenseEvasion', label: 'Defense Evasion' },
                  { value: 'CredentialAccess', label: 'Credential Access' },
                  { value: 'Discovery', label: 'Discovery' },
                  { value: 'LateralMovement', label: 'Lateral Movement' },
                  { value: 'Collection', label: 'Collection' },
                  { value: 'CommandAndControl', label: 'Command and Control' },
                  { value: 'Exfiltration', label: 'Exfiltration' },
                  { value: 'Impact', label: 'Impact' },
                  { value: 'Ransomware', label: 'Ransomware' },
                  { value: 'Malware', label: 'Malware' },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {provider === 'elastic' && (
        <div className={`grid grid-cols-2 gap-3 ${previewOnly ? 'opacity-60 pointer-events-none' : ''}`}>
          <div>
            <Select
              label="Rule Type"
              fullWidth
              value={packMode ? 'auto' : String(ruleConfig.type || 'query')}
              disabled={previewOnly || packMode}
              onChange={(value) =>
                setRuleConfig((p) => ({
                  ...p,
                  type: value,
                  language: value === 'eql' ? 'eql' : value === 'esql' ? 'esql' : 'lucene',
                }))
              }
              options={[
                ...(packMode ? [{ value: 'auto', label: "From each detection's query" }] : []),
                { value: 'query', label: 'Query (Lucene)' },
                { value: 'eql', label: 'EQL' },
                { value: 'esql', label: 'ES|QL' },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Score (0-100)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={Number(ruleConfig.riskScore || 50)}
              onChange={(e) => {
                const value = Number(e.currentTarget.value);
                setRuleConfig((p) => ({ ...p, riskScore: value }));
              }}
              className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
            />
          </div>
        </div>
      )}

      {provider === 'crowdstrike' && (
        <div className={`space-y-3 ${previewOnly ? 'opacity-60 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Select
                label="Severity"
                fullWidth
                value={String(ruleConfig.severity ?? (packMode ? '' : 50))}
                onChange={(value) => setRuleConfig((p) => ({ ...p, severity: value ? Number(value) : undefined }))}
                disabled={previewOnly}
                options={[
                  ...(packMode ? [{ value: '', label: "Use each detection's severity" }] : []),
                  { value: '10', label: 'Informational (10)' },
                  { value: '30', label: 'Low (30)' },
                  { value: '50', label: 'Medium (50)' },
                  { value: '70', label: 'High (70)' },
                  { value: '90', label: 'Critical (90)' },
                ]}
              />
            </div>
            <div>
              <Select
                label="Outcome"
                fullWidth
                value={String(ruleConfig.outcome || 'detection')}
                onChange={(value) => setRuleConfig((p) => ({ ...p, outcome: value }))}
                disabled={previewOnly}
                options={[
                  { value: 'detection', label: 'Detection' },
                  { value: 'incident', label: 'Incident' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Search Window (Lookback)</label>
              <input
                type="text"
                value={String(ruleConfig.lookback || '1h0m')}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setRuleConfig((p) => ({ ...p, lookback: value }));
                }}
                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
              />
              <p className="text-[10px] text-on-surface-variant mt-0.5">e.g. "1h0m", "5h0m", "75m"</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Schedule Frequency</label>
              <input
                type="text"
                value={String(ruleConfig.schedule || '@every 1h0m')}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setRuleConfig((p) => ({ ...p, schedule: value }));
                }}
                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
              />
              <p className="text-[10px] text-on-surface-variant mt-0.5">e.g. "@every 1h0m" (min "@every 0h5m")</p>
            </div>
          </div>

          <div>
            <Select
              label="Trigger Mode"
              fullWidth
              value={String(ruleConfig.triggerMode || 'summary')}
              onChange={(value) => setRuleConfig((p) => ({ ...p, triggerMode: value }))}
              disabled={previewOnly}
              options={[
                { value: 'summary', label: 'Summary' },
                { value: 'verbose', label: 'Verbose' },
              ]}
            />
            <p className="text-[10px] text-on-surface-variant mt-0.5">
              Verbose creates 1 detection per result (50 limit). Summary creates a single detection.
            </p>
          </div>

          {/* Deploy as Active/Inactive — production safety */}
          <div className="p-3 rounded-lg border border-outline-variant/15 bg-surface-container-high/30">
            <Select
              label="Initial Status"
              fullWidth
              value={String(ruleConfig.status || 'inactive')}
              onChange={(value) => setRuleConfig((p) => ({ ...p, status: value }))}
              disabled={previewOnly}
              options={[
                { value: 'inactive', label: 'Inactive (recommended)' },
                { value: 'active', label: 'Active' },
              ]}
            />
            <p className="text-[11px] text-on-surface-variant mt-1">
              {ruleConfig.status === 'active'
                ? 'Rule will start running immediately. Make sure the CQL query is tested.'
                : 'Rule will be deployed as inactive. You can review and activate it in the Falcon console.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
};
