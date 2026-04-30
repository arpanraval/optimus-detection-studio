import React from 'react';
import { Icon } from '../Icon';
import { CoverageImpactBadge } from './coverage/CoverageImpactBadge';
import type { ThreatResearchSession } from '../../types/threatResearch';

interface Props {
  session: ThreatResearchSession;
  view: 'canvas' | 'list';
  onViewChange: (v: 'canvas' | 'list') => void;
}

const STATUS_STYLE: Record<string, string> = {
  pending:    'bg-surface-variant text-on-surface-variant',
  running:    'bg-secondary-container text-on-secondary-container animate-pulse',
  completed:  'bg-tertiary-container text-on-tertiary-container',
  failed:     'bg-error-container text-on-error-container',
  cancelled:  'bg-surface-variant text-on-surface-variant',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  cve:        'CVE',
  group:      'Threat Actor',
  campaign:   'Campaign',
  technique:  'Technique',
  concept:    'Concept',
};

export function ResearchHeader({ session, view, onViewChange }: Props) {
  const subject = session.tree.subject;
  const title = subject?.subject ?? session.input_text;

  return (
    <header className="border-b border-outline-variant bg-surface-container px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-on-surface-variant">
            <span>Threat Research</span>
            <Icon name="chevron-right" size={12} />
            <span className="truncate">{session.input_text.slice(0, 60)}{session.input_text.length > 60 ? '...' : ''}</span>
          </div>
          <h1 className="truncate text-xl font-semibold text-on-surface">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[session.status] ?? 'bg-surface-variant text-on-surface-variant'}`}>
              {session.status}
            </span>
            {session.input_classification && (
              <span className="inline-flex items-center rounded-full bg-primary-container px-2 py-0.5 text-xs font-medium text-on-primary-container">
                {CLASSIFICATION_LABEL[session.input_classification] ?? session.input_classification}
              </span>
            )}
            <CoverageImpactBadge impact={session.coverage_impact} />
          </div>
        </div>

        <div className="inline-flex rounded-md border border-outline-variant bg-surface p-0.5">
          <button
            onClick={() => onViewChange('canvas')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === 'canvas' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            <Icon name="git-branch" size={14} />
            Canvas
          </button>
          <button
            onClick={() => onViewChange('list')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === 'list' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            <Icon name="list" size={14} />
            List
          </button>
        </div>
      </div>
    </header>
  );
}

export default ResearchHeader;
