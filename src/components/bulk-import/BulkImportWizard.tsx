/**
 * BulkImportWizard - Multi-step wizard for bulk import
 * Uses app's M3 design system
 *
 * Features:
 * - Multi-step wizard flow
 * - Navigation blocking during active operations
 * - Progress tracking
 */

import React, { useEffect, useCallback, useState } from 'react';
import { useBulkImportContext } from '../../context/BulkImportContext';
import { WizardStep, ImportSourceType } from '../../services/bulk-import/types';
import { SourceSelectionStep } from './steps/SourceSelectionStep';
import { ReconnaissanceStep } from './steps/ReconnaissanceStep';
import { ParsingProgressStep } from './steps/ParsingProgressStep';
import { PreviewStep } from './steps/PreviewStep';
import { ImportProgressStep } from './steps/ImportProgressStep';
import { ResultsStep } from './steps/ResultsStep';
import { NavigationBlockerModal } from './NavigationBlockerModal';
import { ImportStickyHeader } from './ImportStickyHeader';
import { useRegisterNavigationBlocker, useNavigationBlocker } from '../../context/NavigationBlockerContext';
import { useGlobalImport } from '../../context/GlobalImportContext';
import { Icon } from '../Icon';

interface BulkImportWizardProps {
  /** Called when user closes the wizard */
  onClose?: () => void;
  /** Pre-selected source type from URL params - skips source selection step */
  preSelectedSource?: ImportSourceType;
}

// Brand color for wizard
const BRAND_COLOR = '#783264';

const STEPS: { id: WizardStep; label: string; icon: string }[] = [
  { id: 'source', label: 'Source', icon: 'upload' },
  { id: 'recon', label: 'Scan', icon: 'search' },
  { id: 'parsing', label: 'Parsing', icon: 'refresh-cw' },
  { id: 'preview', label: 'Preview', icon: 'eye' },
  { id: 'importing', label: 'Import', icon: 'download' },
  { id: 'results', label: 'Results', icon: 'check-circle' },
];

function getStepIndex(step: WizardStep): number {
  const index = STEPS.findIndex((s) => s.id === step);
  return index >= 0 ? index : 0;
}

