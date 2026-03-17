/**
 * ReconnaissanceStep - Pre-import analysis step
 * Scans the source to show file counts, estimated rules, and rate limit status
 */

import React, { useEffect, useState } from 'react';
import { useBulkImportContext } from '../../../context/BulkImportContext';
import { ReconReport } from '../../../services/bulk-import/types';
import { Icon } from '../../Icon';

const BRAND_COLOR = '#783264';

export function ReconnaissanceStep() {
  const {
    runReconnaissance,
    reconReport,
    runToPreview,
    setCurrentStep,
    job,
    githubToken,
    setGithubToken,
    saveGithubToken,
  } = useBulkImportContext();

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenValue, setTokenValue] = useState(githubToken || '');
  const [showToken, setShowToken] = useState(false);

  const isGitHub = job?.config.sourceType === 'github';

  // Auto-run reconnaissance on mount
  useEffect(() => {
    let cancelled = false;

    async function scan() {
      setScanning(true);
      setError(null);
      try {
        await runReconnaissance();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Scan failed');
        }
      } finally {
        if (!cancelled) setScanning(false);
      }
    }

    scan();
    return () => { cancelled = true; };
  }, [runReconnaissance]);

  const handleProceed = async () => {
    setProceeding(true);
    setError(null);
    try {
      setCurrentStep('parsing');
      const rules = await runToPreview();

      // Double-check: don't navigate to preview if no rules were produced
      if (rules.length === 0) {
        setError('No rules were parsed. The source may be empty, or all files failed to fetch (check rate limits).');
        setCurrentStep('recon');
        return;
      }

      setCurrentStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process files');
      setCurrentStep('recon');
    } finally {
      setProceeding(false);
    }
  };

  const handleBack = () => {
    setCurrentStep('source');
  };

  const handleApplyToken = async () => {
    if (tokenValue.trim()) {
      setGithubToken(tokenValue.trim());
      // Update job config
      if (job) {
        job.config.githubToken = tokenValue.trim();
      }
      // Re-run reconnaissance with the new token
      setScanning(true);
      setError(null);
      try {
        await runReconnaissance();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rescan failed');
      } finally {
        setScanning(false);
      }
    }
  };

  const handleSaveToken = () => {
    if (tokenValue.trim()) {
      saveGithubToken(tokenValue.trim());
    }
  };

  if (scanning) {
    return (
      <div className="space-y-6 py-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: `${BRAND_COLOR}20` }}>
            <div className="relative">
              <div className="w-10 h-10 border-4 border-surface-variant rounded-full" />
              <div
                className="absolute top-0 left-0 w-10 h-10 border-4 rounded-full animate-spin border-t-transparent"
                style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }}
              />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-on-surface">Scanning Source...</h3>
          <p className="text-sm text-on-surface-variant mt-2">
            Analyzing repository structure and file contents
          </p>
        </div>
      </div>
    );
  }

  if (error && !reconReport) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-[16px] bg-error-container/20 border border-error/30">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-error-container/30">
              <Icon name="alert-circle" className="w-6 h-6 text-error" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-error">Scan Failed</h3>
              <p className="text-sm text-on-surface-variant mt-1">{error}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-between">
          <button onClick={handleBack} className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
            Back
          </button>
        </div>
      </div>
    );
  }

  const report = reconReport;
  if (!report) return null;

  const willExceedLimit = report.rateLimitInfo?.willExceedLimit;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-xl font-semibold text-on-surface">Source Analysis</h3>
        <p className="text-sm text-on-surface-variant mt-1">
          {isGitHub && report.repoInfo
            ? `${report.repoInfo.owner}/${report.repoInfo.repo}`
            : job?.config.sourceType === 'zip'
            ? job.config.sourceZip?.name
            : `${job?.config.sourceFiles?.length || 0} files`}
        </p>
      </div>

      {/* Cards */}
      <div className={`grid gap-4 ${isGitHub ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
        {/* Scope card */}
        <div className="rounded-[16px] border border-outline-variant/30 p-5 bg-surface-container">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-full" style={{ backgroundColor: `${BRAND_COLOR}20` }}>
              <Icon name="file-text" className="w-5 h-5" style={{ color: BRAND_COLOR }} />
            </div>
            <h4 className="font-medium text-on-surface">Scope</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-on-surface-variant">Matching files</span>
              <span className="text-2xl font-bold text-on-surface">{report.matchingFiles.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-on-surface-variant">Estimated rules</span>
              <span className="text-lg font-semibold" style={{ color: BRAND_COLOR }}>~{report.estimatedRules.toLocaleString()}</span>
            </div>
            {report.totalFilesInPath > 0 && report.totalFilesInPath !== report.matchingFiles && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-on-surface-variant">Total files in path</span>
                <span className="text-sm text-on-surface-variant">{report.totalFilesInPath.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Library card */}
        <div className="rounded-[16px] border border-outline-variant/30 p-5 bg-surface-container">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-full bg-secondary-container/30">
              <Icon name="database" className="w-5 h-5 text-secondary" />
            </div>
            <h4 className="font-medium text-on-surface">Library</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-on-surface-variant">Existing detections</span>
              <span className="text-2xl font-bold text-on-surface">{report.existingLibraryCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-on-surface-variant">Duplicate strategy</span>
              <span className="text-sm font-medium text-on-surface capitalize">{job?.config.duplicateStrategy || 'skip'}</span>
            </div>
          </div>
        </div>

        {/* Rate limit card (GitHub only) */}
        {isGitHub && report.rateLimitInfo && (
          <div className={`rounded-[16px] border p-5 ${
            willExceedLimit
              ? 'border-error/30 bg-error-container/10'
              : 'border-outline-variant/30 bg-surface-container'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-full ${willExceedLimit ? 'bg-error-container/30' : 'bg-tertiary-container/30'}`}>
                <Icon name="clock" className={`w-5 h-5 ${willExceedLimit ? 'text-error' : 'text-tertiary'}`} />
              </div>
              <h4 className="font-medium text-on-surface">Rate Limit</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-on-surface-variant">Remaining</span>
                <span className={`text-2xl font-bold ${willExceedLimit ? 'text-error' : 'text-on-surface'}`}>
                  {report.rateLimitInfo.remaining}/{report.rateLimitInfo.limit}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-on-surface-variant">Est. API calls</span>
                <span className="text-sm font-medium text-on-surface">{report.rateLimitInfo.estimatedApiCalls.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${report.rateLimitInfo.authenticated ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-on-surface-variant">
                  {report.rateLimitInfo.authenticated ? 'Authenticated' : 'Unauthenticated'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rate limit warning with inline PAT input */}
      {isGitHub && willExceedLimit && (
        <div className="p-4 rounded-[16px] bg-error-container/20 border border-error/30">
          <div className="flex items-start gap-3">
            <Icon name="alert-triangle" className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-error">
                Estimated API calls ({report.rateLimitInfo!.estimatedApiCalls.toLocaleString()}) exceed remaining rate limit ({report.rateLimitInfo!.remaining}).
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                Add a GitHub Personal Access Token to increase your limit from 60 to 5,000 requests/hour.
              </p>
              {!showTokenInput ? (
                <button
                  onClick={() => setShowTokenInput(true)}
                  className="mt-2 text-sm font-medium hover:underline"
                  style={{ color: BRAND_COLOR }}
                >
                  Add GitHub Token
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={tokenValue}
                      onChange={(e) => setTokenValue(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full pr-20 pl-3 py-2 bg-surface-container border border-outline-variant/30 rounded-[8px] text-sm text-on-surface font-mono placeholder:text-on-surface-variant/50"
                    />
                    <button
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant hover:text-on-surface"
                    >
                      {showToken ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApplyToken}
                      disabled={!tokenValue.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white rounded-full disabled:opacity-50"
                      style={{ backgroundColor: BRAND_COLOR }}
                    >
                      Apply & Rescan
                    </button>
                    <button
                      onClick={handleSaveToken}
                      disabled={!tokenValue.trim()}
                      className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface disabled:opacity-50"
                    >
                      Save for later
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <div className="p-4 rounded-[12px] bg-tertiary-container/20 border border-tertiary/30">
          {report.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <Icon name="alert-triangle" className="w-4 h-4 text-tertiary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-on-surface-variant">{warning}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error from proceeding attempt */}
      {error && (
        <div className="p-4 rounded-[12px] bg-error-container/30 border border-error/30">
          <div className="flex items-center gap-3">
            <Icon name="alert-circle" className="w-5 h-5 text-error" />
            <p className="text-sm text-error">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={handleBack}
          className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex items-center gap-2"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleProceed}
          disabled={proceeding || (report.matchingFiles === 0 && report.source !== 'zip')}
          className={`px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 ${
            proceeding
              ? 'opacity-70 cursor-wait'
              : report.matchingFiles === 0 && report.source !== 'zip'
              ? 'bg-surface-variant text-on-surface-variant/50 cursor-not-allowed'
              : 'text-white hover:opacity-90'
          }`}
          style={!(proceeding || (report.matchingFiles === 0 && report.source !== 'zip')) ? { backgroundColor: BRAND_COLOR } : {}}
        >
          {proceeding ? (
            <>
              <Icon name="spinner" className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Proceed to Import
              <Icon name="arrowRight" className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
