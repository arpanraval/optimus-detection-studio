/**
 * InterruptedImportBanner - Non-blocking banner for interrupted imports
 *
 * Shown at the top of page content when an interrupted import is detected
 * in the database on app load. Interrupted jobs cannot be safely resumed
 * without replaying their exact checkpoint, so only rollback is offered.
 */

import React, { useState } from 'react';
import { useGlobalImport } from '../../context/GlobalImportContext';

export function InterruptedImportBanner(): React.JSX.Element | null {
  const { interruptedJob, rollbackImport, dismissInterruptedJob } = useGlobalImport();

  const [isDiscarding, setIsDiscarding] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  if (!interruptedJob) return null;

  async function handleDiscard(): Promise<void> {
    const confirmed = window.confirm('This will permanently roll back all rules inserted by this import. Continue?');
    if (!confirmed) return;

    setIsDiscarding(true);
    setRollbackError(null);
    try {
      const result = await rollbackImport(interruptedJob!.jobId);
      if (!result.success) {
        throw new Error(result.error || 'Rollback did not complete');
      }
      await dismissInterruptedJob(interruptedJob!.jobId);
    } catch (error) {
      setRollbackError(error instanceof Error ? error.message : 'Rollback failed');
    } finally {
      setIsDiscarding(false);
    }
  }

  const { sourceName, insertedCount, totalCount } = interruptedJob;

  return (
    <div className="mx-4 mt-4 mb-2 flex items-center justify-between gap-4 bg-primary/5 border border-primary/20 rounded-xl px-5 py-3">
      <div>
        <p className="text-sm">
          <span className="font-semibold text-on-surface">You have an interrupted import:</span>{' '}
          <span className="text-on-surface-variant">
            {sourceName} ({insertedCount} of ~{totalCount} rules). Roll it back before starting again.
          </span>
        </p>
        {rollbackError && (
          <p className="mt-1 text-xs text-error" role="alert">
            {rollbackError}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDiscard}
          disabled={isDiscarding}
          className="px-4 py-1.5 text-sm font-medium text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-50"
        >
          {isDiscarding ? 'Rolling back...' : 'Discard & Rollback'}
        </button>
      </div>
    </div>
  );
}
