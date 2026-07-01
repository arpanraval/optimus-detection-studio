import React, { useState, useMemo } from 'react';
import { Detection, DetectionQuery } from '../../../types';
import { Icon } from '../../Icon';
import { MonacoCodeEditor } from '../../MonacoCodeEditor';
import { DetailCard } from '../DetailCard';
import { FormattedText } from '../../optimus/FormattedText';

interface PreflightSummary {
  hit_count: number | null;
  status: string;
}

interface DetectionLogicTabProps {
  detection: Detection;
  preflight?: {
    canRun: boolean;
    onRun: () => void;
    latest?: PreflightSummary | null;
    targetLabel?: string;
    statusLabel?: (status: string) => string | undefined;
  };
}


export const DetectionLogicTab: React.FC<DetectionLogicTabProps> = ({ detection, preflight }) => {
  const queries = useMemo((): DetectionQuery[] => {
    if (detection.queries && detection.queries.length > 0) {
      return detection.queries;
    }
    
    if (detection.detectionQuery) {
      return [{
        id: 'legacy',
        language: detection.queryLanguage || 'SPL',
        query: detection.detectionQuery,
        explanation: detection.queryExplanation,
        isPrimary: true,
        createdDate: detection.createdDate,
        updatedDate: detection.updatedDate
      }];
    }
    
    return [];
  }, [detection]);

  const [activeQueryId, setActiveQueryId] = useState<string>(
    queries.find(q => q.isPrimary)?.id || queries[0]?.id || ''
  );
  
  const activeQuery = queries.find(q => q.id === activeQueryId);

  const preflightStatusText = preflight?.latest
    ? preflight.latest.hit_count !== null
      ? `${preflight.latest.hit_count.toLocaleString()} hits`
      : (preflight.statusLabel?.(preflight.latest.status) ?? preflight.latest.status)
    : null;

  const headerRight = preflight?.canRun ? (
    <div className="flex items-center gap-2">
      {preflightStatusText && (
        <span
          className="rounded-md bg-surface-container-high px-2 py-0.5 text-[11px] text-on-surface-variant"
          title={preflight?.targetLabel ? `Last pre-flight against ${preflight.targetLabel}` : 'Last pre-flight'}
        >
          Last run: {preflightStatusText}
        </span>
      )}
      <button
        onClick={preflight.onRun}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary/90"
        title={preflight?.targetLabel ? `Pre-flight against ${preflight.targetLabel}` : 'Run pre-flight test'}
      >
        <Icon name="play" className="h-3.5 w-3.5" />
        Run pre-flight
      </button>
    </div>
  ) : undefined;

  const hasMultipleQueries = queries.length > 1;

  return (
    <div className="animate-fade-in space-y-6">

      {/* Logic Card */}
      <DetailCard title="Detection Logic" headerRight={headerRight}>

        {/* Editor */}
        {activeQuery ? (
            <div className="bg-surface-container border border-outline-variant/30 rounded-xl overflow-hidden shadow-sm h-[500px] flex flex-col">
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-container-high border-b border-outline-variant/30">
                    {hasMultipleQueries ? (
                        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                            {queries.map(query => {
                                const isActive = activeQueryId === query.id;
                                return (
                                    <button
                                        key={query.id}
                                        onClick={() => setActiveQueryId(query.id)}
                                        className={`inline-flex items-center gap-1.5 h-6 px-2 rounded text-[10.5px] font-semibold uppercase tracking-wider font-mono transition-colors whitespace-nowrap ${
                                            isActive
                                                ? 'bg-primary/12 text-primary'
                                                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                                        }`}
                                        title={query.isPrimary ? `${query.language} · Primary` : query.language}
                                    >
                                        <span>{query.language}</span>
                                        {query.isPrimary && (
                                            <span className="w-1 h-1 rounded-full bg-yellow-500" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-1.5">
                            <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider font-mono">
                                {activeQuery.language}
                            </span>
                            {activeQuery.isPrimary && (
                                <span className="w-1 h-1 rounded-full bg-yellow-500" title="Primary Query" />
                            )}
                        </div>
                    )}
                    <button
                        className="p-1.5 hover:bg-surface-variant rounded text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
                        onClick={() => navigator.clipboard.writeText(activeQuery.query)}
                        title="Copy Query"
                    >
                        <Icon name="copy" className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 relative">
                    <MonacoCodeEditor
                        value={activeQuery.query}
                        language={activeQuery.language}
                        readOnly
                    />
                </div>
            </div>
        ) : (
            <div className="flex items-center justify-center py-12 bg-surface-container rounded-xl border border-dashed border-outline-variant/30">
                <p className="text-sm text-on-surface-variant">No detection logic available to display.</p>
            </div>
        )}
      </DetailCard>

      {/* Analysis Card */}
      {activeQuery && (activeQuery.explanation || (detection.prerequisites && detection.prerequisites.length > 0)) && (
          <DetailCard title="Logic Analysis & Context">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Explanation */}
                  <div className="lg:col-span-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">Logic Breakdown</h4>
                      {activeQuery.explanation ? (
                          <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/20">
                              <FormattedText text={activeQuery.explanation} className="text-on-surface" />
                          </div>
                      ) : (
                          <p className="text-sm text-on-surface-variant italic">No explanation provided.</p>
                      )}
                  </div>

                  {/* Prerequisites */}
                  <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">Technical Prerequisites</h4>
                      {detection.prerequisites && detection.prerequisites.length > 0 ? (
                          <ul className="space-y-2 bg-surface-container rounded-xl p-4 border border-outline-variant/20">
                              {detection.prerequisites.map((prereq, i) => (
                                  <li key={i} className="flex items-start gap-2.5 text-sm">
                                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></div>
                                      <span className="text-on-surface">{prereq}</span>
                                  </li>
                              ))}
                          </ul>
                      ) : (
                          <p className="text-sm text-on-surface-variant italic">No prerequisites listed.</p>
                      )}
                  </div>
              </div>
          </DetailCard>
      )}

    </div>
  );
};