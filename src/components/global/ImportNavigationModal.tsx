/**
 * ImportNavigationModal - Intercepts navigation during active imports
 *
 * Shown when the user attempts to navigate away while an import is running
 * (and the import is NOT minimized). Offers three options:
 * - Continue in Background (minimize + proceed)
 * - Stop Import (abort + proceed)
 * - Stay Here (cancel navigation)
 */

import React from 'react';
import { useGlobalImport } from '../../context/GlobalImportContext';

interface ImportNavigationModalProps {
  isOpen: boolean;
  onStay: () => void;
  onBackground: () => void;
  onStop: () => void;
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

export function ImportNavigationModal({
  isOpen,
  onStay,
  onBackground,
  onStop,
}: ImportNavigationModalProps): React.JSX.Element | null {
  const { progress, navigationBlocker } = useGlobalImport();

  if (!isOpen) return null;

  // During onboarding processing (fetch/parse/validate), the work is in-memory
  // and can't survive navigation. "Continue in Background" is only possible
  // during the insert phase (managed by GlobalImportContext).
  const isOnboardingProcessing = navigationBlocker.activeBlockerId === 'onboarding-processing';
  const canRunInBackground = !isOnboardingProcessing;

  const totalRules = progress?.totalRules ?? 0;
  const insertedRules = progress?.insertedRules ?? 0;
  const percent = totalRules > 0 ? Math.round((insertedRules / totalRules) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-surface-container border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <h2 className="text-on-surface font-medium text-lg">
          {isOnboardingProcessing
            ? 'Onboarding In Progress'
            : `Import Running (${formatCount(insertedRules)} / ${formatCount(totalRules)})`
          }
        </h2>

        {/* Progress bar — only show during insert phase */}
        {canRunInBackground && (
          <>
            <div className="mt-3 h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-on-surface-variant tabular-nums">
              {percent}% complete
            </p>
          </>
        )}

        {isOnboardingProcessing && (
          <p className="mt-3 text-xs text-on-surface-variant">
            Rules are being fetched and parsed. Leaving now will lose all progress.
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3">
          {canRunInBackground && (
            <button
              onClick={onBackground}
              className="w-full bg-primary/10 text-on-primary-container hover:bg-primary/20 rounded-xl px-4 py-3 text-left transition-colors"
            >
              <span className="text-sm font-medium">Continue in Background</span>
              <span className="block text-xs text-on-surface-variant mt-0.5">
                The import keeps running while you navigate freely.
              </span>
            </button>
          )}

          <button
            onClick={onStop}
            className="w-full text-error hover:bg-error/5 rounded-xl px-4 py-3 text-left transition-colors"
          >
            <span className="text-sm font-medium">{isOnboardingProcessing ? 'Leave & Lose Progress' : 'Stop Import'}</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">
              {isOnboardingProcessing
                ? 'All fetched and parsed rules will be lost. Nothing has been saved yet.'
                : 'Cancel the import. Rules already inserted remain in your library.'
              }
            </span>
          </button>

          <button
            onClick={onStay}
            className="w-full text-on-surface-variant hover:text-on-surface rounded-xl px-4 py-3 text-left transition-colors"
          >
            <span className="text-sm font-medium">Stay Here</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">
              Go back to the onboarding page and keep watching progress.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportNavigationModal;