export function BulkImportWizard({ onClose, preSelectedSource }: BulkImportWizardProps = {}) {
  const { currentStep, status, reset, progress, rules, job } = useBulkImportContext();
  const globalImport = useGlobalImport();
  const currentIndex = getStepIndex(currentStep);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Calculate stats for sticky header
  const totalRules = rules.length;
  const validRules = rules.filter((r) => r.validation.isValid && !r.validation.isDuplicate).length;

  // Check if we're in an active state that requires confirmation
  const isActiveState = ['fetching', 'parsing', 'validating', 'inserting', 'embedding'].includes(status);
  const hasProgress = status !== 'idle' && totalRules > 0;

  // Navigation blocker - prevents accidental navigation during import
  const isImportBlocking = ['fetching', 'parsing', 'validating', 'inserting', 'embedding'].includes(status) && !globalImport.isMinimized;
  useRegisterNavigationBlocker('bulk-import', isImportBlocking);
  const { isBlocked: navIsBlocked, activeBlockerId, proceed, reset: resetBlocker } = useNavigationBlocker();
  const isBlocked = navIsBlocked && activeBlockerId === 'bulk-import';

  // Handle close with confirmation
  const handleClose = useCallback(() => {
    if (isActiveState) {
      setShowCloseConfirm(true);
    } else if (hasProgress && currentStep !== 'results') {
      // Has progress but not actively importing - still confirm
      if (window.confirm('You have unsaved import progress. Are you sure you want to close?')) {
        reset();
        onClose?.();
      }
    } else {
      reset();
      onClose?.();
    }
  }, [isActiveState, hasProgress, currentStep, reset, onClose]);

  // Confirm close during active import
  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    reset();
    onClose?.();
  }, [reset, onClose]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  const handleCancelWithConfirm = () => {
    // If we're in an active state, confirm before canceling
    if (isActiveState) {
      setShowCloseConfirm(true);
    } else {
      reset();
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'source':
      case 'configure':
        return <SourceSelectionStep preSelectedSource={preSelectedSource} />;
      case 'recon':
        return <ReconnaissanceStep />;
      case 'parsing':
      case 'validating':
        return <ParsingProgressStep />;
      case 'preview':
      case 'confirm':
        return <PreviewStep />;
      case 'importing':
        return <ImportProgressStep />;
      case 'results':
        return <ResultsStep />;
      default:
        return <SourceSelectionStep preSelectedSource={preSelectedSource} />;
    }
  };

  return (
    <>
      {/* Navigation blocker modal */}
      <NavigationBlockerModal
        isOpen={isBlocked}
        onStay={resetBlocker}
        onLeave={proceed}
        progress={
          progress
            ? {
                inserted: progress.insertedRules,
                total: progress.totalRules,
              }
            : undefined
        }
      />

      {/* Close confirmation dialog for active imports */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCloseConfirm(false)}
          />
          <div className="relative bg-surface-container-high rounded-[28px] p-6 max-w-md mx-4 shadow-xl border border-error/30">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-full bg-error-container/30">
                <Icon name="alert-triangle" className="w-6 h-6 text-error" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-on-surface">Cancel Import?</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {status === 'inserting'
                    ? `${progress?.insertedRules || 0} of ${progress?.totalRules || totalRules} rules have been imported.`
                    : 'An import operation is currently in progress.'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-error-container/20 border border-error/30 rounded-[12px] mb-6">
              <p className="text-sm text-on-surface">
                {status === 'inserting'
                  ? 'Already imported rules will remain in the database. You can continue the import later or rollback.'
                  : 'Closing now will lose any parsing progress. No rules have been imported yet.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 px-4 py-3 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
              >
                Keep Working
              </button>
              <button
                onClick={handleConfirmClose}
                className="flex-1 px-4 py-3 text-sm font-medium bg-error text-on-error rounded-full transition-colors hover:bg-error/90"
              >
                Close Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky header for import context */}
      <ImportStickyHeader
        sourceType={job?.config.sourceType}
        sourceName={
          job?.config.sourceType === 'zip'
            ? job?.config.sourceZip?.name
            : job?.config.sourceType === 'files'
            ? `${job?.config.sourceFiles?.length || 0} files`
            : job?.config.sourceUrl
        }
        totalRules={totalRules}
        validRules={validRules}
        status={status}
        targetLibrary={job?.config.targetLibrary}
      />

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-[24px] overflow-hidden">
        {/* Step indicator */}
        <div className="border-b border-outline-variant/20 px-6 py-4 bg-surface-container">
          <nav className="flex items-center justify-between">
            <ol className="flex items-center space-x-2 md:space-x-4">
              {STEPS.map((step, index) => {
                const isCompleted = index < currentIndex;
                const isCurrent = index === currentIndex;

                return (
                  <li key={step.id} className="flex items-center">
                    {index > 0 && (
                      <div
                        className="h-0.5 w-6 md:w-12 mr-2 md:mr-4 transition-colors"
                        style={{ backgroundColor: isCompleted ? BRAND_COLOR : 'rgba(var(--outline-variant), 0.3)' }}
                      />
                    )}
                    <div
                      className="flex items-center transition-colors"
                      style={{ color: isCurrent ? BRAND_COLOR : isCompleted ? `${BRAND_COLOR}B3` : 'rgba(var(--on-surface-variant), 0.5)' }}
                    >
                      <span
                        className="flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all"
                        style={{
                          borderColor: isCurrent ? BRAND_COLOR : isCompleted ? `${BRAND_COLOR}B3` : 'rgba(var(--outline-variant), 0.3)',
                          backgroundColor: isCurrent ? `${BRAND_COLOR}20` : isCompleted ? `${BRAND_COLOR}15` : 'transparent',
                        }}
                      >
                        {isCompleted ? (
                          <Icon name="check" className="w-4 h-4" style={{ color: BRAND_COLOR }} />
                        ) : (
                          <Icon name={step.icon} className="w-4 h-4" style={{ color: isCurrent ? BRAND_COLOR : undefined }} />
                        )}
                      </span>
                      <span
                        className={`ml-2 text-sm font-medium hidden md:inline ${
                          isCurrent || isCompleted
                            ? 'text-on-surface'
                            : 'text-on-surface-variant/50'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>

            <button
              onClick={handleClose}
              className="text-sm text-on-surface-variant hover:text-error transition-colors flex items-center gap-1"
              title="Close (Esc)"
            >
              <Icon name="x" className="w-4 h-4" />
              <span className="hidden md:inline">{isActiveState ? 'Cancel' : 'Close'}</span>
            </button>
          </nav>
        </div>

        {/* Step content */}
        <div className="p-6">{renderStep()}</div>
      </div>
    </>
  );
}
