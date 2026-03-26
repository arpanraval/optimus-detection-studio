/**
 * Search Results Card
 * Unified design system — plain status dots, text-only header, mono MITRE IDs
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

const getStatusDot = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'production':
      return 'w-1.5 h-1.5 rounded-full bg-teal';
    case 'testing':
    case 'review':
      return 'w-1.5 h-1.5 rounded-full bg-amber';
    default:
      return 'w-1.5 h-1.5 rounded-full bg-surface-container-highest';
  }
};

export const SearchResultsCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const { query, total, results, relatedTechniques } = data;
  const [showAll, setShowAll] = useState(false);

  const INITIAL_SHOW = 5;
  const displayResults = showAll ? results : results?.slice(0, INITIAL_SHOW);
  const hasMore = results && results.length > INITIAL_SHOW;

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <h3 className="text-base font-semibold text-on-surface">
          Found {total} detection{total !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
        </h3>
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/[0.08]" />

      {/* Results list */}
      <div className="px-5 py-4">
        {displayResults && displayResults.length > 0 ? (
          <div className="space-y-1">
            {displayResults.map((result: SearchResult) => (
              <Link
                key={result.id}
                to={routeHelpers.detectionDetail(result.id)}
                className="block no-underline text-inherit px-3 py-2.5 rounded-lg hover:bg-surface-container-high/50 transition-colors duration-300 ease-emphasized"
              >
                <p className="text-sm font-medium text-on-surface hover:text-primary transition-colors">{result.name}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  {/* Status dot + text */}
                  {result.status && (
                    <span className="flex items-center gap-1.5">
                      <span className={`shrink-0 ${getStatusDot(result.status)}`} />
                      <span className="text-xs text-on-surface-variant">{result.status}</span>
                    </span>
                  )}

                  {/* MITRE IDs */}
                  {result.mitreIds && result.mitreIds.slice(0, 4).map((id) => (
                    <span key={id} className="font-mono text-xs text-tertiary">
                      {id}
                    </span>
                  ))}
                  {result.mitreIds && result.mitreIds.length > 4 && (
                    <span className="text-xs text-on-surface-variant/50">
                      +{result.mitreIds.length - 4}
                    </span>
                  )}

                  {/* Similarity score */}
                  {result.similarity != null ? (
                    <span className="font-mono text-xs text-on-surface-variant/60">
                      {Math.round(result.similarity * 100)}% match
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-on-surface-variant/40">
                      keyword match
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Icon name="search" className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-2" />
            <p className="text-sm text-on-surface-variant">No detections found for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {/* Show all / show less toggle */}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full mt-3 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-xl transition-colors"
          >
            {showAll ? 'Show less' : `Show all ${results.length} results`}
          </button>
        )}
      </div>

      {/* Related techniques */}
      {relatedTechniques && relatedTechniques.length > 0 && (
        <>
          <div className="border-t border-outline-variant/[0.08]" />
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-on-surface-variant/50 uppercase tracking-wider mb-2">
              Related
            </p>
            <div className="flex flex-wrap gap-1.5">
              {relatedTechniques.slice(0, 8).map((id) => (
                <span
                  key={id}
                  className="font-mono text-xs text-tertiary px-2 py-0.5 rounded border border-outline-variant/20"
                >
                  {id}
                </span>
              ))}
              {relatedTechniques.length > 8 && (
                <span className="text-xs text-on-surface-variant/40">
                  +{relatedTechniques.length - 8} more
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-5 pt-2 border-t border-outline-variant/[0.08] flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction(action)}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm shadow-primary/10'
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
