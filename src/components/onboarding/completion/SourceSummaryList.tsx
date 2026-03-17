import React from 'react';
import { Button } from '../../ui/Button';
import type { SourceState } from '../types';

export interface SourceSummaryListProps {
  sources: SourceState[];
  totalTime?: number; // seconds
  onRetrySource: (sourceId: string) => void;
  onAddMoreSources: () => void;
}

/**
 * SourceSummaryList
 *
 * Compact summary that replaces the expanded source cards after completion.
 * Shows each source with its status (success count or failed + retry),
 * total counts, and an "Add More Sources" action.
 */
export const SourceSummaryList: React.FC<SourceSummaryListProps> = ({
  sources,
  totalTime,
  onRetrySource,
  onAddMoreSources,
}) => {
  const successfulSources = sources.filter((s) => s.status === 'complete');
  const totalImported = sources.reduce((sum, s) => sum + s.importedCount, 0);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatCount = (count: number): string => {
    return count.toLocaleString();
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/20 animate-fade-in">
      {/* Section Header */}
      <h3 className="font-brand text-[11px] tracking-widest uppercase text-on-surface-variant mb-3">
        Sources Onboarded
      </h3>

      {/* Source Rows */}
      <div className="space-y-0">
        {sources.map((sourceState) => {
          const isFailed = sourceState.status === 'error';

          return (
            <div
              key={sourceState.source.id}
              className="flex items-center justify-between py-1.5"
            >
              {/* Left: Status icon + name */}
              <div className="flex items-center gap-2 min-w-0">
                {isFailed ? (
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-error/15 flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-error">
                      <path
                        d="M1 1l6 6M7 1L1 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                ) : (
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-secondary/15 flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-secondary">
                      <path
                        d="M1 4.5L3 6.5L7 1.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                <span className="text-[12px] text-on-surface truncate">
                  {sourceState.source.name}
                </span>
              </div>

              {/* Right: Count or Failed + Retry */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {isFailed ? (
                  <>
                    <span className="text-[12px] text-error">Failed</span>
                    <Button
                      variant="text"
                      color="error"
                      size="sm"
                      className="!h-6 !text-[11px] !px-2"
                      onClick={() => onRetrySource(sourceState.source.id)}
                    >
                      Retry
                    </Button>
                  </>
                ) : (
                  <span className="font-brand text-[13px] font-bold text-on-surface">
                    {formatCount(sourceState.importedCount)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider + Summary */}
      <div className="border-t border-outline-variant/20 mt-3 pt-3">
        <p className="font-brand text-[13px] text-on-surface">
          Total: {formatCount(totalImported)} detections
        </p>
        <p className="text-[11px] text-on-surface-variant mt-0.5">
          From {successfulSources.length}/{sources.length} sources
          {totalTime != null && <> &middot; {formatTime(totalTime)}</>}
        </p>
      </div>

      {/* Add More Sources */}
      <Button
        variant="outlined"
        color="primary"
        size="sm"
        fullWidth
        className="mt-3"
        leadingIcon="plus"
        onClick={onAddMoreSources}
      >
        Add More Sources
      </Button>
    </div>
  );
};

export default SourceSummaryList;
