/**
 * ParsingProgressStep - Shows progress during file parsing
 * Uses composite progress calculation, phase indicators, ETA, and rate limit display
 */

import React from 'react';
import { useBulkImportContext } from '../../../context/BulkImportContext';
import {
  calculateCompositeProgress,
  calculateETA,
  formatDuration,
  getPhaseLabel,
} from '../../../services/bulk-import/utils/progressCalculator';
import { Icon } from '../../Icon';

const BRAND_COLOR = '#783264';

export function ParsingProgressStep() {
  const { status, progress, errors, rateLimitInfo } = useBulkImportContext();

  const compositePercent = progress ? calculateCompositeProgress(progress) : 0;
  const eta = progress ? calculateETA(progress) : null;
  const phaseLabel = getPhaseLabel(status);

  const isParsing = status === 'fetching' || status === 'parsing' || status === 'validating';
  const isFailed = status === 'failed';

  // Rate limit waiting state
  const isWaitingForRateLimit = rateLimitInfo?.isWaiting;

  // Get most recent error for display
  const lastError = errors.length > 0 ? errors[errors.length - 1] : null;

  // If failed, show prominent error
  if (isFailed) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-[16px] bg-error-container/20 border border-error/30">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-error-container/30">
              <Icon name="alert-circle" className="w-6 h-6 text-error" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-error">Processing Failed</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                {lastError?.message || 'An error occurred during processing. Please try again.'}
              </p>
              {lastError?.code && (
                <details className="mt-2">
                  <summary className="text-xs text-on-surface-variant/70 cursor-pointer hover:text-on-surface-variant">Show technical details</summary>
                  <p className="text-xs text-on-surface-variant/70 mt-1 font-mono">{lastError.code}</p>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* Show all errors if multiple */}
        {errors.length > 1 && (
          <div>
            <h4 className="text-sm font-medium text-on-surface-variant mb-2">All Issues ({errors.length})</h4>
            <div className="bg-error-container/10 border border-error/20 rounded-[12px] p-4 max-h-48 overflow-y-auto">
              {errors.map((error, index) => (
                <p key={index} className="text-xs text-error py-1">
                  {error.message}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Suggestion for rate limit errors */}
        {lastError?.message?.toLowerCase().includes('rate limit') && (
          <div className="p-4 rounded-[12px] bg-tertiary-container/20 border border-tertiary/30">
            <div className="flex items-start gap-2">
              <Icon name="info" className="w-4 h-4 text-tertiary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-on-surface-variant">
                <span className="font-medium text-tertiary">Tip:</span> Add a GitHub Personal Access Token in the Source step's Advanced Options to increase your rate limit from 60 to 5,000 requests/hour.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Progress header */}
      <div className="text-center">
        <h3 className="text-xl font-semibold text-on-surface">
          {isWaitingForRateLimit ? 'Waiting for Rate Limit Reset...' : (
            <>
              {status === 'fetching' && 'Fetching Files...'}
              {status === 'parsing' && 'Parsing Detection Rules...'}
              {status === 'validating' && 'Validating Rules...'}
            </>
          )}
        </h3>
        <p className="text-sm text-on-surface-variant mt-2">
          {isWaitingForRateLimit
            ? 'GitHub rate limit reached. Will resume automatically.'
            : 'Please wait while we process your files'}
        </p>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-surface-container text-on-surface-variant">
          Phase: {phaseLabel}
        </span>
        {eta !== null && eta > 0 && (
          <span className="text-xs font-medium px-3 py-1 rounded-full text-on-surface-variant" style={{ backgroundColor: `${BRAND_COLOR}15` }}>
            ~{formatDuration(eta)} remaining
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
        <p className="text-4xl font-bold text-on-surface">{compositePercent}%</p>
        {progress?.currentFile && (
          <p className="text-sm text-on-surface-variant mt-2 truncate max-w-md mx-auto font-mono">
            {progress.currentFile}
          </p>
        )}
      </div>

      {/* Rate limit status bar (GitHub) */}
      {rateLimitInfo && (
        <div className={`flex items-center justify-center gap-3 p-3 rounded-[12px] ${
          isWaitingForRateLimit ? 'bg-error-container/20 border border-error/20' : 'bg-surface-container'
        }`}>
          <Icon name="clock" className={`w-4 h-4 ${isWaitingForRateLimit ? 'text-error' : 'text-on-surface-variant'}`} />
          <span className={`text-sm ${isWaitingForRateLimit ? 'text-error font-medium' : 'text-on-surface-variant'}`}>
            GitHub API: {rateLimitInfo.remaining}/{rateLimitInfo.limit} remaining
          </span>
          {isWaitingForRateLimit && rateLimitInfo.waitingUntil && (
            <span className="text-xs text-error">
              Resets at {rateLimitInfo.waitingUntil.toLocaleTimeString()}
            </span>
          )}
          <div className={`w-2 h-2 rounded-full ${rateLimitInfo.authenticated ? 'bg-green-500' : 'bg-yellow-500'}`} />
        </div>
      )}

      {/* Stats */}
      {progress && progress.totalRules > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-surface-container rounded-[12px] p-4 text-center">
            <p className="text-2xl font-bold text-on-surface">{progress.totalRules}</p>
            <p className="text-xs text-on-surface-variant mt-1">Total Parsed</p>
          </div>
          <div className="rounded-[12px] p-4 text-center" style={{ backgroundColor: `${BRAND_COLOR}20` }}>
            <div className="flex items-center justify-center gap-1">
              <Icon name="check-circle" className="w-5 h-5" style={{ color: BRAND_COLOR }} />
              <p className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>{progress.validRules}</p>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">Valid</p>
          </div>
          <div className="bg-tertiary-container/30 rounded-[12px] p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Icon name="alert-triangle" className="w-5 h-5 text-tertiary" />
              <p className="text-2xl font-bold text-tertiary">{progress.warningRules}</p>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">Warnings</p>
          </div>
          <div className="bg-error-container/30 rounded-[12px] p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Icon name="x-circle" className="w-5 h-5 text-error" />
              <p className="text-2xl font-bold text-error">{progress.errorRules}</p>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">Errors</p>
          </div>
        </div>
      )}

      {/* Recent errors */}
      {errors.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-on-surface-variant mb-2">
            Recent Issues ({errors.length})
          </h4>
          <div className="bg-error-container/20 border border-error/20 rounded-[12px] p-4 max-h-40 overflow-y-auto">
            {errors.slice(-5).map((error, index) => (
              <p key={index} className="text-xs text-error py-1">
                {error.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {isParsing && (
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-surface-variant rounded-full" />
            <div
              className="absolute top-0 left-0 w-16 h-16 border-4 rounded-full animate-spin border-t-transparent"
              style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
