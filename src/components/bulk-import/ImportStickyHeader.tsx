/**
 * ImportStickyHeader - Context bar showing import progress
 * Integrated design with rounded corners
 */

import React from 'react';
import { ImportJobStatus } from '../../services/bulk-import/types';
import { Icon } from '../Icon';

interface ImportStickyHeaderProps {
  sourceType?: 'zip' | 'files' | 'github';
  sourceName?: string;
  totalRules: number;
  validRules: number;
  status: ImportJobStatus;
  targetLibrary?: 'user' | 'universal';
}

const SOURCE_ICONS: Record<string, string> = {
  zip: 'archive',
  files: 'file-text',
  github: 'github',
};

const STATUS_LABELS: Record<ImportJobStatus, string> = {
  idle: 'Ready',
  fetching: 'Extracting Files...',
  parsing: 'Parsing Rules...',
  validating: 'Validating...',
  preview: 'Review & Select',
  inserting: 'Importing...',
  embedding: 'Generating Embeddings...',
  completed: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function ImportStickyHeader({
  sourceType,
  sourceName,
  totalRules,
  validRules,
  status,
  targetLibrary,
}: ImportStickyHeaderProps) {
  // Don't show in idle state or if no meaningful data
  if (status === 'idle' || (!sourceName && totalRules === 0)) return null;

  const isActive = ['fetching', 'parsing', 'validating', 'inserting'].includes(status);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container/50 rounded-[16px] text-sm">
        {/* Left - Source info */}
        <div className="flex items-center gap-3 text-on-surface-variant">
          {sourceType && (
            <div className="flex items-center gap-2">
              <Icon
                name={SOURCE_ICONS[sourceType] || 'file'}
                className="w-4 h-4"
              />
              {sourceName && (
                <span className="truncate max-w-[200px] font-medium text-on-surface">{sourceName}</span>
              )}
            </div>
          )}
          {targetLibrary && (
            <div className="flex items-center gap-1 text-xs text-on-surface-variant">
              <Icon name={targetLibrary === 'universal' ? 'globe' : 'user'} className="w-3 h-3" />
              <span>{targetLibrary === 'universal' ? 'Universal' : 'My Library'}</span>
            </div>
          )}
        </div>

        {/* Center - Status */}
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
          )}
          <span className={`text-xs font-medium ${
            status === 'completed' ? 'text-secondary' : status === 'failed' ? 'text-error' : 'text-on-surface-variant'
          }`}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        {/* Right - Rule counts */}
        <div className="flex items-center gap-4 text-xs">
          {totalRules > 0 && (
            <span className="text-on-surface-variant">
              Rules: <span className="font-semibold text-on-surface">{totalRules}</span>
            </span>
          )}
          {validRules > 0 && status !== 'fetching' && status !== 'parsing' && (
            <span className="text-on-surface-variant">
              Valid: <span className="font-semibold text-secondary">{validRules}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportStickyHeader;
