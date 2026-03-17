/**
 * GlobalImportBar - Floating progress pill for background imports
 *
 * Fixed-bottom-center pill (z-40) visible on ALL pages when an import
 * is running in the background. Follows MinimizedImportBar visual pattern.
 *
 * Shows when: isMinimized OR status is 'complete', AND status is one of
 * importing, paused, resumed, complete, rolling_back.
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalImport, type GlobalImportStatus } from '../../context/GlobalImportContext';
import { Icon } from '../Icon';

/** Statuses that make this bar visible */
const VISIBLE_STATUSES: GlobalImportStatus[] = [
  'importing',
  'paused',
  'resumed',
  'complete',
  'rolling_back',
];

/** Auto-dismiss delay for completion state (ms) */
const COMPLETION_DISMISS_MS = 10_000;

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

function getStatusLabel(status: GlobalImportStatus): string {
  switch (status) {
    case 'importing':
    case 'resumed':
      return 'Importing...';
    case 'paused':
      return 'Paused';
    case 'rolling_back':
      return 'Rolling back...';
    case 'complete':
      return 'Import complete';
    default:
      return 'Processing...';
  }
}

function getPulseDotClass(status: GlobalImportStatus): string {
  switch (status) {
    case 'paused':
      return 'bg-warning';
    case 'complete':
      return 'bg-emerald-500';
    default:
      return 'bg-primary';
  }
}

function getProgressBarClass(status: GlobalImportStatus): string {
  if (status === 'paused') return 'bg-warning';
  return 'bg-primary';
}

interface Props {
  /** Override navigate target when expanding (defaults to /import) */
  importRoute?: string;
}

export function GlobalImportBar({ importRoute = '/import' }: Props): React.JSX.Element | null {
  const navigate = useNavigate();
  const {
    status,
    progress,
    isMinimized,
    importResult,
    activeJob,
    expand,
    abortImport,
  } = useGlobalImport();

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss on completion after 10 seconds
  useEffect(() => {
    if (status === 'complete') {
      dismissTimerRef.current = setTimeout(() => {
        abortImport();
      }, COMPLETION_DISMISS_MS);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [status, abortImport]);

  // Determine visibility
  const isVisible =
    VISIBLE_STATUSES.includes(status) && (isMinimized || status === 'complete');

  if (!isVisible) return null;

  // Progress calculation
  const totalRules = progress?.totalRules ?? 0;
  const insertedRules = progress?.insertedRules ?? 0;
  const percent =
    totalRules > 0 ? Math.round((insertedRules / totalRules) * 100) : 0;

  // Source name from active job
  const sourceName: string =
    activeJob?.sourceUrl ?? activeJob?.sourceVendor ?? '';

  // Handlers
  function handleExpand(): void {
    expand();
    navigate(importRoute);
  }

  function handleDismiss(): void {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    abortImport();
  }

  // Completion view
  if (status === 'complete') {
    const importedCount = importResult?.successCount ?? insertedRules;

    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4">
        <div className="bg-surface-container-high border border-outline-variant/30 rounded-full shadow-xl px-5 py-2.5 flex items-center gap-4 min-w-[400px]">
          {/* Pulse dot */}
          <div className="w-3 h-3 rounded-full bg-emerald-500" />

          {/* Status text */}
          <span className="text-sm font-medium text-on-surface">
            Import complete &mdash; {formatCount(importedCount)} rules imported.
          </span>

          {/* Actions */}
          <div className="flex items-center gap-2 border-l border-outline-variant/30 pl-3">
            <button
              onClick={handleExpand}
              className="text-xs font-medium text-on-primary-container hover:underline"
            >
              View Summary
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 hover:bg-surface-container rounded-full transition-colors"
              title="Dismiss"
            >
              <Icon name="x" className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active / paused / rolling_back view
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4">
      <div className="bg-surface-container-high border border-outline-variant/30 rounded-full shadow-xl px-4 py-2 flex items-center gap-4 min-w-[400px]">
        {/* Pulse indicator */}
        <div className="relative">
          <div className={`w-3 h-3 rounded-full ${getPulseDotClass(status)} ${status !== 'paused' ? 'animate-pulse' : ''}`} />
          {status !== 'paused' && (
            <div className={`absolute inset-0 w-3 h-3 rounded-full ${getPulseDotClass(status)} animate-ping opacity-50`} />
          )}
        </div>

        {/* Status + source */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-on-surface">
              {getStatusLabel(status)}
            </span>
            {sourceName && (
              <span className="text-xs text-on-surface-variant truncate max-w-[150px]">
                {sourceName}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-1 h-1 bg-surface-container rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressBarClass(status)} rounded-full transition-all duration-300`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Percentage + counts */}
        <div className="text-sm tabular-nums text-on-surface-variant whitespace-nowrap">
          {percent}% &nbsp;{formatCount(insertedRules)}/{formatCount(totalRules)}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 border-l border-outline-variant/30 pl-3">
          <button
            onClick={handleExpand}
            className="p-1.5 hover:bg-surface-container rounded-full transition-colors"
            title="Expand"
          >
            <Icon name="maximize-2" className="w-4 h-4 text-on-surface-variant" />
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-error-container/30 rounded-full transition-colors"
            title="Stop"
          >
            <Icon name="x" className="w-4 h-4 text-on-surface-variant hover:text-error" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default GlobalImportBar;
