/**
 * Search Results Card
 * Clean enterprise-grade design for detection search results
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
    case 'production': return { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' };
    case 'testing': return { bg: 'bg-tertiary/10', text: 'text-tertiary', border: 'border-tertiary/20' };
    case 'review': return { bg: 'bg-secondary/10', text: 'text-secondary', border: 'border-secondary/20' };
    case 'draft': return { bg: 'bg-surface-container-highest', text: 'text-on-surface-variant', border: 'border-outline-variant/30' };
    case 'deprecated': return { bg: 'bg-error/10', text: 'text-error', border: 'border-error/20' };
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
    <div className="bg-surface-container-highest rounded-2xl border border-outline-variant/40 overflow-hidden shadow-md shadow-black/[0.04]">
      {/* Header Section */}
      <div className="p-5 border-b border-outline-variant/10 bg-surface-container-lowest/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <Icon name="search" className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-on-surface tracking-tight">Search Results</h3>
            <p className="text-sm text-on-surface-variant/80">
              <span className="font-semibold text-on-surface">{total}</span> detection{total !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>
      </div>

      {/* Results list */}
      <div className="p-5 bg-surface-container-lowest/30">
        {displayResults && displayResults.length > 0 ? (
          <div className="space-y-2">
            {displayResults.map((result: SearchResult) => {
              const statusStyle = getStatusStyle(result.status);
              return (
                <Link
                  key={result.id}
                  to={routeHelpers.detectionDetail(result.id)}
                  className="group block no-underline p-3 rounded-lg border border-outline-variant/15 hover:border-outline-variant/30 bg-surface-container-low hover:bg-surface-container transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
                        {result.name}
                      </h4>

                      {/* Tags row */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {/* Status badge */}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                          {result.status}
                        </span>

                        {/* MITRE IDs */}
                        {result.mitreIds && result.mitreIds.slice(0, 4).map((id) => (
                          <span
                            key={id}
                            className="text-[10px] font-mono font-medium px-1.5 py-0.5 bg-surface-container-highest text-on-surface-variant rounded border border-outline-variant/20"
                          >
                            {id}
                          </span>
                        ))}
                        {result.mitreIds && result.mitreIds.length > 4 && (
                          <span className="text-[10px] text-on-surface-variant/60 font-medium">
                            +{result.mitreIds.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Similarity score */}
                    {result.similarity !== undefined && result.similarity > 0 && (
                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono text-on-surface-variant bg-surface-container px-2 py-1 rounded border border-outline-variant/10">
                          {Math.round(result.similarity * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center">
            <Icon name="search" className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">No detections found for "{query}"</p>
          </div>
        )}

        {/* Show more/less button */}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full mt-3 py-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
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
        <div className="px-5 py-4 border-t border-outline-variant/10 bg-surface-container-low">
          <p className="text-[10px] font-semibold text-on-surface-variant/80 uppercase tracking-wide mb-2.5">
            Related Techniques
          </p>
          <div className="flex flex-wrap gap-1.5">
            {relatedTechniques.slice(0, 8).map((id) => (
              <span
                key={id}
                className="text-xs font-mono px-2 py-1 bg-surface-container-highest text-on-surface-variant rounded border border-outline-variant/10"
              >
                {id}
              </span>
            ))}
            {relatedTechniques.length > 8 && (
              <span className="text-[10px] text-on-surface-variant/50 self-center ml-1 font-medium">
                +{relatedTechniques.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 py-4 border-t border-outline-variant/10 bg-surface-container-lowest flex flex-wrap gap-2.5">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction(action)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
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
