/**
 * ImportProgressStep - Shows progress during database import
 * Includes ETA, elapsed time, throughput, and cancel confirmation
 */

import React, { useState, useMemo } from 'react';
import { useBulkImportContext } from '../../../context/BulkImportContext';
import {
  calculateCompositeProgress,
  calculateETA,
  formatDuration,
  calculateThroughput,
} from '../../../services/bulk-import/utils/progressCalculator';
import { Icon } from '../../Icon';

const BRAND_COLOR = '#783264';

export function ImportProgressStep() {
  const { progress, abort, embeddingStrategy } = useBulkImportContext();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const isEmbedding = progress?.phase === 'embedding';
  const isBatchEmbedding = isEmbedding && embeddingStrategy === 'batch';
  const compositePercent = progress ? calculateCompositeProgress(progress) : 0;
  const eta = progress ? calculateETA(progress) : null;
  const throughput = progress ? calculateThroughput(progress) : null;

  const elapsed = useMemo(() => {
    if (!progress?.startedAt) return null;
    const ms = Date.now() - new Date(progress.startedAt).getTime();
    return formatDuration(Math.round(ms / 1000));
  }, [progress?.startedAt, progress?.insertedRules, progress?.embeddingGenerated]); // re-calc on progress

  const batchInfo =
    progress?.currentBatch && progress?.totalBatches
      ? `Batch ${progress.currentBatch} of ${progress.totalBatches}`
      : '';

  const handleCancel = () => {
    if (showCancelConfirm) {
      abort();
      setShowCancelConfirm(false);
    } else {
      setShowCancelConfirm(true);
    }
  };

  return (
    <div className="space-y-8">
      {/* Progress header */}
      <div className="text-center">
        <h3 className="text-xl font-semibold text-on-surface">
          {isBatchEmbedding
            ? 'Submitting Batch Embedding Job...'
            : isEmbedding
              ? 'Generating Embeddings...'
              : 'Importing Detection Rules...'}
        </h3>
        <p className="text-sm text-on-surface-variant mt-2">
          {isBatchEmbedding
            ? 'Embeddings will be processed asynchronously at 50% cost'
            : isEmbedding
              ? 'Creating vector embeddings for semantic search'
              : 'Inserting selected rules into your library'}
        </p>
      </div>

      {/* Phase and timing info */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {elapsed && (
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-surface-container text-on-surface-variant">
            Elapsed: {elapsed}
          </span>
        )}
        {eta !== null && eta > 0 && (
          <span className="text-xs font-medium px-3 py-1 rounded-full text-on-surface-variant" style={{ backgroundColor: `${BRAND_COLOR}15` }}>
            ~{formatDuration(eta)} remaining
          </span>
        )}
        {throughput !== null && (
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-surface-container text-on-surface-variant">
            ~{throughput} rules/sec
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-surface-variant rounded-full h-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r"
          style={{
            width: `${compositePercent}%`,
            backgroundImage: `linear-gradient(to right, ${BRAND_COLOR}, ${BRAND_COLOR}CC)`,
          }}
        />
      </div>

      {/* Progress details */}
      <div className="text-center">
        <p className="text-5xl font-bold text-on-surface">{compositePercent}%</p>
        {batchInfo && <p className="text-sm text-on-surface-variant mt-2">{batchInfo}</p>}
      </div>

      {/* Stats */}
      {progress && !isEmbedding && (
        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
          <div className="rounded-[12px] p-4 text-center" style={{ backgroundColor: `${BRAND_COLOR}20` }}>
            <p className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>{progress.insertedRules}</p>
            <p className="text-xs text-on-surface-variant mt-1">Imported</p>
          </div>
          <div className="bg-surface-container rounded-[12px] p-4 text-center">
            <p className="text-2xl font-bold text-on-surface-variant">
              {progress.totalRules - progress.insertedRules - progress.failedInserts}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">Remaining</p>
          </div>
          <div className="bg-error-container/30 rounded-[12px] p-4 text-center">
            <p className="text-2xl font-bold text-error">{progress.failedInserts}</p>
            <p className="text-xs text-on-surface-variant mt-1">Failed</p>
          </div>
        </div>
      )}

      {/* Embedding stats */}
      {progress && isEmbedding && (
        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
          <div className="rounded-[12px] p-4 text-center" style={{ backgroundColor: `${BRAND_COLOR}20` }}>
            <p className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>{progress.embeddingGenerated || 0}</p>
            <p className="text-xs text-on-surface-variant mt-1">Embedded</p>
          </div>
          <div className="bg-surface-container rounded-[12px] p-4 text-center">
            <p className="text-2xl font-bold text-on-surface-variant">
              {(progress.embeddingTotal || 0) - (progress.embeddingGenerated || 0) - (progress.embeddingErrors || 0)}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">Remaining</p>
          </div>
          <div className="bg-error-container/30 rounded-[12px] p-4 text-center">
            <p className="text-2xl font-bold text-error">{progress.embeddingErrors || 0}</p>
            <p className="text-xs text-on-surface-variant mt-1">Failed</p>
          </div>
        </div>
      )}

      {/* Loading animation */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-surface-variant rounded-full" />
          <div
            className="absolute top-0 left-0 w-16 h-16 border-4 rounded-full animate-spin border-t-transparent"
            style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }}
          />
        </div>
      </div>

      {/* Cancel button with confirmation */}
      <div className="flex flex-col items-center gap-2">
        {showCancelConfirm ? (
          <div className="flex items-center gap-3 p-3 rounded-[12px] bg-error-container/20 border border-error/20">
            <p className="text-sm text-error">Cancel import? Already imported rules will remain.</p>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium bg-error text-on-error rounded-full"
            >
              Confirm Cancel
            </button>
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface"
            >
              Keep Going
            </button>
          </div>
        ) : (
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-error hover:bg-error-container/20 rounded-full transition-colors flex items-center gap-2"
          >
            <Icon name="x" className="w-4 h-4" />
            Cancel Import
          </button>
        )}
      </div>
    </div>
  );
}
