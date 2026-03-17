/**
 * MinimizedImportBar - Compact progress bar shown when import is minimized
 * Uses app's M3 design system
 *
 * Shows at the bottom of the screen when user minimizes the import wizard
 * while an import operation is in progress.
 */

import React from 'react';
import { ImportJobStatus, ImportProgress } from '../../services/bulk-import/types';
import { Icon } from '../Icon';

interface MinimizedImportBarProps {
  /** Current import status */
  status: ImportJobStatus;
  /** Progress data */
  progress: ImportProgress | null;
  /** Source name (file name, repo URL) */
  sourceName?: string;
  /** Total rules being imported */
  totalRules: number;
  /** Called when user clicks to expand */
  onExpand: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  fetching: 'Fetching files...',
  parsing: 'Parsing rules...',
  validating: 'Validating...',
  inserting: 'Importing...',
};

export function MinimizedImportBar({
  status,
  progress,
  sourceName,
  totalRules,
  onExpand,
  onCancel,
}: MinimizedImportBarProps) {
  // Calculate progress percentage
  const getProgressPercent = () => {
    if (!progress) return 0;

    switch (status) {
      case 'fetching':
      case 'parsing':
        return progress.totalFiles > 0
          ? (progress.processedFiles / progress.totalFiles) * 100
          : 0;
      case 'validating':
        return progress.totalRules > 0
          ? (progress.validRules / progress.totalRules) * 100
          : 0;
      case 'inserting':
        return totalRules > 0
          ? (progress.insertedRules / totalRules) * 100
          : 0;
      default:
        return 0;
    }
  };

  const percent = getProgressPercent();
  const isActive = ['fetching', 'parsing', 'validating', 'inserting'].includes(status);

  if (!isActive) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4">
      <div className="bg-surface-container-high border border-outline-variant/30 rounded-full shadow-xl px-4 py-2 flex items-center gap-4 min-w-[400px]">
        {/* Pulse indicator */}
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-primary animate-ping opacity-50" />
        </div>

        {/* Status text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-on-surface">
              {STATUS_LABELS[status] || 'Processing...'}
            </span>
            {sourceName && (
              <span className="text-xs text-on-surface-variant truncate max-w-[150px]">
                {sourceName}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-1 h-1 bg-surface-variant rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Progress text */}
        <div className="text-sm text-on-surface-variant">
          {status === 'inserting' && progress
            ? `${progress.insertedRules}/${totalRules}`
            : `${Math.round(percent)}%`}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 border-l border-outline-variant/30 pl-3">
          <button
            onClick={onExpand}
            className="p-1.5 hover:bg-surface-container rounded-full transition-colors"
            title="Expand"
          >
            <Icon name="maximize-2" className="w-4 h-4 text-on-surface-variant" />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-error-container/30 rounded-full transition-colors"
            title="Cancel"
          >
            <Icon name="x" className="w-4 h-4 text-on-surface-variant hover:text-error" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default MinimizedImportBar;
