/**
 * Search Results Card
 * M3-inspired design for detection search results
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { OptimusAction, SearchResultsData, SearchResult } from '../../types/optimus';
import { routeHelpers } from '../../router/routes';

interface Props {
  summary: string;
  data: SearchResultsData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

const getStatusStyle = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'production': return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'testing': return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' };
    case 'review': return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'draft': return { bg: 'bg-surface-container-highest', text: 'text-on-surface-variant', border: 'border-outline-variant/30' };
    case 'deprecated': return { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' };
    default: return { bg: 'bg-surface-container-highest', text: 'text-on-surface-variant', border: 'border-outline-variant/30' };
  }
};

export const SearchResultsCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const { query, total, results, relatedTechniques } = data;
  const [showAll, setShowAll] = useState(false);

  const INITIAL_SHOW = 5;
  const displayResults = showAll ? results : results?.slice(0, INITIAL_SHOW);
  const hasMore = results && results.length > INITIAL_SHOW;

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/15 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon name="search" className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-on-surface">Search Results</h3>
            <p className="text-xs text-on-surface-variant/60">{total} detection{total !== 1 ? 's' : ''} found</p>
          </div>
        </div>
      </div>

      {/* Results list */}
      <div className="px-4 pb-2">
        {displayResults && displayResults.length > 0 ? (
          <div className="space-y-2">
            {displayResults.map((result: SearchResult) => {
              const statusStyle = getStatusStyle(result.status);
              return (
                <Link
                  key={result.id}
                  to={routeHelpers.detectionDetail(result.id)}
                  className="block no-underline text-inherit p-3 rounded-xl border border-outline-variant/10 hover:bg-surface-container-high/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-on-surface">
                        {result.name}
                      </h4>

                      {/* Tags row */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {/* Status badge */}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                          {result.status}
                        </span>

                        {/* MITRE IDs */}
                        {result.mitreIds && result.mitreIds.slice(0, 4).map((id) => (
                          <span
                            key={id}
                            className="text-[10px] font-mono font-medium px-1.5 py-0.5 bg-tertiary/10 text-tertiary rounded"
                          >
                            {id}
                          </span>
                        ))}
                        {result.mitreIds && result.mitreIds.length > 4 && (
                          <span className="text-[10px] text-on-surface-variant/50">
                            +{result.mitreIds.length - 4}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Similarity score */}
                    <div className="text-right shrink-0">
                      {result.similarity != null ? (
                        <span className="text-[10px] font-mono text-on-surface-variant/60">
                          {Math.round(result.similarity * 100)}% match
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-on-surface-variant/40">
                          keyword match
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Icon name="search" className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-2" />
            <p className="text-sm text-on-surface-variant">No detections found for "{query}"</p>
          </div>
        )}

        {/* Show more/less button */}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full mt-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 rounded-xl transition-colors"
          >
            {showAll
              ? 'Show less'
              : `Show ${results.length - INITIAL_SHOW} more detection${results.length - INITIAL_SHOW > 1 ? 's' : ''}`
            }
          </button>
        )}
      </div>

      {/* Related techniques */}
      {relatedTechniques && relatedTechniques.length > 0 && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-surface-container-high/30 border border-outline-variant/10">
          <p className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider mb-2">Related Techniques</p>
          <div className="flex flex-wrap gap-1.5">
            {relatedTechniques.slice(0, 8).map((id) => (
              <span
                key={id}
                className="text-[10px] font-mono px-2 py-0.5 bg-surface-container-highest text-on-surface-variant rounded"
              >
                {id}
              </span>
            ))}
            {relatedTechniques.length > 8 && (
              <span className="text-[10px] text-on-surface-variant/40">
                +{relatedTechniques.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-4 pb-4 pt-2 border-t border-outline-variant/10 flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction(action)}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition-all duration-150 ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm shadow-primary/20'
                  : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchResultsCard;
