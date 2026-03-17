/**
 * Optimus Response Renderer
 * Routes structured responses to appropriate card components
 */

import React from 'react';
import { OptimusResponse, OptimusAction } from '../../types/optimus';
import { CoverageReportCard } from './CoverageReportCard';
import { ThreatActorCard } from './ThreatActorCard';
import { SearchResultsCard } from './SearchResultsCard';
import { GapAnalysisCard } from './GapAnalysisCard';
import { Icon } from '../Icon';

interface Props {
  response: OptimusResponse;
  onAction: (action: OptimusAction) => void;
}

/**
 * Text response component for simple text outputs
 */
const TextResponse: React.FC<{
  content: string;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}> = ({ content, actions, onAction }) => (
  <div>
    <p className="text-[13px] text-on-surface-variant leading-relaxed whitespace-pre-wrap">
      {content}
    </p>
    {actions && actions.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={() => onAction(action)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              i === 0
                ? 'bg-primary text-on-primary hover:bg-primary/90'
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

/**
 * Error response component
 */
const ErrorResponse: React.FC<{
  error: string;
  suggestions?: string[];
  hint?: string;
}> = ({ error, suggestions, hint }) => (
  <div className="bg-error/5 border border-error/20 rounded-xl p-4">
    <div className="flex items-start gap-3">
      <Icon name="alert-circle" className="w-5 h-5 text-error shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-error">{error}</p>
        {hint && (
          <p className="text-xs text-on-surface-variant mt-1">{hint}</p>
        )}
        {suggestions && suggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-on-surface-variant mb-1.5">Did you mean:</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 bg-surface-container-high rounded cursor-pointer hover:bg-surface-container-highest transition-colors"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);

/**
 * Main response renderer
 */
export const OptimusResponseRenderer: React.FC<Props> = ({ response, onAction }) => {
  // Handle error responses
  if (response.type === 'error' || response.data?.error) {
    return (
      <ErrorResponse
        error={response.data?.error || response.summary || 'An error occurred'}
        suggestions={response.data?.suggestions}
        hint={response.data?.hint}
      />
    );
  }

  switch (response.type) {
    case 'coverage_report':
    case 'coverage':
      return (
        <CoverageReportCard
          summary={response.summary}
          data={response.data}
          actions={response.actions}
          onAction={onAction}
        />
      );

    case 'threat_actor':
      return (
        <ThreatActorCard
          summary={response.summary}
          data={response.data}
          actions={response.actions}
          onAction={onAction}
        />
      );

    case 'search_results':
      return (
        <SearchResultsCard
          summary={response.summary}
          data={response.data}
          actions={response.actions}
          onAction={onAction}
        />
      );

    case 'gap_analysis':
      return (
        <GapAnalysisCard
          summary={response.summary}
          data={response.data}
          actions={response.actions}
          onAction={onAction}
        />
      );

    case 'text':
    default:
      return (
        <TextResponse
          content={response.summary || response.data?.content || ''}
          actions={response.actions}
          onAction={onAction}
        />
      );
  }
};

export default OptimusResponseRenderer;
