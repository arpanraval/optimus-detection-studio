import React from 'react';
import type { IntegrationProvider } from '../../types';

interface Props {
  provider: IntegrationProvider;
  ruleConfig: Record<string, unknown>;
  onChange: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  previewOnly?: boolean;
}

/**
 * Provider-specific rule configuration form. Extracted from DeployDetectionModal
 * so both single-rule and pack deploy flows share the same rich UI.
 *
 * For pack deploy, the config applies as a pack-wide default to every detection
 * in the pack.
 */
export const ProviderRuleConfigForm: React.FC<Props> = ({ provider, ruleConfig, onChange, previewOnly = false }) => {
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
                            onChange={e => setRuleConfig(p => ({ ...p, cronSchedule: e.target.value }))}
                            disabled={previewOnly}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Earliest Time</label>
                          <input
                            type="text"
                            value={String(ruleConfig.earliestTime || '')}
                            onChange={e => setRuleConfig(p => ({ ...p, earliestTime: e.target.value }))}
                            disabled={previewOnly}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 disabled:opacity-50"
                          />
                        </div>
                      </div>

                      {/* Security Domain */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Security Domain</label>
                        <select
                          value={String(ruleConfig.securityDomain || 'endpoint')}
                          onChange={e => setRuleConfig(p => ({ ...p, securityDomain: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="endpoint">Endpoint</option>
                          <option value="network">Network</option>
                          <option value="access">Access</option>
                          <option value="threat">Threat</option>
                          <option value="audit">Audit</option>
                        </select>
                      </div>

                      {/* Notable Event checkbox */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleConfig.enableNotable as boolean ?? true}
                          onChange={e => setRuleConfig(p => ({ ...p, enableNotable: e.target.checked }))}
                          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-on-surface">Create Notable Event</span>
                      </label>

                      {/* RBA checkbox + risk score */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleConfig.enableRba as boolean ?? false}
                          onChange={e => setRuleConfig(p => ({ ...p, enableRba: e.target.checked }))}
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
                              onChange={e => setRuleConfig(p => ({ ...p, riskScore: Number(e.target.value) }))}
                              className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Message</label>
                            <input
                              type="text"
                              value={String(ruleConfig.riskMessage || '')}
                              onChange={e => setRuleConfig(p => ({ ...p, riskMessage: e.target.value }))}
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
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Rule Type</label>
                        <select
                          value={String(ruleConfig.ruleType || 'Scheduled')}
                          onChange={e => setRuleConfig(p => ({ ...p, ruleType: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="Scheduled">Scheduled Query Rule</option>
                          <option value="NRT">NRT (Near Real-Time) Rule</option>
                        </select>
                        {ruleConfig.ruleType === 'NRT' && (
                          <p className="text-[11px] text-on-surface-variant/60 mt-1">
                            NRT rules run every minute automatically. Query frequency, period, and trigger settings are not applicable.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Scheduled-only fields */}
                        {ruleConfig.ruleType !== 'NRT' && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1">Query Frequency</label>
                              <select
                                value={String(ruleConfig.queryFrequency || 'PT1H')}
                                onChange={e => {
                                  // queryPeriod must be >= queryFrequency; auto-sync when frequency changes
                                  const periodMap: Record<string, string> = { 'PT5M': 'PT30M', 'PT10M': 'PT1H', 'PT1H': 'PT1H', 'PT12H': 'P1D', 'P1D': 'P2D' };
                                  setRuleConfig(p => ({ ...p, queryFrequency: e.target.value, queryPeriod: periodMap[e.target.value] || e.target.value }));
                                }}
                                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                              >
                                <option value="PT5M">Every 5 minutes</option>
                                <option value="PT10M">Every 10 minutes</option>
                                <option value="PT1H">Every hour</option>
                                <option value="PT12H">Every 12 hours</option>
                                <option value="P1D">Daily</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1">Trigger Operator</label>
                              <select
                                value={String(ruleConfig.triggerOperator || 'GreaterThan')}
                                onChange={e => setRuleConfig(p => ({ ...p, triggerOperator: e.target.value }))}
                                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                              >
                                <option value="GreaterThan">Greater Than</option>
                                <option value="LessThan">Less Than</option>
                                <option value="Equal">Equal</option>
                                <option value="NotEqual">Not Equal</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1">Trigger Threshold</label>
                              <input
                                type="number"
                                min={0}
                                value={Number(ruleConfig.triggerThreshold ?? 0)}
                                onChange={e => setRuleConfig(p => ({ ...p, triggerThreshold: Number(e.target.value) }))}
                                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                              />
                            </div>
                          </>
                        )}

                        {/* Common fields for both Scheduled and NRT */}
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Severity</label>
                          <select
                            value={String(ruleConfig.severity || 'Medium')}
                            onChange={e => setRuleConfig(p => ({ ...p, severity: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                            <option value="Informational">Informational</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Event Grouping</label>
                          <select
                            value={String(ruleConfig.eventGrouping || 'AlertPerResult')}
                            onChange={e => setRuleConfig(p => ({ ...p, eventGrouping: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="AlertPerResult">Alert per result</option>
                            <option value="SingleAlert">Single alert</option>
                          </select>
                        </div>
                      </div>

                      {/* Incident & Safety Settings */}
                      <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ruleConfig.createIncident !== false}
                            onChange={e => setRuleConfig(p => ({ ...p, createIncident: e.target.checked }))}
                            className="rounded border-outline-variant/30"
                          />
                          Create incidents from alerts
                        </label>
                        {ruleConfig.createIncident !== false && (
                          <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer ml-5">
                            <input
                              type="checkbox"
                              checked={ruleConfig.groupAlerts === true}
                              onChange={e => setRuleConfig(p => ({ ...p, groupAlerts: e.target.checked }))}
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
                            onChange={e => setRuleConfig(p => ({ ...p, enabled: e.target.checked }))}
                            className="rounded border-outline-variant/30"
                          />
                          <span className="font-medium">Enable rule immediately after deployment</span>
                        </label>
                        <p className="text-[11px] text-on-surface-variant/60 mt-1 ml-5">
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
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Frequency</label>
                        <select
                          value={String(ruleConfig.frequency || '24H')}
                          onChange={e => setRuleConfig(p => ({ ...p, frequency: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="0">Continuous (NRT)</option>
                          <option value="1H">Every hour</option>
                          <option value="3H">Every 3 hours</option>
                          <option value="12H">Every 12 hours</option>
                          <option value="24H">Daily</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Severity</label>
                        <select
                          value={String(ruleConfig.severity || 'Medium')}
                          onChange={e => setRuleConfig(p => ({ ...p, severity: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                          <option value="Informational">Informational</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Alert Category</label>
                        <select
                          value={String(ruleConfig.category || 'SuspiciousActivity')}
                          onChange={e => setRuleConfig(p => ({ ...p, category: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="SuspiciousActivity">Suspicious Activity</option>
                          <option value="Execution">Execution</option>
                          <option value="InitialAccess">Initial Access</option>
                          <option value="Persistence">Persistence</option>
                          <option value="PrivilegeEscalation">Privilege Escalation</option>
                          <option value="DefenseEvasion">Defense Evasion</option>
                          <option value="CredentialAccess">Credential Access</option>
                          <option value="Discovery">Discovery</option>
                          <option value="LateralMovement">Lateral Movement</option>
                          <option value="Collection">Collection</option>
                          <option value="CommandAndControl">Command and Control</option>
                          <option value="Exfiltration">Exfiltration</option>
                          <option value="Impact">Impact</option>
                          <option value="Ransomware">Ransomware</option>
                          <option value="Malware">Malware</option>
                        </select>
                      </div>
                    </div>
      )}

      {provider === 'elastic' && (
                    <div className={`grid grid-cols-2 gap-3 ${previewOnly ? 'opacity-60 pointer-events-none' : ''}`}>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Rule Type</label>
                        <select
                          value={String(ruleConfig.type || 'query')}
                          onChange={e => setRuleConfig(p => ({ ...p, type: e.target.value, language: e.target.value === 'eql' ? 'eql' : e.target.value === 'esql' ? 'esql' : 'lucene' }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="query">Query (Lucene)</option>
                          <option value="eql">EQL</option>
                          <option value="esql">ES|QL</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Score (0-100)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Number(ruleConfig.riskScore || 50)}
                          onChange={e => setRuleConfig(p => ({ ...p, riskScore: Number(e.target.value) }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                        />
                      </div>
                    </div>
      )}

      {provider === 'crowdstrike' && (
                    <div className={`space-y-3 ${previewOnly ? 'opacity-60 pointer-events-none' : ''}`}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Severity</label>
                          <select
                            value={String(ruleConfig.severity ?? 50)}
                            onChange={e => setRuleConfig(p => ({ ...p, severity: Number(e.target.value) }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="10">Informational (10)</option>
                            <option value="30">Low (30)</option>
                            <option value="50">Medium (50)</option>
                            <option value="70">High (70)</option>
                            <option value="90">Critical (90)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Outcome</label>
                          <select
                            value={String(ruleConfig.outcome || 'detection')}
                            onChange={e => setRuleConfig(p => ({ ...p, outcome: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="detection">Detection</option>
                            <option value="incident">Incident</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Search Window (Lookback)</label>
                          <input
                            type="text"
                            value={String(ruleConfig.lookback || '1h0m')}
                            onChange={e => setRuleConfig(p => ({ ...p, lookback: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                          />
                          <p className="text-[10px] text-on-surface-variant/50 mt-0.5">e.g. "1h0m", "5h0m", "75m"</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Schedule Frequency</label>
                          <input
                            type="text"
                            value={String(ruleConfig.schedule || '@every 1h0m')}
                            onChange={e => setRuleConfig(p => ({ ...p, schedule: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                          />
                          <p className="text-[10px] text-on-surface-variant/50 mt-0.5">e.g. "@every 1h0m" (min "@every 0h5m")</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Trigger Mode</label>
                        <select
                          value={String(ruleConfig.triggerMode || 'summary')}
                          onChange={e => setRuleConfig(p => ({ ...p, triggerMode: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="summary">Summary</option>
                          <option value="verbose">Verbose</option>
                        </select>
                        <p className="text-[10px] text-on-surface-variant/50 mt-0.5">
                          Verbose creates 1 detection per result (50 limit). Summary creates a single detection.
                        </p>
                      </div>

                      {/* Deploy as Active/Inactive — production safety */}
                      <div className="p-3 rounded-lg border border-outline-variant/15 bg-surface-container-high/30">
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Initial Status</label>
                        <select
                          value={String(ruleConfig.status || 'inactive')}
                          onChange={e => setRuleConfig(p => ({ ...p, status: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="inactive">Inactive (recommended)</option>
                          <option value="active">Active</option>
                        </select>
                        <p className="text-[11px] text-on-surface-variant/60 mt-1">
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
