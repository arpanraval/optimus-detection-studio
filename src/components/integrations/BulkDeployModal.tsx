/**
 * BulkDeployModal — 4-step wizard for deploying multiple detections to a SIEM.
 * Steps: Select Integration -> Validate Compatibility -> Deploy Progress -> Results
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '../Icon';
import { IntegrationLogo } from './IntegrationLogo';
import { getProviderMeta } from '../../lib/providerMeta';
import { supabase } from '../../lib/supabaseClient';
import { bulkDeploy, BulkDeployResult } from '../../services/bulkDeployService';
import { hydrateDetections } from '../../lib/detectionHydration';
import type { Detection, Integration } from '../../types';
import { PROVIDER_QUERY_LANGUAGES } from '../../types';

// =============================================================================
// Types
// =============================================================================

export interface BulkDeployModalProps {
  detections: Detection[];
  onClose: () => void;
  onComplete?: (result: BulkDeployResult) => void;
}

type Step = 'select' | 'validate' | 'progress' | 'results';

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'validate', label: 'Validate' },
  { id: 'progress', label: 'Deploy' },
  { id: 'results', label: 'Results' },
];

// =============================================================================
// Step Indicator (matches DeployDetectionModal pattern)
// =============================================================================

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEP_LABELS.findIndex(s => s.id === current);

  return (
    <div className="flex items-center justify-center gap-1.5 mb-4">
      {STEP_LABELS.map((s, i) => {
        const isActive = s.id === current;
        const isPast = i < currentIdx;
        return (
          <React.Fragment key={s.id}>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isActive ? 'bg-on-surface' : isPast ? 'bg-on-surface-variant/40' : 'bg-outline-variant/30'
              }`} />
              <span className={`text-[10px] transition-colors ${
                isActive ? 'text-on-surface font-medium' : isPast ? 'text-on-surface-variant/60' : 'text-on-surface-variant/30'
              }`}>
                {s.label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`w-4 h-px ${isPast ? 'bg-on-surface-variant/30' : 'bg-outline-variant/20'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getCompatibleDetections(
  detections: Detection[],
  provider: string
): { compatible: Detection[]; incompatible: Detection[] } {
  const acceptedLangs = (PROVIDER_QUERY_LANGUAGES[provider] || []).map(l => l.toUpperCase());
  if (acceptedLangs.length === 0) {
    return { compatible: detections, incompatible: [] };
  }

  const compatible: Detection[] = [];
  const incompatible: Detection[] = [];

  for (const d of detections) {
    // Check multi-query array first, then legacy field
    const hasMatch =
      (d.queries?.some(q => q.language && acceptedLangs.includes(q.language.toUpperCase()))) ||
      (d.queryLanguage && acceptedLangs.includes(d.queryLanguage.toUpperCase()));

    // Also check the detection has an actual query
    const hasQuery =
      (d.queries?.some(q => q.query && q.query.trim() !== '')) ||
      (d.detectionQuery && d.detectionQuery.trim() !== '');

    if (hasMatch && hasQuery) {
      compatible.push(d);
    } else {
      incompatible.push(d);
    }
  }

  return { compatible, incompatible };
}

// =============================================================================
// Component
// =============================================================================

export const BulkDeployModal: React.FC<BulkDeployModalProps> = ({
  detections,
  onClose,
  onComplete,
}) => {
  // Step state
  const [step, setStep] = useState<Step>('select');

  // Detections arrive from the library list, which fetches a lightweight column set without
  // detectionQuery/queries. Validation and deploy both read those, so hydrate the selection
  // once when the modal opens rather than judging every rule to be query-less.
  const [rows, setRows] = useState<Detection[]>(detections);
  const [isHydrating, setIsHydrating] = useState(true);

  // Step 1: Select integration
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);

  // Step 2: Validate
  const [compatible, setCompatible] = useState<Detection[]>([]);
  const [incompatible, setIncompatible] = useState<Detection[]>([]);

  // Step 3: Progress
  const [progressCompleted, setProgressCompleted] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressCurrent, setProgressCurrent] = useState('');
  const deployingRef = useRef(false);

  // Step 4: Results
  const [result, setResult] = useState<BulkDeployResult | null>(null);

  // ---------------------------------------------------------------------------
  // Hydrate the selected detections with their query content
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setIsHydrating(true);
    (async () => {
      const hydrated = await hydrateDetections(detections);
      if (cancelled) return;
      setRows(hydrated);
      setIsHydrating(false);
    })();
    return () => { cancelled = true; };
  }, [detections]);

  // ---------------------------------------------------------------------------
  // Load connected integrations
  // ---------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      setLoadingIntegrations(true);
      try {
        const { data, error } = await supabase
          .from('integrations')
          .select('*')
          .eq('status', 'connected')
          .order('name');

        if (error) throw error;
        setIntegrations((data || []) as Integration[]);
      } catch {
        setIntegrations([]);
      } finally {
        setLoadingIntegrations(false);
      }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Step transitions
  // ---------------------------------------------------------------------------
  const handleSelectIntegration = useCallback((integration: Integration) => {
    setSelectedIntegration(integration);
    const { compatible: compat, incompatible: incompat } = getCompatibleDetections(rows, integration.provider);
    setCompatible(compat);
    setIncompatible(incompat);
    setStep('validate');
  }, [rows]);

  const handleStartDeploy = useCallback(async () => {
    if (!selectedIntegration || compatible.length === 0 || deployingRef.current) return;
    deployingRef.current = true;
    setStep('progress');
    setProgressTotal(compatible.length);
    setProgressCompleted(0);

    const deployResult = await bulkDeploy(
      compatible,
      selectedIntegration.id,
      (completed, total, current) => {
        setProgressCompleted(completed);
        setProgressTotal(total);
        setProgressCurrent(current);
      },
    );

    setResult(deployResult);
    setStep('results');
    deployingRef.current = false;

    // Create notification
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: notifError } = await supabase.from('user_notifications').insert({
          user_id: user.id,
          type: 'deploy',
          title: `Deployed ${deployResult.succeeded.length}/${compatible.length} to ${selectedIntegration.name}`,
          message: deployResult.failed.length > 0
            ? `${deployResult.failed.length} failed`
            : 'All succeeded',
          category: 'deploy',
          source_user_id: user.id,
        });
        if (notifError) throw notifError;
      }
    } catch {
      // Non-critical — swallow notification errors
    }
  }, [selectedIntegration, compatible]);

  const handleRetryFailed = useCallback(() => {
    if (!result || !selectedIntegration) return;
    const failedIds = new Set(result.failed.map(f => f.id));
    const failedDetections = rows.filter(d => failedIds.has(d.id));
    setCompatible(failedDetections);
    setIncompatible([]);
    setResult(null);
    setStep('validate');
  }, [result, selectedIntegration, rows]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const providerMeta = selectedIntegration ? getProviderMeta(selectedIntegration.provider) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-surface-container rounded-2xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">
              Bulk Deploy
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {detections.length} detection{detections.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <StepIndicator current={step} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* ================================================================ */}
          {/* STEP 1: Select Integration                                       */}
          {/* ================================================================ */}
          {step === 'select' && (
            <div className="space-y-2">
              <p className="text-sm text-on-surface-variant mb-3">
                Choose the target SIEM / integration:
              </p>

              {(loadingIntegrations || isHydrating) && (
                <div className="flex items-center justify-center py-12">
                  <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant" />
                </div>
              )}

              {!loadingIntegrations && !isHydrating && integrations.length === 0 && (
                <div className="text-center py-12">
                  <Icon name="unlink" className="w-8 h-8 text-on-surface-variant/40 mx-auto mb-2" />
                  <p className="text-sm text-on-surface-variant">No connected integrations found.</p>
                  <p className="text-xs text-on-surface-variant/60 mt-1">Connect a SIEM first in Settings.</p>
                </div>
              )}

              {/* Held back until hydration finishes: picking a target before the rules carry
                  their queries would validate every one of them as incompatible. */}
              {!loadingIntegrations && !isHydrating && integrations.map(integration => {
                const meta = getProviderMeta(integration.provider);
                return (
                  <button
                    key={integration.id}
                    onClick={() => handleSelectIntegration(integration)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-outline-variant/20 hover:border-outline-variant/50 hover:bg-surface-container-highest/50 transition-all text-left"
                  >
                    {meta && <IntegrationLogo provider={meta} size="md" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {integration.name}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {meta?.name || integration.provider}
                      </p>
                    </div>
                    <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/40" />
                  </button>
                );
              })}
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 2: Validate Compatibility                                   */}
          {/* ================================================================ */}
          {step === 'validate' && selectedIntegration && (
            <div className="space-y-4">
              {/* Target */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-container-highest/50 border border-outline-variant/20">
                {providerMeta && <IntegrationLogo provider={providerMeta} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{selectedIntegration.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    Accepts: {(PROVIDER_QUERY_LANGUAGES[selectedIntegration.provider] || []).join(', ') || 'Any'}
                  </p>
                </div>
                <button
                  onClick={() => setStep('select')}
                  className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Compatible */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                  <Icon name="check" className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm text-on-surface">
                  <strong>{compatible.length}</strong> compatible detection{compatible.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Incompatible */}
              {incompatible.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-error/10 flex items-center justify-center">
                      <Icon name="x" className="w-3.5 h-3.5 text-error" />
                    </div>
                    <span className="text-sm text-on-surface">
                      <strong>{incompatible.length}</strong> incompatible (will be skipped)
                    </span>
                  </div>
                  <div className="ml-8 max-h-32 overflow-y-auto space-y-1">
                    {incompatible.map(d => (
                      <p key={d.id} className="text-xs text-on-surface-variant truncate">
                        {d.name || d.id} — {d.queryLanguage || 'no query language'}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {compatible.length === 0 && (
                <div className="p-4 rounded-xl bg-error/5 border border-error/20 text-center">
                  <p className="text-sm text-error">
                    No detections are compatible with this integration.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setStep('select')}
                  className="h-10 px-4 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleStartDeploy}
                  disabled={compatible.length === 0}
                  className="h-10 px-5 text-sm font-medium rounded-xl bg-primary text-on-primary hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  <Icon name="upload" className="w-4 h-4" />
                  Deploy {compatible.length} Detection{compatible.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 3: Deploy Progress                                          */}
          {/* ================================================================ */}
          {step === 'progress' && (
            <div className="py-8 space-y-6">
              <div className="text-center">
                <Icon name="spinner" className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm font-medium text-on-surface">
                  Deploying to {selectedIntegration?.name}...
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  {progressCompleted} / {progressTotal}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progressTotal > 0 ? (progressCompleted / progressTotal) * 100 : 0}%` }}
                />
              </div>

              {/* Current detection */}
              {progressCurrent && progressCurrent !== 'Complete' && (
                <p className="text-xs text-on-surface-variant text-center truncate px-4">
                  {progressCurrent}
                </p>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 4: Results                                                  */}
          {/* ================================================================ */}
          {step === 'results' && result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-highest/50 border border-outline-variant/20">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold text-primary">{result.succeeded.length}</p>
                  <p className="text-xs text-on-surface-variant">Succeeded</p>
                </div>
                <div className="w-px h-10 bg-outline-variant/30" />
                <div className="flex-1 text-center">
                  <p className={`text-2xl font-bold ${result.failed.length > 0 ? 'text-error' : 'text-on-surface-variant/40'}`}>
                    {result.failed.length}
                  </p>
                  <p className="text-xs text-on-surface-variant">Failed</p>
                </div>
              </div>

              {/* All succeeded */}
              {result.failed.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <Icon name="check-circle" className="w-5 h-5 text-primary" />
                  <p className="text-sm text-on-surface">All detections deployed successfully!</p>
                </div>
              )}

              {/* Failed list */}
              {result.failed.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-on-surface mb-2">Failed deployments:</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {result.failed.map(f => (
                      <div key={f.id} className="p-2.5 rounded-lg bg-error/5 border border-error/15">
                        <p className="text-sm text-on-surface font-medium truncate">{f.name}</p>
                        <p className="text-xs text-error mt-0.5 line-clamp-2">{f.error}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                {result.failed.length > 0 && (
                  <button
                    onClick={handleRetryFailed}
                    className="h-10 px-4 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest transition-all inline-flex items-center gap-2"
                  >
                    <Icon name="rotate-ccw" className="w-4 h-4" />
                    Retry Failed ({result.failed.length})
                  </button>
                )}
                <button
                  onClick={() => {
                    onComplete?.(result);
                    onClose();
                  }}
                  className="h-10 px-5 text-sm font-medium rounded-xl bg-primary text-on-primary hover:bg-primary/90 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
