/**
 * PackDeployPickerModal — 3-step wizard to deploy a pack to a SIEM:
 *   1. Pick SIEM integration
 *   2. Configure per-SIEM settings (shared form with single-rule deploy)
 *   3. Review deployable/skipped counts and confirm
 *
 * The chosen ruleConfig is persisted on the pack_deploy_jobs row and applied
 * to every detection in the pack at deploy time by the worker.
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { IntegrationLogo } from '../integrations/IntegrationLogo';
import { ProviderRuleConfigForm } from '../integrations/ProviderRuleConfigForm';
import { getDefaultRuleConfig } from '../../lib/providerRuleConfigDefaults';
import { getProviderMeta } from '../../lib/providerMeta';
import { supabase } from '../../lib/supabaseClient';
import { createDeployJob } from '../../lib/packDeployJobService';
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
const BLOCKED_STATUSES = new Set(['Draft', 'Deprecated', 'Archived']);

export const PackDeployPickerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  packId,
  detections,
  packName,
}) => {
  const [step, setStep] = useState<WizardStep>('pick');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState<Integration | null>(null);
  const [ruleConfig, setRuleConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { setActiveJob } = useDeployJob();
  const { showToast } = useToast();

  const loadIntegrations = async () => {
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
  };

  useEffect(() => {
    if (!isOpen) return;
    setStep('pick');
    setSelected(null);
    setRuleConfig({});
    loadIntegrations();
  }, [isOpen]);

  // When user picks a SIEM, seed ruleConfig from provider defaults.
  const handlePickIntegration = (int: Integration) => {
    setSelected(int);
    setRuleConfig(getDefaultRuleConfig(int.provider));
    setStep('configure');
  };

  // Library-type + status filtering for the review step.
  const deployable = detections.filter(
    (d) => d.library_type === 'production' && !BLOCKED_STATUSES.has(d.status)
  );
  const lab = detections.filter((d) => d.library_type !== 'production');
  const blocked = detections.filter(
    (d) => d.library_type === 'production' && BLOCKED_STATUSES.has(d.status)
  );
  const skipCount = lab.length + blocked.length;

  const handleDeploy = async () => {
    if (!selected || deployable.length === 0) return;
    setSubmitting(true);
    try {
      const jobId = await createDeployJob({
        packId,
        integrationId: selected.id,
        detections: deployable,
        ruleConfig,
      });
      setActiveJob(jobId);
      showToast(
        'info',
        'Deploy Queued',
        `${deployable.length} detection${deployable.length !== 1 ? 's' : ''} queued for deployment`
      );
      onClose();
    } catch (err) {
      showToast('error', 'Failed to Queue', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden">
        {/* Header with step indicator */}
        <div className="px-6 py-5 border-b border-outline-variant/20">
          <h2 className="text-lg font-bold text-on-surface">
            Deploy {packName ? `"${packName}"` : 'Pack'}
          </h2>
          <div className="flex items-center gap-2 mt-2 text-xs text-on-surface-variant">
            <span className={step === 'pick' ? 'text-primary font-semibold' : ''}>1. SIEM</span>
            <span>›</span>
            <span className={step === 'configure' ? 'text-primary font-semibold' : ''}>2. Configure</span>
            <span>›</span>
            <span className={step === 'review' ? 'text-primary font-semibold' : ''}>3. Review</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {step === 'pick' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider">
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
                  <div className="text-xs text-on-surface-variant/60">Configure one in Integrations first</div>
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
                        <div className="text-xs text-on-surface-variant/70 truncate">{int.provider}</div>
                      </div>
                      <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/50" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'configure' && selected && (
            <div className="space-y-4">
              {deployable.length === 0 && (
                <div role="alert" className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-200">
                    <div className="font-semibold mb-0.5">No deployable detections in this pack</div>
                    <div>Configuration can still be set, but the deploy button will remain disabled until you promote lab rules to Production or unblock drafts.</div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <IntegrationLogo provider={getProviderMeta(selected.provider)} size="sm" />
                <div>
                  <div className="text-sm font-medium text-on-surface">{selected.name}</div>
                  <div className="text-xs text-on-surface-variant">
                    These settings apply to every detection in the pack.
                  </div>
                </div>
              </div>
              <ProviderRuleConfigForm
                provider={selected.provider}
                ruleConfig={ruleConfig}
                onChange={setRuleConfig}
              />
            </div>
          )}

          {step === 'review' && selected && (
            <div className="space-y-4">
              <div className="p-4 bg-surface-container/50 rounded-lg">
                <div className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-2">
                  Summary
                </div>
                <div className="text-sm text-on-surface">
                  Deploying <span className="font-bold">{deployable.length}</span> detection{deployable.length !== 1 ? 's' : ''} to
                  {' '}<span className="font-semibold">{selected.name}</span>
                </div>
                {skipCount > 0 && (
                  <div className="mt-2 text-xs text-amber-300 space-y-0.5">
                    {lab.length > 0 && <div>· {lab.length} lab detection{lab.length !== 1 ? 's' : ''} skipped (promote to Production first)</div>}
                    {blocked.length > 0 && <div>· {blocked.length} Draft/Deprecated/Archived skipped</div>}
                  </div>
                )}
              </div>
              <div className="p-3 bg-surface-container/30 rounded-lg text-xs text-on-surface-variant">
                <div className="font-semibold text-on-surface mb-1">Config applied to every rule:</div>
                <pre className="font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify(ruleConfig, null, 2)}</pre>
              </div>
              <div className="flex items-start gap-2 text-xs text-on-surface-variant/70 bg-surface-container/50 rounded-lg p-3">
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
            <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container">
              Cancel
            </button>
            {step === 'configure' && (
              <button
                onClick={() => setStep('review')}
                disabled={deployable.length === 0}
                title={deployable.length === 0 ? 'No deployable detections — promote lab rules or unblock drafts first' : undefined}
                className="px-5 py-2 bg-primary text-on-primary font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Review
                <Icon name="arrow-right" className="w-4 h-4" />
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={handleDeploy}
                disabled={submitting || deployable.length === 0}
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
