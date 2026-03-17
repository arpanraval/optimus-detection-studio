/**
 * InterruptedImportBanner - Non-blocking banner for interrupted imports
 *
 * Shown at the top of page content when an interrupted import is detected
 * in the database on app load. Offers Resume or Discard & Rollback actions.
 */

import React, { useState } from 'react';
import { useGlobalImport } from '../../context/GlobalImportContext';

export function InterruptedImportBanner(): React.JSX.Element | null {
  const {
    interruptedJob,
    resumeImport,
    rollbackImport,
    dismissInterruptedJob,
  } = useGlobalImport();

  const [isResuming, setIsResuming] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  if (!interruptedJob) return null;

  async function handleResume(): Promise<void> {
    setIsResuming(true);
    try {
      await resumeImport(interruptedJob!.jobId);
    } finally {
      setIsResuming(false);
    }
  }

  async function handleDiscard(): Promise<void> {
    const confirmed = window.confirm(
      'This will permanently roll back all rules inserted by this import. Continue?'
    );
    if (!confirmed) return;

    setIsDiscarding(true);
    try {
      await rollbackImport(interruptedJob!.jobId);
      await dismissInterruptedJob(interruptedJob!.jobId);
    } finally {
      setIsDiscarding(false);
    }
  }

  const { sourceName, insertedCount, totalCount } = interruptedJob;

  return (
    <div className="mx-4 mt-4 mb-2 flex items-center justify-between gap-4 bg-primary/5 border border-primary/20 rounded-xl px-5 py-3">
      <p className="text-sm">
        <span className="font-semibold text-on-surface">
          You have an interrupted import:
        </span>{' '}
        <span className="text-on-surface-variant">
          {sourceName} ({insertedCount} of ~{totalCount} rules)
        </span>
      </p>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleResume}
          disabled={isResuming || isDiscarding}
          className="px-4 py-1.5 text-sm font-medium bg-primary/10 text-on-primary-container hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
        >
          {isResuming ? 'Resuming...' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={isResuming || isDiscarding}
          className="px-4 py-1.5 text-sm font-medium text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-50"
        >
          {isDiscarding ? 'Rolling back...' : 'Discard & Rollback'}
        </button>
      </div>
    </div>
  );
}
