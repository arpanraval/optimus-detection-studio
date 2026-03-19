/**
 * ResultsStep - Shows import results and summary
 * Features categorized errors, copy error report, and duration timeline
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useBulkImportContext } from '../../../context/BulkImportContext';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../Icon';
import { ROUTES } from '../../../router/routes';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabaseClient';
import { useDetectionPatterns } from '../../../hooks/useDetectionPatterns';
import { CategorizedError, ImportErrorCategory } from '../../../services/bulk-import/types';
import {
  categorizeError,
  getCategoryDisplayInfo,
  generateErrorReport,
} from '../../../services/bulk-import/utils/errorCategorizer';
import { formatDurationMs } from '../../../services/bulk-import/utils/progressCalculator';

const COLORS = {
  success: '#4D7C6F',
  failure: '#A63D40',
  brand: '#783264',
  muted: '#78326420',
};

export function ResultsStep() {
  const { result, reset, job, progress, embeddingStrategy } = useBulkImportContext();
  const navigate = useNavigate();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const { extractAndStore } = useDetectionPatterns();

  // Trigger pattern extraction after successful import — non-blocking, non-fatal
  useEffect(() => {
    if (!result || result.importedDetectionIds.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: detections } = await supabase
          .from('detections')
          .select('id, "mitreAttackIds", "mitreTactics", "logSources", platforms, queries, "queryLanguage", "detectionQuery", source, severity')
          .in('id', result.importedDetectionIds);

        if (!detections || detections.length === 0 || cancelled) return;

        const count = await extractAndStore(detections, user.id);
        console.log(`[BulkImport] Extracted patterns for ${count} detections`);
      } catch (err) {
        console.warn('[BulkImport] Pattern extraction failed (non-fatal):', err);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.importedDetectionIds]);

  if (!result) {
    return (
      <div className="text-center py-12">
        <p className="text-on-surface-variant">No import results available</p>
      </div>
    );
  }

  const isSuccess = result.failureCount === 0;
  const duration = formatDurationMs(result.duration);

  // Categorize failed rules
  const categorizedFailedRules = useMemo(() => {
    return result.failedRules.map((rule) => ({
      ...rule,
      categorizedError: rule.categorizedError || categorizeError(rule.error, {
        ruleTitle: rule.title,
      }),
    }));
  }, [result.failedRules]);

  // Group by category
  const groupedErrors = useMemo(() => {
    const groups = new Map<ImportErrorCategory, typeof categorizedFailedRules>();
    for (const rule of categorizedFailedRules) {
      const cat = rule.categorizedError.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(rule);
    }
    return groups;
  }, [categorizedFailedRules]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleCopyErrorReport = async () => {
    const report = generateErrorReport(categorizedFailedRules);
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleViewLibrary = () => {
    navigate(ROUTES.LIBRARY);
  };

  const handleImportMore = () => {
    reset();
  };

  // Build pipeline summary
  const pipelineSummary = useMemo(() => {
    const parts: string[] = [];
    if (progress?.totalFiles) parts.push(`fetched ${progress.totalFiles.toLocaleString()} files`);
    if (progress?.totalRules) parts.push(`parsed ${progress.totalRules.toLocaleString()} rules`);
    parts.push(`imported ${result.successCount.toLocaleString()}`);
    return parts.join(' -> ');
  }, [progress, result]);

  return (
    <div className="space-y-8">
      {/* Success/failure banner */}
      <div
        className="p-6 rounded-[16px] border"
        style={{
          backgroundColor: isSuccess ? `${COLORS.success}15` : `${COLORS.failure}15`,
          borderColor: isSuccess ? `${COLORS.success}40` : `${COLORS.failure}40`,
        }}
      >
        <div className="flex items-center">
          <div
            className="p-3 rounded-full"
            style={{ backgroundColor: isSuccess ? `${COLORS.success}25` : `${COLORS.failure}25` }}
          >
            <Icon
              name={isSuccess ? 'check-circle' : 'alert-triangle'}
              className="w-6 h-6"
              style={{ color: isSuccess ? COLORS.success : COLORS.failure }}
            />
          </div>
          <div className="ml-4">
            <h3
              className="text-lg font-semibold"
              style={{ color: isSuccess ? COLORS.success : COLORS.failure }}
            >
              {isSuccess ? 'Import Successful!' : 'Import Completed with Issues'}
            </h3>
            <p className="text-sm text-on-surface-variant mt-1">
              Completed in {duration}: {pipelineSummary}
            </p>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div
          className="rounded-[12px] p-4 text-center"
          style={{ backgroundColor: `${COLORS.success}20` }}
        >
          <p className="text-3xl font-bold" style={{ color: COLORS.success }}>{result.successCount}</p>
          <p className="text-sm text-on-surface-variant mt-1">Imported</p>
        </div>
        <div className="bg-surface-container rounded-[12px] p-4 text-center">
          <p className="text-3xl font-bold text-on-surface-variant">{result.skipCount}</p>
          <p className="text-sm text-on-surface-variant mt-1">Skipped</p>
        </div>
        <div
          className="rounded-[12px] p-4 text-center"
          style={{ backgroundColor: `${COLORS.failure}20` }}
        >
          <p className="text-3xl font-bold" style={{ color: COLORS.failure }}>{result.failureCount}</p>
          <p className="text-sm text-on-surface-variant mt-1">Failed</p>
        </div>
        <div
          className="rounded-[12px] p-4 text-center"
          style={{ backgroundColor: COLORS.muted }}
        >
          <p className="text-3xl font-bold" style={{ color: COLORS.brand }}>{result.totalProcessed}</p>
          <p className="text-sm text-on-surface-variant mt-1">Total Processed</p>
        </div>
      </div>

      {/* Embedding outcome callout */}
      {embeddingStrategy === 'realtime' && progress?.embeddingGenerated != null && (
        <div
          className="flex items-center gap-3 p-4 rounded-[12px] border"
          style={{ backgroundColor: `${COLORS.success}10`, borderColor: `${COLORS.success}30` }}
        >
          <Icon name="check-circle" className="w-5 h-5 flex-shrink-0" style={{ color: COLORS.success }} />
          <p className="text-sm text-on-surface">
            Generated {progress.embeddingGenerated} embeddings
            {(progress.embeddingErrors ?? 0) > 0 && (
              <span className="text-on-surface-variant">
                {' '}({progress.embeddingErrors} failed — backfill from{' '}
                <Link to={ROUTES.MITRE_SYNC} className="underline hover:text-on-surface" style={{ color: COLORS.brand }}>Data Sync</Link>)
              </span>
            )}
          </p>
        </div>
      )}
      {embeddingStrategy === 'batch' && (
        <div
          className="flex items-center gap-3 p-4 rounded-[12px] border"
          style={{ backgroundColor: `${COLORS.brand}08`, borderColor: `${COLORS.brand}25` }}
        >
          <Icon name="zap" className="w-5 h-5 flex-shrink-0" style={{ color: COLORS.brand }} />
          <p className="text-sm text-on-surface">
            Batch embedding job submitted — track progress on the{' '}
            <Link to={ROUTES.MITRE_SYNC} className="font-medium underline hover:opacity-80" style={{ color: COLORS.brand }}>Data Sync page</Link>
          </p>
        </div>
      )}
      {embeddingStrategy === 'skip' && (
        <div className="flex items-center gap-3 p-4 rounded-[12px] border border-outline-variant/30 bg-surface-container">
          <Icon name="clock" className="w-5 h-5 flex-shrink-0 text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">
            Embeddings skipped — create them from the{' '}
            <Link to={ROUTES.MITRE_SYNC} className="font-medium underline hover:text-on-surface" style={{ color: COLORS.brand }}>Data Sync page</Link>
            {' '}when ready
          </p>
        </div>
      )}

      {/* Categorized failed rules */}
      {categorizedFailedRules.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-on-surface">
              Failed Rules ({categorizedFailedRules.length})
            </h4>
            <button
              onClick={handleCopyErrorReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors"
            >
              <Icon name={copied ? 'check' : 'clipboard'} className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy Error Report'}
            </button>
          </div>

          <div className="space-y-2">
            {Array.from(groupedErrors.entries()).map(([category, rules]) => {
              const info = getCategoryDisplayInfo(category);
              const isExpanded = expandedCategories.has(category);

              return (
                <div
                  key={category}
                  className="rounded-[12px] border overflow-hidden"
                  style={{ borderColor: `${info.color}30` }}
                >
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container/50 transition-colors"
                    style={{ borderLeft: `4px solid ${info.color}` }}
                  >
                    <Icon name={info.icon} className="w-4 h-4" style={{ color: info.color }} />
                    <span className="text-sm font-medium text-on-surface flex-1">{info.label}</span>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${info.color}20`, color: info.color }}
                    >
                      {rules.length}
                    </span>
                    <Icon
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      className="w-4 h-4 text-on-surface-variant"
                    />
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t" style={{ borderColor: `${info.color}15` }}>
                      {rules.slice(0, 50).map((rule, idx) => (
                        <div
                          key={idx}
                          className="px-4 py-3 text-sm border-b last:border-b-0"
                          style={{ borderColor: `${info.color}10`, borderLeft: `4px solid ${info.color}` }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-on-surface truncate">{rule.title}</p>
                              <p className="text-xs text-on-surface-variant mt-0.5">
                                {rule.categorizedError.message}
                              </p>
                            </div>
                            <span
                              className="text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0"
                              style={{ backgroundColor: `${info.color}15`, color: info.color }}
                            >
                              {rule.categorizedError.suggestion}
                            </span>
                          </div>
                        </div>
                      ))}
                      {rules.length > 50 && (
                        <div className="px-4 py-2 text-xs text-center text-on-surface-variant">
                          ... and {rules.length - 50} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skipped rules list */}
      {result.skippedRules.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-on-surface mb-2">
            Skipped Rules ({result.skippedRules.length})
          </h4>
          <div className="bg-surface-container rounded-[12px] border border-outline-variant/30 overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-variant/50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-on-surface-variant font-medium">Rule</th>
                  <th className="text-left px-4 py-2 text-on-surface-variant font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.skippedRules.slice(0, 20).map((rule, index) => (
                  <tr key={index} className="border-t border-outline-variant/20">
                    <td className="px-4 py-2 text-on-surface">{rule.title}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{rule.reason}</td>
                  </tr>
                ))}
                {result.skippedRules.length > 20 && (
                  <tr className="border-t border-outline-variant/20">
                    <td colSpan={2} className="px-4 py-2 text-on-surface-variant text-center">
                      ... and {result.skippedRules.length - 20} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-outline-variant/30">
        <p className="text-sm text-on-surface-variant">Completed in {duration}</p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(ROUTES.IMPORT_HISTORY)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
          >
            <Icon name="history" className="w-4 h-4" />
            View History
          </button>
          <button
            onClick={handleImportMore}
            className="flex items-center gap-2 px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
          >
            <Icon name="refresh-cw" className="w-4 h-4" />
            Import More
          </button>
          <button
            onClick={handleViewLibrary}
            className="flex items-center gap-2 px-6 py-2 text-white rounded-full font-medium hover:opacity-90 transition-colors"
            style={{ backgroundColor: COLORS.brand }}
          >
            View in Library
            <Icon name="external-link" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
