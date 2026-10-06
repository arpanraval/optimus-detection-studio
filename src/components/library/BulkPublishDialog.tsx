/**
 * BulkPublishDialog - Multi-step dialog for bulk promoting detections to Production Library.
 * Steps: Eligibility Check -> Summary & Confirmation -> Progress -> Done
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { useLibrary } from '../../context/LibraryContext';
import { PublishEligibility, Detection } from '../../types';

const SOLID_TERTIARY = '#783264';
const SOLID_BLUE = '#005091';

type DialogStep = 'checking' | 'summary' | 'publishing' | 'done';

interface EligibilityResult {
  detectionId: string;
  detectionName: string;
  eligible: boolean;
  reason?: string;
  eligibility?: PublishEligibility;
}

interface BulkPublishDialogProps {
  detectionIds: string[];
  detections: Detection[];
  onClose: () => void;
  onComplete: () => void;
}

export const BulkPublishDialog: React.FC<BulkPublishDialogProps> = ({
  detectionIds,
  detections,
  onClose,
  onComplete,
}) => {
  const { checkPromotionEligibility, submitForPromotionSilent, refreshProductionLibrary, refreshUserSubmissions } = useLibrary();

  const [step, setStep] = useState<DialogStep>('checking');
  const [results, setResults] = useState<EligibilityResult[]>([]);
  const [eligibleIds, setEligibleIds] = useState<string[]>([]);
  const [ineligibleResults, setIneligibleResults] = useState<EligibilityResult[]>([]);
  const [showIneligible, setShowIneligible] = useState(false);

  // Publishing progress
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishTotal, setPublishTotal] = useState(0);
  const [publishSuccessCount, setPublishSuccessCount] = useState(0);
  const [publishFailCount, setPublishFailCount] = useState(0);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);

  // Check eligibility on mount
  useEffect(() => {
    let cancelled = false;

    const checkAll = async () => {
      const allResults: EligibilityResult[] = [];

      // Run eligibility checks in parallel batches of 5
      const batchSize = 5;
      for (let i = 0; i < detectionIds.length; i += batchSize) {
        if (cancelled) return;
        const batch = detectionIds.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async (id) => {
            const detection = detections.find(d => d.id === id);
            const eligibility = await checkPromotionEligibility(id);

            return {
              detectionId: id,
              detectionName: detection?.name || 'Unknown',
              eligible: eligibility?.eligible ?? false,
              reason: eligibility?.eligible ? undefined : getIneligibleReason(eligibility),
              eligibility: eligibility ?? undefined,
            } as EligibilityResult;
          })
        );

        batchResults.forEach(r => {
          if (r.status === 'fulfilled') {
            allResults.push(r.value);
          } else {
            // If the promise itself rejected, mark as ineligible
            allResults.push({
              detectionId: '',
              detectionName: 'Unknown',
              eligible: false,
              reason: 'Check failed',
            });
          }
        });
      }

      if (cancelled) return;

      setResults(allResults);
      const eligible = allResults.filter(r => r.eligible);
      const ineligible = allResults.filter(r => !r.eligible);
      setEligibleIds(eligible.map(r => r.detectionId));
      setIneligibleResults(ineligible);
      setStep('summary');
    };

    checkAll();
    return () => { cancelled = true; };
  }, [detectionIds, detections, checkPromotionEligibility]);

  const handlePublish = useCallback(async () => {
    setStep('publishing');
    setPublishTotal(eligibleIds.length);
    setPublishProgress(0);
    setPublishSuccessCount(0);
    setPublishFailCount(0);
    setPublishErrors([]);

    let successes = 0;
    let failures = 0;
    const errors: string[] = [];

    for (let i = 0; i < eligibleIds.length; i++) {
      const id = eligibleIds[i];
      const detection = detections.find(d => d.id === id);
      const result = await submitForPromotionSilent(id);

      if (result.success) {
        successes++;
      } else {
        failures++;
        errors.push(`${detection?.name || id}: ${result.error || 'Unknown error'}`);
      }

      setPublishProgress(i + 1);
      setPublishSuccessCount(successes);
      setPublishFailCount(failures);
      setPublishErrors([...errors]);
    }

    // Refresh once at the end
    await Promise.all([refreshProductionLibrary(), refreshUserSubmissions()]);
    setStep('done');
  }, [eligibleIds, detections, submitForPromotionSilent, refreshProductionLibrary, refreshUserSubmissions]);

  const handleDone = () => {
    onComplete();
    onClose();
  };

  const progressPercent = publishTotal > 0 ? Math.round((publishProgress / publishTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={step === 'publishing' ? undefined : onClose} />
      <div className="relative w-full max-w-lg bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-on-surface">
              Promote to Production
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {detectionIds.length} detection{detectionIds.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          {step !== 'publishing' && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-container-highest rounded-lg transition-colors"
            >
              <Icon name="x" className="w-4 h-4 text-on-surface-variant" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Step: Checking eligibility */}
          {step === 'checking' && (
            <div className="flex flex-col items-center py-8">
              <Icon name="spinner" className="w-8 h-8 animate-spin mb-4" style={{ color: SOLID_BLUE }} />
              <p className="text-sm font-medium text-on-surface">Checking eligibility...</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Verifying {detectionIds.length} detection{detectionIds.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Step: Summary */}
          {step === 'summary' && (
            <div className="space-y-4">
              {/* Eligible */}
              {eligibleIds.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-emerald-500/10 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon name="check" className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-on-surface">
                      {eligibleIds.length} eligible for publishing
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      These detections meet all quality requirements
                    </p>
                  </div>
                </div>
              )}

              {/* Ineligible */}
              {ineligibleResults.length > 0 && (
                <div className="rounded-lg border border-outline-variant/10 overflow-hidden">
                  <button
                    onClick={() => setShowIneligible(!showIneligible)}
                    className="w-full flex items-center gap-3 p-3 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon name="alert-triangle" className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-on-surface">
                        {ineligibleResults.length} not eligible
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        Click to {showIneligible ? 'hide' : 'see'} details
                      </p>
                    </div>
                    <Icon
                      name="chevron-down"
                      className={`w-4 h-4 text-on-surface-variant transition-transform ${showIneligible ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showIneligible && (
                    <div className="max-h-48 overflow-y-auto divide-y divide-outline-variant/10">
                      {ineligibleResults.map((r, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                          <p className="text-sm text-on-surface truncate max-w-[280px]">
                            {r.detectionName}
                          </p>
                          <span className="text-xs text-on-surface-variant flex-shrink-0 ml-2">
                            {r.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* No eligible */}
              {eligibleIds.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-on-surface-variant">
                    No detections are eligible for publishing. Please review the issues above.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step: Publishing */}
          {step === 'publishing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Publishing...</span>
                <span className="font-medium text-on-surface">
                  {publishProgress} / {publishTotal}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: SOLID_BLUE,
                  }}
                />
              </div>
              {publishFailCount > 0 && (
                <p className="text-xs text-amber-400">
                  {publishFailCount} failed so far
                </p>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: publishFailCount === 0 ? 'rgba(77,124,111,0.15)' : 'rgba(245,158,11,0.15)' }}
                >
                  <Icon
                    name={publishFailCount === 0 ? 'check-circle' : 'alert-triangle'}
                    className={`w-6 h-6 ${publishFailCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}
                  />
                </div>
                <p className="text-base font-semibold text-on-surface">
                  {publishFailCount === 0 ? 'All Published Successfully' : 'Publishing Complete'}
                </p>
                <p className="text-sm text-on-surface-variant mt-1">
                  {publishSuccessCount} submitted for review{publishFailCount > 0 ? `, ${publishFailCount} failed` : ''}
                </p>
              </div>

              {publishErrors.length > 0 && (
                <div className="max-h-32 overflow-y-auto p-3 bg-surface-container-high rounded-lg space-y-1">
                  {publishErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-400">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/10 flex items-center justify-end gap-2 bg-surface-container-low">
          {step === 'summary' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={eligibleIds.length === 0}
                className="px-4 py-1.5 text-sm font-medium text-white rounded-md hover:brightness-110 transition-all disabled:opacity-50"
                style={{ backgroundColor: SOLID_TERTIARY }}
              >
                Publish {eligibleIds.length} Detection{eligibleIds.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={handleDone}
              className="px-4 py-1.5 text-sm font-medium text-white rounded-md hover:brightness-110 transition-all"
              style={{ backgroundColor: SOLID_TERTIARY }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function getIneligibleReason(eligibility: PublishEligibility | null): string {
  if (!eligibility) return 'Check failed';
  if (eligibility.is_pending) return 'Already pending approval';
  if (eligibility.is_promoted_unchanged) return 'Already promoted (unchanged)';

  const checks = eligibility.checks;
  const failures: string[] = [];
  if (!checks.quality_score.passed) failures.push('Low quality score');
  if (!checks.name.passed) failures.push('Missing name');
  if (!checks.description.passed) failures.push('Short description');
  if (!checks.mitre_mapping.passed) failures.push('No MITRE mapping');
  if (!checks.detection_query.passed) failures.push('No query');

  return failures.length > 0 ? failures.join(', ') : 'Not eligible';
}

export default BulkPublishDialog;
