import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { ROUTES } from '../../router/routes';
import type { ThreatResearchSession } from '../../types/threatResearch';
import type { JobPhase } from '../../hooks/useThreatResearchJobs';

export type ResearchView = 'canvas' | 'list' | 'research';

interface Props {
  session: ThreatResearchSession;
  view: ResearchView;
  onViewChange: (v: ResearchView) => void;
  /** Most-advanced phase with any job row, from useThreatResearchJobs.
   *  Drives the "Phase X of 7" indicator. Undefined/null hides it — there's
   *  nothing to show before the first job exists, or once a session has
   *  already ended (its badge value would just be stale). */
  currentPhase?: JobPhase | null;
}

/** Display stages in pipeline order — one entry per real job phase.
 *  attack_research is a genuine fan-out phase (one job per behaviour); it is
 *  load-bearing for staying under the edge-worker ceiling — see the
 *  phase-progression note in lib/orchestrator.ts. */
const PHASE_STAGES: { phases: JobPhase[]; label: string }[] = [
  { phases: ['preflight'], label: 'Classifying input' },
  { phases: ['research'], label: 'Researching the threat' },
  { phases: ['attack_research'], label: 'Per-behaviour deep dive' },
  { phases: ['opportunity_planning'], label: 'Planning detection opportunities' },
  { phases: ['detection'], label: 'Writing detections' },
  { phases: ['qa'], label: 'QA review' },
  { phases: ['finalise'], label: 'Finalising' },
];

function stageIndex(phase: JobPhase | null | undefined): number {
  if (!phase) return -1;
  return PHASE_STAGES.findIndex(s => s.phases.includes(phase));
}

/** "Phase X of 7: <label>" chip. Only rendered while a session is still
 *  actively progressing — see the render-site guard in ResearchHeader. */
function PhaseIndicator({ phase }: { phase: JobPhase | null | undefined }) {
  const idx = stageIndex(phase);
  if (idx < 0) return null;
  const stage = PHASE_STAGES[idx];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25"
      title={`Phase ${idx + 1} of ${PHASE_STAGES.length}: ${stage.label}`}
    >
      <Icon name="loader" size={10} className="animate-spin" />
      Phase {idx + 1}/{PHASE_STAGES.length} · {stage.label}
    </span>
  );
}

const VIEWS: { id: ResearchView; label: string; title: string }[] = [
  { id: 'canvas',   label: 'Canvas',   title: 'Behaviour → opportunity → detection tree' },
  { id: 'list',     label: 'List',     title: 'Every detection with its QA state' },
  { id: 'research', label: 'Research', title: 'Threat profile, kill-chain walk and per-behaviour deep dives' },
];

const STATUS_STYLE: Record<string, string> = {
  pending:    'bg-on-surface/5 text-on-surface-variant ring-1 ring-inset ring-on-surface/10',
  running:    'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25 animate-pulse',
  completed:  'bg-on-surface/[0.04] text-on-surface ring-1 ring-inset ring-on-surface/15',
  failed:     'bg-error/10 text-error ring-1 ring-inset ring-error/25',
  cancelled:  'bg-on-surface/5 text-on-surface-variant ring-1 ring-inset ring-on-surface/10',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  cve:        'CVE',
  group:      'Threat Actor',
  campaign:   'Campaign',
  technique:  'Technique',
  concept:    'Concept',
};

export function ResearchHeader({ session, view, onViewChange, currentPhase }: Props) {
  const subject = session.tree.subject;
  const title = subject?.subject ?? session.input_text;

  // Multi-SIEM environments only get one query-language output per session
  // (the first SIEM in the env profile's siem_platforms list). When the
  // user has 2+ SIEMs configured, surface that the session covers only
  // one of them — they may want to re-run for the second.
  const envSnapshot = session.environment_snapshot as
    | { siem_platforms?: string[] }
    | null
    | undefined;
  const allSiems = envSnapshot?.siem_platforms ?? [];
  const targetedSiem = allSiems[0];
  const otherSiems = allSiems.slice(1);

  return (
    <header className="border-b border-outline-variant bg-surface-container px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-on-surface-variant">
            <Link
              to={ROUTES.RESEARCH}
              className="rounded-sm text-on-surface-variant transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Threat Research
            </Link>
            <Icon name="chevron-right" size={12} />
            <span className="truncate">{session.input_text.slice(0, 60)}{session.input_text.length > 60 ? '...' : ''}</span>
          </div>
          <h1 className="truncate text-xl font-semibold text-on-surface">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[session.status] ?? 'bg-surface-variant text-on-surface-variant'}`}>
              {session.status}
            </span>
            {session.input_classification && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
                {CLASSIFICATION_LABEL[session.input_classification] ?? session.input_classification}
              </span>
            )}
            {(session.status === 'pending' || session.status === 'running') && (
              <PhaseIndicator phase={currentPhase} />
            )}
            {otherSiems.length > 0 && targetedSiem && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-ext-amber/10 px-2 py-0.5 text-xs font-medium text-ext-amber ring-1 ring-inset ring-ext-amber/30"
                title={`Detections written for ${targetedSiem} only. Other configured SIEMs (${otherSiems.join(', ')}) are NOT covered by this session. Re-order siem_platforms or run a separate session for each.`}
              >
                <Icon name="alert-triangle" size={10} />
                {targetedSiem} only · {otherSiems.length} uncovered
              </span>
            )}
            {/* CoverageImpactBadge is hidden until coverage_impact is real.
                finalise writes a hardcoded `coverage_impact: 0` (see
                lib/orchestrator.ts, the session-completion update), so the
                badge has only ever rendered a placeholder — presented with the
                same authority as the budget badges next to it. Showing "0%
                coverage impact" for every session is worse than showing
                nothing. Restore this when finalise computes the number. */}
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
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => onViewChange(v.id)}
              title={v.title}
              aria-pressed={view === v.id}
              className={`rounded-full px-4 py-1 text-sm font-medium transition-colors ${view === v.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              {v.label}
            </button>
          ))}
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
