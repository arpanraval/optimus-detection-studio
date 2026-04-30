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
  pending:    'bg-gray-100 text-gray-700',
  running:    'bg-blue-100 text-blue-700 animate-pulse',
  completed:  'bg-emerald-100 text-emerald-700',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-amber-100 text-amber-700',
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
    <header className="border-b bg-white px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <span>Threat Research</span>
            <Icon name="chevron-right" size={12} />
            <span className="truncate">{session.input_text.slice(0, 60)}{session.input_text.length > 60 ? '...' : ''}</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 truncate">{title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[session.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {session.status}
            </span>
            {session.input_classification && (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                {CLASSIFICATION_LABEL[session.input_classification] ?? session.input_classification}
              </span>
            )}
            <CoverageImpactBadge impact={session.coverage_impact} />
          </div>
        </div>

        <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
          <button
            onClick={() => onViewChange('canvas')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${view === 'canvas' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Icon name="git-branch" size={14} />
            Canvas
          </button>
          <button
            onClick={() => onViewChange('list')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${view === 'list' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:text-gray-900'}`}
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
