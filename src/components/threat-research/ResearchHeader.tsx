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
            <BudgetBadge
              used={session.model_calls_used}
              cap={session.model_call_cap}
              label="model"
            />
            <BudgetBadge
              used={session.tool_calls_used}
              cap={session.tool_call_cap}
              label="tools"
            />
          </div>
        </div>

        <div className="inline-flex rounded-full border border-outline-variant bg-surface p-1">
          <button
            onClick={() => onViewChange('canvas')}
            className={`rounded-full px-4 py-1 text-sm font-medium transition-colors ${view === 'canvas' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Canvas
          </button>
          <button
            onClick={() => onViewChange('list')}
            className={`rounded-full px-4 py-1 text-sm font-medium transition-colors ${view === 'list' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            List
          </button>
        </div>
      </div>
    </header>
  );
}

/** "used / cap" badge with three thresholds: ≥60% mid-warning (early signal),
 *  ≥80% near-limit, ≥100% over-cap. Renders a placeholder during preflight +
 *  Research (when caps are NULL) so users don't lose the budget surface
 *  during the longest single phase. */
function BudgetBadge({ used, cap, label }: {
  used: number | null;
  cap: number | null;
  label: 'model' | 'tools';
}) {
  const u = used ?? 0;
  const c = cap ?? 0;
  // Pre-Research: caps haven't been sized yet. Show a neutral placeholder
  // rather than nothing so users know the budget surface exists and will
  // populate. Without this, the badge is invisible for ~100s of pre-flight
  // + research wall time, which is the slowest single phase.
  if (cap == null) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 text-xs font-medium text-on-surface-variant"
        title={`${u} ${label} calls used. Session cap is sized after Research completes.`}
      >
        {u} {label} (cap pending)
      </span>
    );
  }
  const ratio = c > 0 ? u / c : 0;
  const cls =
    ratio >= 1     ? 'bg-error-container text-on-error-container'         :
    ratio >= 0.8   ? 'bg-secondary-container text-on-secondary-container' :
    ratio >= 0.6   ? 'bg-tertiary-container text-on-tertiary-container'   :
                     'bg-surface-variant text-on-surface-variant';
  const display = `${u} / ${c} ${label}`;
  // Title text gives users a hint about what the colour band means so they
  // don't have to guess from hex alone.
  const bandHint =
    ratio >= 1   ? 'over cap'  :
    ratio >= 0.8 ? 'near cap'  :
    ratio >= 0.6 ? 'mid'       :
                   'low';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
      title={`${u} ${label} calls used of ${c} session cap (${bandHint}, ${Math.round(ratio * 100)}%)`}
    >
      {display}
    </span>
  );
}

export default ResearchHeader;
