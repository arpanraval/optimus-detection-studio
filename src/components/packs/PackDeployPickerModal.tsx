/**
 * PackDeployPickerModal — 3-step wizard to deploy a pack to a SIEM:
 *   1. Pick SIEM integration
 *   2. Configure per-SIEM settings (shared form with single-rule deploy)
 *   3. Review deployable/skipped counts and confirm
 *
 * The chosen ruleConfig is persisted on the pack_deploy_jobs row and applied
 * to every detection in the pack at deploy time by the worker.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '../Icon';
import { IntegrationLogo } from '../integrations/IntegrationLogo';
import { ProviderRuleConfigForm } from '../integrations/ProviderRuleConfigForm';
import { getDefaultRuleConfig } from '../../lib/providerRuleConfigDefaults';
import { getProviderMeta } from '../../lib/providerMeta';
import { supabase } from '../../lib/supabaseClient';
import { createDeployJob, previewDeployJob, type PackPreviewItem } from '../../lib/packDeployJobService';
import { useDeployJob } from '../../context/DeployJobContext';
import { useToast } from '../../hooks/useToast';
import type { Detection, Integration } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  packId: string | null;
  detections: Detection[];
  packName?: string;
}

type WizardStep = 'pick' | 'configure' | 'review';

function SkippedRules({
  items,
  onReconcile,
  checking,
}: {
  items: PackPreviewItem[];
  onReconcile?: () => void;
  checking?: boolean;
}) {
  if (!items.length) return null;
  const groups = new Map<string, PackPreviewItem[]>();
  for (const item of items) {
    const reason = item.reason || 'Not eligible';
    groups.set(reason, [...(groups.get(reason) || []), item]);
  }
  return (
    <div className="text-xs text-on-surface border border-outline-variant/30 rounded-lg p-3">
      <details>
        <summary className="cursor-pointer font-medium">{items.length} skipped — view reasons</summary>
        <div className="mt-3 space-y-3 max-h-48 overflow-auto">
          {[...groups].map(([reason, rules]) => (
            <div key={reason}>
              <p className="font-medium">
                {reason} ({rules.length})
              </p>
              <ul className="mt-1 space-y-1 text-on-surface-variant">
                {rules.map((item) => (
                  <li key={item.detection_id}>{item.detection_name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
      {onReconcile && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onReconcile}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50"
          >
            <Icon name="refresh" className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Reconciling...' : 'Reconcile with Sentinel'}
          </button>
          <span className="text-on-surface-variant">Checks current rules. Job history stays unchanged.</span>
        </div>
      )}
    </div>
  );
}

const settingLabels: Record<string, string> = {
  ruleType: 'Rule type',
  queryFrequency: 'Query frequency',
  queryPeriod: 'Query lookback',
  triggerOperator: 'Trigger operator',
  triggerThreshold: 'Trigger threshold',
  suppressionDuration: 'Suppression duration',
  suppressionEnabled: 'Suppress repeat alerts',
  eventGrouping: 'Event grouping',
  createIncident: 'Create incidents',
  groupAlerts: 'Group related alerts',
  enabled: 'Enable immediately',
  frequency: 'Frequency',
  cronSchedule: 'Cron schedule',
  earliestTime: 'Earliest time',
  latestTime: 'Latest time',
  alertActions: 'Alert actions',
  securityDomain: 'Security domain',
  enableNotable: 'Create notable events',
  enableRba: 'Risk-based alerting',
  riskScore: 'Risk score',
  riskMessage: 'Risk message',
  drilldownSearch: 'Drilldown search',
  index: 'Indices',
  interval: 'Interval',
  from: 'Lookback',
  maxSignals: 'Maximum alerts',
  tags: 'Tags',
  outcome: 'Outcome',
  lookback: 'Search window',
  schedule: 'Schedule',
  triggerMode: 'Trigger mode',
  status: 'Initial status',
};
function settingValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  const text = String(value);
  const duration = text.match(/^P(?:(\d+)D|T(\d+)([HM]))$/);
  if (duration)
    return duration[1] ? `${duration[1]} day(s)` : `${duration[2]} ${duration[3] === 'H' ? 'hour(s)' : 'minute(s)'}`;
  return text.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export const PackDeployPickerModal: React.FC<Props> = ({ isOpen, onClose, packId, detections, packName }) => {
  const [step, setStep] = useState<WizardStep>('pick');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState<Integration | null>(null);
  const [ruleConfig, setRuleConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PackPreviewItem[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [reconcileRequested, setReconcileRequested] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const requestKey = useRef(crypto.randomUUID());
  const submission = useRef(false);
  const { setActiveJob } = useDeployJob();
  const { showToast } = useToast();

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('status', 'connected')
      .eq('category', 'siem')
      .order('name');
    if (error) {
      showToast('error', 'Failed to load integrations', error.message);
      setIntegrations([]);
    } else {
      setIntegrations((data || []) as Integration[]);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    if (!isOpen) return;
    setStep('pick');
    setSelected(null);
    setRuleConfig({});
    setPreview([]);
    setReconcileRequested(false);
    requestKey.current = crypto.randomUUID();
    loadIntegrations();
  }, [isOpen, loadIntegrations]);

  // When user picks a SIEM, seed ruleConfig from provider defaults.
  const handlePickIntegration = (int: Integration) => {
    setReconcileRequested(false);
    setSelected(int);
    const defaults = getDefaultRuleConfig(int.provider);
    delete defaults.severity;
    delete defaults.tactics;
    delete defaults.techniques;
    if (int.provider === 'defender_xdr') delete defaults.category;
    setRuleConfig(defaults);
    requestKey.current = crypto.randomUUID();
    setStep('configure');
  };

  useEffect(() => {
    if (!isOpen || !selected) return;
    requestKey.current = crypto.randomUUID();
    let cancelled = false;
    setChecking(true);
    if (!reconcileRequested) setPreview([]);
    setPreviewError(null);
    previewDeployJob({ packId, integrationId: selected.id, detections, reconcile: reconcileRequested })
      .then((items) => {
        if (!cancelled) setPreview(items);
      })
      .catch((error) => {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selected, detections, packId, reconcileRequested, previewVersion]);
  const deployable = preview.filter((item) => !item.reason);
  const skipped = preview.filter((item) => item.reason);
  const skipCount = skipped.length;
  const reconcile =
    selected?.provider === 'sentinel' && skipped.some((item) => item.can_reconcile)
      ? () => {
          setReconcileRequested(true);
          setPreviewVersion((value) => value + 1);
        }
      : undefined;

  const handleDeploy = async () => {
    if (!selected || checking || previewError || deployable.length === 0 || submission.current) return;
    submission.current = true;
    setSubmitting(true);
    try {
      const jobId = await createDeployJob({
        packId,
        integrationId: selected.id,
        detections,
        requestKey: requestKey.current,
        ruleConfig,
        reconcile: reconcileRequested,
      });
      setActiveJob(jobId);
      showToast(
        'info',
        'Deploy Queued',
        `${deployable.length} detection${deployable.length !== 1 ? 's' : ''} queued for deployment`,
      );
      onClose();
    } catch (err) {
      showToast('error', 'Failed to Queue', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
      submission.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-surface rounded-2xl border border-outline-variant/30 shadow-lg overflow-hidden">
        {/* Header with step indicator */}
        <div className="px-6 py-5 border-b border-outline-variant/20">
          <h2 className="text-lg font-bold text-on-surface">Deploy {packName ? `"${packName}"` : 'Pack'}</h2>
          <div className="flex items-center gap-2 mt-2 text-xs text-on-surface-variant">
            <span className={step === 'pick' ? 'text-primary font-semibold' : ''}>1. SIEM</span>
            <span>›</span>
            <span className={step === 'configure' ? 'text-primary font-semibold' : ''}>2. Configure</span>
            <span>›</span>
            <span className={step === 'review' ? 'text-primary font-semibold' : ''}>3. Review</span>
          </div>
        </div>

        {checking && (
          <p role="status" className="px-6 py-2 text-sm text-on-surface">
            Checking each rule against the selected SIEM...
          </p>
        )}
        {previewError && (
          <p role="alert" className="px-6 py-2 text-sm text-error dark:text-error">
            {previewError}
          </p>
        )}
        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {step === 'pick' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  Select SIEM Integration
                </div>
                <button
                  onClick={loadIntegrations}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  title="Refresh integrations"
                >
                  <Icon name="refresh" className="w-3 h-3" />
                  Refresh
                </button>
              </div>
              {loading ? (
                <div className="text-center py-8 text-on-surface-variant text-sm">Loading integrations...</div>
              ) : integrations.length === 0 ? (
                <div className="text-center py-8 text-sm">
                  <div className="text-on-surface-variant mb-2">No connected SIEM integrations</div>
                  <div className="text-xs text-on-surface-variant">Configure one in Integrations first</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {integrations.map((int) => (
                    <button
                      key={int.id}
                      onClick={() => handlePickIntegration(int)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface-container text-left transition-colors"
                    >
                      <IntegrationLogo provider={getProviderMeta(int.provider)} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-on-surface truncate">{int.name}</div>
                        <div className="text-xs text-on-surface-variant truncate">{int.provider}</div>
                      </div>
                      <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'configure' && selected && (
            <div className="space-y-4">
              {!checking && !previewError && deployable.length === 0 && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 bg-surface-container-highest border border-outline-variant/30 rounded-lg"
                >
                  <Icon name="alert-triangle" className="w-4 h-4 text-on-surface flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-on-surface">
                    <div className="font-semibold mb-0.5">No deployable detections in this pack</div>
                    <div>
                      Each rule needs an eligible status, a matching query, and an untracked target. Review the skip
                      reasons below.
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <IntegrationLogo provider={getProviderMeta(selected.provider)} size="sm" />
                <div>
                  <div className="text-sm font-medium text-on-surface">{selected.name}</div>
                  <div className="text-xs text-on-surface-variant">
                    Names, descriptions and MITRE metadata come from each detection. Schedule settings apply to the
                    pack; severity follows each detection unless overridden.
                  </div>
                </div>
              </div>
              {!checking && !previewError && (
                <p className="text-sm font-semibold text-on-surface" role="status">
                  {deployable.length} of {preview.length} eligible · {skipCount} skipped
                </p>
              )}
              <SkippedRules items={skipped} onReconcile={reconcile} checking={checking} />
              {!checking && !previewError && deployable.some((item) => item.notice) && (
                <p className="text-xs text-on-surface-variant">
                  Includes {deployable.filter((item) => item.notice).length} rules eligible to be created again after
                  checking previous deployments. Previous job history is unchanged.
                </p>
              )}
              <ProviderRuleConfigForm
                packMode
                provider={selected.provider}
                ruleConfig={ruleConfig}
                onChange={(update) => {
                  setRuleConfig(update);
                  requestKey.current = crypto.randomUUID();
                }}
              />
            </div>
          )}

          {step === 'review' && selected && (
            <div className="space-y-4">
              <div className="p-4 bg-surface-container/50 rounded-lg">
                <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  Summary
                </div>
                <div className="text-sm text-on-surface">
                  Deploying <span className="font-bold">{deployable.length}</span> detection
                  {deployable.length !== 1 ? 's' : ''} to <span className="font-semibold">{selected.name}</span>
                </div>
                {skipCount > 0 && (
                  <div className="mt-2">
                    <SkippedRules items={skipped} onReconcile={reconcile} checking={checking} />
                  </div>
                )}
                {deployable.some((item) => item.notice) && (
                  <p className="mt-2 text-xs text-on-surface-variant">
                    Includes {deployable.filter((item) => item.notice).length} rules with no current Sentinel match.
                    Their previous deployment history will be retained.
                  </p>
                )}
              </div>
              <div className="p-3 bg-surface-container/30 rounded-lg text-xs text-on-surface-variant">
                {selected.provider === 'sentinel' && (
                  <p className="text-sm font-semibold text-on-surface mb-3">
                    New rules will be {ruleConfig.enabled === true ? 'enabled' : 'disabled'} after deployment.
                  </p>
                )}
                <div className="font-semibold text-on-surface mb-1">From each detection</div>
                <p>Name, description, MITRE tactics and techniques use each detection's saved metadata.</p>
                <p className="mt-1">
                  {ruleConfig.severity
                    ? `Severity override: ${ruleConfig.severity}`
                    : 'Severity uses each detection’s value.'}
                </p>
                {selected.provider === 'defender_xdr' && (
                  <p className="mt-1">
                    Alert category uses the first supported MITRE tactic; Suspicious Activity is the fallback.
                  </p>
                )}
                <div className="font-semibold text-on-surface mt-3 mb-2">Shared settings</div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {Object.entries(ruleConfig)
                    .filter(([key, value]) => settingLabels[key] && value !== '' && value != null)
                    .map(([key, value]) => (
                      <React.Fragment key={key}>
                        <dt>{settingLabels[key]}</dt>
                        <dd className="text-on-surface break-words">{settingValue(value)}</dd>
                      </React.Fragment>
                    ))}
                </dl>
              </div>
              <div className="flex items-start gap-2 text-xs text-on-surface-variant bg-surface-container/50 rounded-lg p-3">
                <Icon name="info" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary/70" />
                <span>Deploy runs in the background. You can close this tab — the deploy will continue.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-outline-variant/20">
          <div>
            {step !== 'pick' && (
              <button
                onClick={() => setStep(step === 'configure' ? 'pick' : 'configure')}
                className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container flex items-center gap-1"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container"
            >
              Cancel
            </button>
            {step === 'configure' && (
              <button
                onClick={() => setStep('review')}
                disabled={checking || !!previewError || deployable.length === 0}
                title={
                  deployable.length === 0
                    ? 'No deployable detections — promote lab rules or unblock drafts first'
                    : undefined
                }
                className="px-5 py-2 bg-primary text-on-primary font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Review
                <Icon name="arrow-right" className="w-4 h-4" />
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={handleDeploy}
                disabled={submitting || checking || !!previewError || deployable.length === 0}
                className="px-5 py-2 bg-primary text-on-primary font-bold rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Icon name="spinner" className="w-4 h-4 animate-spin" />
                    Queueing...
                  </>
                ) : (
                  <>Deploy {deployable.length}</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
