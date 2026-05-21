import React, { useState, useMemo } from 'react';
import { Detection, DetectionQuery } from '../../../types';
import { Icon } from '../../Icon';
import { MonacoCodeEditor } from '../../MonacoCodeEditor';
import { QUERY_LANGUAGES } from '../../../constants';
import { DetailCard } from '../DetailCard';
import { FormattedText } from '../../optimus/FormattedText';

interface DetectionLogicTabProps {
  detection: Detection;
}


export const DetectionLogicTab: React.FC<DetectionLogicTabProps> = ({ detection }) => {
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

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* Logic Card */}
      <DetailCard title="Detection Logic">
        
        {/* Language Tabs */}
        {queries.length > 0 ? (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto custom-scrollbar pb-2">
                {queries.map(query => (
                <button
                    key={query.id}
                    onClick={() => setActiveQueryId(query.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap border ${
                    activeQueryId === query.id
                        ? 'bg-primary-container text-primary border-primary/30 shadow-sm'
                        : 'bg-surface-container text-on-surface-variant border-outline-variant/20 hover:text-on-surface hover:bg-surface-container-high'
                    }`}
                >
                    {query.language}
                    {query.isPrimary && (
                    <span className="ml-2 w-2 h-2 rounded-full bg-yellow-500" title="Primary Query"></span>
                    )}
                </button>
                ))}
            </div>
        ) : (
            <div className="text-on-surface-variant text-sm italic mb-4">No queries defined.</div>
        )}

        {/* Editor */}
        {activeQuery ? (
            <div className="flex flex-col gap-6">
                <div className="bg-surface-container border border-outline-variant/30 rounded-xl overflow-hidden shadow-sm h-[500px] flex flex-col">
                    <div className="flex items-center justify-between px-4 py-2 bg-surface-container-high border-b border-outline-variant/30">
                        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-mono">
                            {activeQuery.language}
                        </span>
                        <button 
                            className="p-1.5 hover:bg-surface-variant rounded text-on-surface-variant hover:text-on-surface transition-colors"
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