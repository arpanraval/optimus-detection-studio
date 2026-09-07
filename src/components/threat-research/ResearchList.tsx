import React, { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { saveDetectionFromLeaf, archiveLeaf } from '../../lib/threatResearchService';
import type { LeafJobState } from '../../hooks/useThreatResearchJobs';
import type {
  ThreatResearchSession, ThreatResearchTree, AttackBehaviour, DetectionOpportunity,
} from '../../types/threatResearch';
import { TrustFlags, isDetectionSaved } from './shared';
import type { IconName } from '../Icon';

interface Props {
  session: ThreatResearchSession;
  tree: ThreatResearchTree;
  /** Behaviours with an agent currently running on them; renders an inline
   *  spinner next to the behaviour title. Derived from the jobs table —
   *  authoritative, not from the events stream which can stay stuck on
   *  historical session_failed events after a resume. */
  activeBehaviourIds?: ReadonlySet<string>;
  /** Per-composite-leaf live job state, keyed "{behaviour}/{opportunity}".
   *  Drives the "Running / Queued / Lost / Retry needed" state column. */
  jobsByLeaf?: ReadonlyMap<string, LeafJobState>;
  /** When true, behaviours with no opportunities show a per-leaf "Retry"
   *  button. Used in the failed-session view. */
  sessionFailed?: boolean;
  onLeafClick: (b: AttackBehaviour, o: DetectionOpportunity) => void;
  /** Per-leaf retry. The id is ALWAYS composite "{behaviour}/{opportunity}" —
   *  that is what the orchestrator's retry_leaf endpoint accepts, because the
   *  detection job it enqueues is scoped to one opportunity. A behaviour with
   *  no opportunities has nothing to retry (see onResumeSession). */
  onRetryLeaf?: (compositeId: string) => void;
  /** Recovery for a behaviour that produced NO opportunities. retry_leaf
   *  cannot help there: the missing artefact is an opportunity, and only the
   *  Opportunity Planner makes those — which means re-running the session. */
  onResumeSession?: () => void;
  /** Called after a bulk save/discard so the parent refetches the session. */
  onMutated?: () => void;
}

const EMPTY_JOBS: ReadonlyMap<string, LeafJobState> = new Map();

/** Composite key for selection — same shape as the leaf path the panel uses. */
type LeafKey = string; // `${behaviourId}/${opportunityId}`

const EMPTY_ACTIVE_SET: ReadonlySet<string> = new Set();

const FEASIBILITY_LABEL: Record<string, string> = {
  covered:    'covered',
  partial:    'partial',
  uncovered:  'uncovered',
};

export function ResearchList({
  session, tree, activeBehaviourIds, jobsByLeaf, sessionFailed, onLeafClick, onRetryLeaf,
  onResumeSession, onMutated,
}: Props) {
  const { showToast } = useToast();
  const activeIds = activeBehaviourIds ?? EMPTY_ACTIVE_SET;
  const jobs = jobsByLeaf ?? EMPTY_JOBS;
  // Bulk-action selection. Keyed on `${behaviourId}/${opportunityId}` so the
  // selection survives across re-renders even if the behaviour list shifts.
  const [selected, setSelected] = useState<Set<LeafKey>>(new Set());
  const [busy, setBusy] = useState(false);

  // Visible (non-archived, non-saved, non-empty-behaviour) leaves form the
  // "select all" universe. Saved + archived rows are excluded — bulk save
  // would no-op on them, bulk discard would re-archive already-archived.
  const eligibleLeaves = useMemo(() => {
    const out: { behaviour: AttackBehaviour; opportunity: DetectionOpportunity; key: LeafKey }[] = [];
    for (const b of tree.behaviours) {
      for (const o of b.opportunities) {
        if (o.detection.archived) continue;
        if (isDetectionSaved(o.detection)) continue;
        out.push({ behaviour: b, opportunity: o, key: `${b.id}/${o.id}` });
      }
    }
    return out;
  }, [tree.behaviours]);

  function toggleOne(key: LeafKey) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); }

  function selectAllReady() {
    // Convenience: pick every eligible leaf that actually has a query. This
    // used to filter on a QA verdict of pass / pass_with_concerns; with no
    // verdicts, having been written is the only thing that qualifies a
    // detection for the user's attention.
    const next = new Set<LeafKey>();
    for (const l of eligibleLeaves) {
      const q = l.opportunity.detection.query;
      if (q && q.trim().length > 0) next.add(l.key);
    }
    setSelected(next);
  }

  async function bulkSave() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    let saved = 0;
    let failed = 0;
    let staleBadge = 0;
    try {
      const targets = eligibleLeaves.filter(l => selected.has(l.key));
      // Bounded-parallelism worker pool. Sequential await freezes the UI
      // for 30+ items (~10s of "Saving..." with no progress); pure
      // Promise.all hammers the API. Concurrency=4 fits comfortably under
      // the user's per-second request budget while keeping wall time short.
      const queue = [...targets];
      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          const l = queue.shift();
          if (!l) return;
          try {
            const result = await saveDetectionFromLeaf(
              session, l.behaviour.id, l.opportunity.id, l.opportunity.detection,
            );
            saved++;
            // Library insert succeeded but tree-state RPC didn't —
            // detection IS in the library, but the leaf badge in this
            // session view will be stale until refresh. Single-leaf save
            // already surfaces this to the user; bulk save needs to too.
            if (!result.tree_patched) staleBadge++;
          } catch {
            failed++;
          }
        }
      };
      const concurrency = Math.min(4, targets.length);
      await Promise.all(Array.from({ length: concurrency }, worker));
    } finally {
      setBusy(false);
      clearSelection();
      onMutated?.();
      // Three buckets: full success / partial (some saved, some stale-
      // badge but in library) / failure.
      if (failed === 0 && staleBadge === 0) {
        showToast('success', `Saved ${saved} detection${saved === 1 ? '' : 's'} to library`);
      } else if (failed === 0) {
        showToast(
          'info',
          `Saved ${saved} to library; ${staleBadge} leaf badge${staleBadge === 1 ? '' : 's'} will update on refresh`,
        );
      } else if (saved === 0) {
        showToast('error', `Failed to save ${failed} detection${failed === 1 ? '' : 's'} — review individually`);
      } else {
        showToast(
          'error',
          `Saved ${saved}, ${failed} failed${staleBadge ? `, ${staleBadge} stale badge${staleBadge === 1 ? '' : 's'}` : ''} — review individually`,
        );
      }
    }
  }

  async function bulkDiscard() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    let archived = 0;
    let failed = 0;
    try {
      const targets = eligibleLeaves.filter(l => selected.has(l.key));
      const queue = [...targets];
      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          const l = queue.shift();
          if (!l) return;
          try {
            await archiveLeaf(session, l.behaviour.id, l.opportunity.id, l.opportunity.detection.id);
            archived++;
          } catch {
            failed++;
          }
        }
      };
      const concurrency = Math.min(4, targets.length);
      await Promise.all(Array.from({ length: concurrency }, worker));
    } finally {
      setBusy(false);
      clearSelection();
      onMutated?.();
      if (failed === 0) showToast('info', `Discarded ${archived} leaf${archived === 1 ? '' : 'es'}`);
      else showToast('error', `Discarded ${archived}, ${failed} failed`);
    }
  }

  if (tree.behaviours.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-on-surface-variant">
        Waiting for the Research Agent to produce behaviours...
      </div>
    );
  }

  // Session health summary — derived from the tree, NOT from session.status.
  // The status column on the row can be 'completed' even when every detection
  // is engineer_failed (legacy sessions from before the v55 status fix).
  // Surfacing these counts at the top of the list gives operators a one-glance
  // "is this session output usable?" answer.
  let engineerFailedCount = 0;
  let savedCount = 0;
  let totalDetections = 0;
  for (const b of tree.behaviours) {
    for (const o of b.opportunities) {
      totalDetections++;
      const det = o.detection;
      if (isDetectionSaved(det)) savedCount++;
      if (det.qa_error === 'engineer_failed') engineerFailedCount++;
    }
  }
  // readyCount mirrors exactly what selectAllReady() selects: eligible (not
  // saved, not archived) leaves that have a query. Deriving it from
  // eligibleLeaves rather than counting across the WHOLE tree keeps
  // usableCount = savedCount + readyCount mutually exclusive by construction;
  // an earlier version summed overlapping sets and could report more usable
  // detections than existed.
  const readyCount = eligibleLeaves.filter(l => {
    const q = l.opportunity.detection.query;
    return !!q && q.trim().length > 0;
  }).length;
  const usableCount = savedCount + readyCount;
  const allEngineerFailed = totalDetections > 0 && engineerFailedCount === totalDetections;
  const hasFailures = engineerFailedCount > 0;

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Critical-state banner. Uses the project's ext-coral token (the
          documented "critical / F grade / high-risk" colour) at 10% as a
          subtle wash so the banner reads as urgent without screaming.
          This matches how the Action Plan page renders Critical severity
          and High Risk badges. */}
      {allEngineerFailed && (
        <div className="mb-3 rounded-2xl border border-ext-coral/30 bg-ext-coral/10 px-5 py-3">
          <div className="flex items-start gap-3">
            <Icon name="alert-triangle" size={18} className="mt-0.5 flex-shrink-0 text-ext-coral" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-on-surface">
                All {totalDetections} detection{totalDetections === 1 ? '' : 's'} failed during generation
              </div>
              <div className="mt-1 text-xs text-on-surface-variant">
                The Detection Engineer could not produce queries for any opportunity. Common causes: Anthropic API parameter change, model timeout, budget exhaustion. Behaviours and opportunities are intact — re-running the session retries detection generation against the same tree.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mixed-failure banner — ext-amber wash, matches the "Medium / Warning"
          treatment in the design system. */}
      {!allEngineerFailed && hasFailures && (
        <div className="mb-3 rounded-2xl border border-ext-amber/30 bg-ext-amber/10 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Icon name="alert-triangle" size={12} className="flex-shrink-0 text-ext-amber" />
            <span className="text-on-surface">
              {engineerFailedCount} engineer-failed
            </span>
            <span>of {totalDetections} · {usableCount} usable ({readyCount} ready, {savedCount} saved) · retry individually or resume_session</span>
          </div>
        </div>
      )}

      {/* Bulk action bar — only renders when at least one row is selected.
          Sticky at the top of the scroll area so it stays in reach while
          scrolling through a large session. */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container px-4 py-2 shadow-sm">
          <span className="text-sm text-on-surface">
            {selected.size} selected
          </span>
          <Button size="sm" onClick={bulkSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save selected to Library'}
          </Button>
          <Button size="sm" variant="outlined" onClick={bulkDiscard} disabled={busy}>
            Discard selected
          </Button>
          <Button size="sm" variant="text" color="surface" onClick={clearSelection} disabled={busy}>
            Clear
          </Button>
        </div>
      )}
      <div className="mb-3 flex items-center gap-3 text-xs text-on-surface-variant">
        <button
          type="button"
          onClick={selectAllReady}
          disabled={readyCount === 0}
          title={readyCount === 0
            ? 'No detections have been generated yet'
            : `Select ${readyCount} generated detection${readyCount === 1 ? '' : 's'} awaiting your review`}
          className="rounded-md border border-outline-variant px-2 py-1 hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Select all ready{readyCount > 0 ? ` (${readyCount})` : ''}
        </button>
        {/* Quick summary alongside the action, so the table headers below
            aren't the only place users get an overview. */}
        <span className="text-on-surface-variant">
          {totalDetections} detection{totalDetections === 1 ? '' : 's'} ·{' '}
          {usableCount > 0 ? <span className="text-on-surface">{usableCount} usable</span> : <span className="text-on-surface-variant">0 usable</span>}
          {hasFailures ? <> · <span className="text-ext-coral">{engineerFailedCount} failed</span></> : null}
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-container text-[11px] uppercase tracking-wide text-on-surface-variant">
          <tr>
            <th className="border-b border-outline-variant px-3 py-3 text-left font-medium w-8"> </th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">Phase</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">Behaviour</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">Opportunity</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">Detection</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">MITRE</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">Severity</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">Feasibility</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">State</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-outline-variant">
          {tree.behaviours.flatMap(b =>
            b.opportunities.length === 0
              ? [
                <EmptyBehaviourRow
                  key={b.id}
                  behaviour={b}
                  active={activeIds.has(b.id)}
                  showResume={!!sessionFailed && !activeIds.has(b.id)}
                  onResumeSession={onResumeSession}
                />,
              ]
              : b.opportunities.map(o => {
                const key = `${b.id}/${o.id}` as LeafKey;
                const eligible = !o.detection.archived && !isDetectionSaved(o.detection);
                const jobState = jobs.get(key) ?? null;
                return (
                  <Row
                    key={`${b.id}-${o.id}`}
                    behaviour={b}
                    opportunity={o}
                    leafKey={key}
                    jobState={jobState}
                    active={activeIds.has(b.id)}
                    onClick={() => onLeafClick(b, o)}
                    eligible={eligible}
                    selected={selected.has(key)}
                    onToggleSelect={() => toggleOne(key)}
                    onRetry={onRetryLeaf}
                  />
                );
              }),
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Canonical row state. Derived from (detection.query, detection.qa_error,
 *  detection.saved_detection_id, detection.archived, jobs.detection_status).
 *  The mapping is precedence-ordered: terminal-good > running > terminal-bad
 *  > queued > idle. One label, one colour, one action.
 *
 *  This used to carry eleven QA-derived states — pass, pass_with_concerns,
 *  fail, four flavours of pipeline error, a queued state and a silent-loss
 *  state. All of them described a verdict, and there are no verdicts now: the
 *  engineer's query goes to the user, who decides. What is left is whether a
 *  query exists and what the user has done with it. */
type RowState =
  | 'saved'           // already in library
  | 'discarded'       // user archived
  | 'detection_run'   // engineer worker is running right now
  | 'ready'           // a query exists and is waiting on the user
  | 'duplicate'       // semantic duplicate of an earlier leaf
  | 'eng_failed'      // qa_error='engineer_failed' — retry needed
  | 'lost_silent'     // job terminal yet no query landed — retry
  | 'pending'         // detection job queued, not picked up yet
  | 'idle';           // nothing to show

function resolveRowState(
  det: DetectionOpportunity['detection'],
  jobState: LeafJobState | null,
): RowState {
  if (det.archived) return 'discarded';
  if (isDetectionSaved(det)) return 'saved';
  if (jobState?.detection_status === 'running') return 'detection_run';
  if (det.qa_error === 'engineer_failed') return 'eng_failed';
  // A real query outranks everything below. Historical leaves can carry a
  // stale qa_error beside a perfectly good query; that error described a
  // critic that no longer exists and must not hide the artefact.
  if (det.query && det.query.trim().length > 0) {
    return det.duplicate_of ? 'duplicate' : 'ready';
  }
  // No query. Either the job finished without landing one, or it hasn't run.
  if (jobState?.detection_status === 'completed' || jobState?.detection_status === 'failed') {
    return 'lost_silent';
  }
  if (jobState?.detection_status === 'pending') return 'pending';
  return 'idle';
}

interface StateRenderConfig {
  label: string;
  icon: IconName | null;
  iconSpin?: boolean;
  textCls: string;
  borderCls: string;
  /** When non-null, an action button label. The handler is wired by the
   *  parent (retry vs save). */
  actionLabel: 'Save' | 'Retry' | null;
}

const STATE_RENDER: Record<RowState, StateRenderConfig> = {
  saved:          { label: 'Saved to library', icon: 'check',          textCls: 'text-ext-teal font-medium',          borderCls: 'border-l-ext-teal',        actionLabel: null   },
  discarded:      { label: 'Discarded',        icon: null,              textCls: 'text-on-surface-variant',             borderCls: 'border-l-transparent',     actionLabel: null   },
  detection_run:  { label: 'Engineer running…', icon: 'loader', iconSpin: true, textCls: 'text-primary',                 borderCls: 'border-l-primary',          actionLabel: null   },
  ready:          { label: 'Ready to review',   icon: 'check-circle',   textCls: 'text-ext-teal font-medium',          borderCls: 'border-l-ext-teal',        actionLabel: 'Save' },
  duplicate:      { label: 'Duplicate',         icon: 'copy',           textCls: 'text-on-surface-variant font-medium', borderCls: 'border-l-outline-variant', actionLabel: 'Save' },
  eng_failed:     { label: 'Engineer failed',    icon: 'x-circle',      textCls: 'text-ext-coral font-semibold',       borderCls: 'border-l-ext-coral',       actionLabel: 'Retry' },
  lost_silent:    { label: 'Lost — needs retry', icon: 'help-circle',   textCls: 'text-ext-amber font-medium',         borderCls: 'border-l-ext-amber',       actionLabel: 'Retry' },
  pending:        { label: 'Queued',             icon: 'clock',         textCls: 'text-on-surface-variant italic',     borderCls: 'border-l-transparent',     actionLabel: null   },
  idle:           { label: 'Not started',        icon: null,             textCls: 'text-on-surface-variant italic',    borderCls: 'border-l-transparent',     actionLabel: null   },
};

function Row({
  behaviour, opportunity, leafKey, jobState, active, onClick, eligible, selected, onToggleSelect, onRetry,
}: {
  behaviour: AttackBehaviour;
  opportunity: DetectionOpportunity;
  leafKey: string;
  jobState: LeafJobState | null;
  active: boolean;
  onClick: () => void;
  eligible: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRetry?: (compositeId: string) => void;
}) {
  const det = opportunity.detection;
  const state = resolveRowState(det, jobState);
  const render = STATE_RENDER[state];

  const isEngineerFailed = state === 'eng_failed';

  // Severity / feasibility cells: only show real values when the engineer
  // actually emitted them. engineer_failed and lost_silent stash defaults
  // ("Medium", "partial") in the slot — rendering those as if they were
  // real judgments misleads operators.
  const showDefaultsAsContent = state !== 'eng_failed' && state !== 'lost_silent' && state !== 'idle';
  const severityDisplay = showDefaultsAsContent
    ? <span className="text-xs text-on-surface">{det.suggested_severity}</span>
    : <span className="text-xs text-on-surface-variant">—</span>;
  const feasibilityDisplay = showDefaultsAsContent
    ? <span className="text-xs text-on-surface-variant">{FEASIBILITY_LABEL[det.feasibility]}</span>
    : <span className="text-xs text-on-surface-variant">—</span>;

  // retry_leaf enqueues a fresh `detection` job — a full regeneration, not a
  // re-run over the existing query body.
  const failureTooltip =
    state === 'eng_failed'  ? 'Detection engineer agent loop failed (budget/timeout/validation). Retry regenerates the detection from scratch.' :
    state === 'lost_silent' ? 'The detection job finished without producing a query. Retry regenerates it from scratch.' :
    state === 'duplicate'   ? `Semantic duplicate of detection ${det.duplicate_of ?? 'another leaf'} — check whether that one already covers this.` :
    null;

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer hover:bg-surface-container-high border-l-4 ${render.borderCls} ${det.archived ? 'opacity-50' : ''}`}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {/* Duplicates stay selectable: the fingerprint match is a hint, not a
            ruling, and the user is the one deciding what to keep. */}
        {eligible && !isEngineerFailed ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${det.name}`}
            className="cursor-pointer"
          />
        ) : (
          <span className="block w-4" aria-hidden="true" />
        )}
      </td>
      <td className="px-4 py-2.5"><span className="text-xs text-on-surface-variant">{behaviour.tactic}</span></td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-medium text-on-surface">
          {active && <Icon name="loader" size={12} className="animate-spin text-primary" />}
          {behaviour.title}
          <TrustFlags behaviour={behaviour} />
        </span>
      </td>
      <td className="px-4 py-2.5 text-on-surface-variant">{opportunity.title}</td>
      <td className="px-4 py-2.5">
        {isEngineerFailed ? (
          <div className="flex items-start gap-2">
            <span className="inline-flex flex-shrink-0 items-center rounded-full bg-ext-coral/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ext-coral">
              Failed
            </span>
            <span className="text-on-surface-variant" title={det.name}>{det.name}</span>
          </div>
        ) : (
          <span className="font-medium text-on-surface">{det.name}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {det.mitre_technique_ids.slice(0, 3).map(id => (
            <span
              key={id}
              className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-500"
            >
              {id}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5">{severityDisplay}</td>
      <td className="px-4 py-2.5">{feasibilityDisplay}</td>
      <td className="px-4 py-2.5" title={failureTooltip ?? undefined}>
        <span className={`inline-flex items-center gap-1 text-xs ${render.textCls}`}>
          {render.icon && (
            <Icon
              name={render.icon}
              size={12}
              className={render.iconSpin ? 'animate-spin' : ''}
            />
          )}
          {render.label}
          {jobState && (jobState.qa_attempt > 1 || jobState.detection_attempt > 1) && (
            <span className="ml-1 text-[10px] text-on-surface-variant">
              ({Math.max(jobState.qa_attempt, jobState.detection_attempt)} attempts)
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        {render.actionLabel === 'Retry' && onRetry ? (
          <button
            type="button"
            onClick={() => onRetry(leafKey)}
            className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container-high"
            title={failureTooltip ?? 'Re-queue this leaf for retry'}
          >
            <Icon name="refresh-cw" size={11} />
            Retry
          </button>
        ) : render.actionLabel === 'Save' ? (
          <span className="text-[11px] text-on-surface-variant italic">use checkbox + Save</span>
        ) : null}
      </td>
    </tr>
  );
}

function EmptyBehaviourRow({
  behaviour,
  active,
  showResume,
  onResumeSession,
}: {
  behaviour: AttackBehaviour;
  active: boolean;
  showResume: boolean;
  onResumeSession?: () => void;
}) {
  // Five mutually-exclusive states for a behaviour with zero opportunities:
  //   1. active            — agent is currently working on it
  //   2. merged            — the Opportunity Planner folded this behaviour
  //                          into another behaviour's canonical opportunity,
  //                          so it has no opportunity of its own AND nothing
  //                          is pending. Checked BEFORE the fallback: on a
  //                          COMPLETED session these rows previously read
  //                          "Waiting for the Detection Engineer…", which is
  //                          plainly false — the work is done, it just lives
  //                          on a sibling leaf (the detail card's
  //                          "also covers: b2, b3…" cross-reference). Canvas
  //                          already surfaced this via merged_into_opportunity_ids;
  //                          List did not.
  //   3. not_detectable    — engineer ran successfully and concluded no
  //                          reliable signal exists.
  //   4. needs_telemetry   — detectable in principle, but the customer's
  //                          environment lacks the required log source.
  //                          Canvas already distinguishes this (its own
  //                          NodeState + icon); List fell through to the
  //                          generic "waiting" message for it.
  //   5. otherwise         — genuinely waiting for engineer to claim the job.
  //
  // (A prior 'engineer_failed' state existed here too, but the Opportunity
  // Planner's VALID_DETECTABILITY never emits it — only siem/edr/
  // needs_telemetry/not_detectable — and nothing else assigns it either, so
  // that branch was permanently dead. Removed rather than left unreachable.)
  //
  // The recovery here is Resume session, not Retry. This row previously
  // offered Retry wired to onRetryLeaf(behaviour.id) — a bare "b1". retry_leaf
  // enqueues a detection job, and handleDetection requires a composite
  // "{behaviour}/{opportunity}" id, so it threw every time. Even with a valid
  // id it could not have helped: the missing artefact is an opportunity, and
  // only the Opportunity Planner produces those.
  const mergedCount = behaviour.merged_into_opportunity_ids?.length ?? 0;
  const isMerged = !active && mergedCount > 0;
  const isNotDetectable = !active && !isMerged && behaviour.detectability === 'not_detectable';
  const isNeedsTelemetry = !active && !isMerged && behaviour.detectability === 'needs_telemetry';

  const message = active
    ? 'Agent working on this behaviour…'
    : isMerged
      ? `Covered by ${mergedCount} detection${mergedCount === 1 ? '' : 's'} on sibling behaviour${mergedCount === 1 ? '' : 's'} — the planner merged this into a shared observable surface rather than writing a near-duplicate query.`
      : isNotDetectable
        ? (behaviour.detectability_rationale
            || 'Engineer ran but found no reliable signal to detect this behaviour with current telemetry.')
        : isNeedsTelemetry
          ? (behaviour.detectability_rationale
              || 'Detectable in principle, but the required log source isn\'t in this environment yet.')
          : 'Waiting for the Detection Engineer…';

  const offerResume = showResume && !!onResumeSession;

  // Pending rows still deserve a left-edge indicator so the row visually
  // aligns with status rows. Active = primary pulse, default waiting =
  // neutral outline (not_detectable gets no special border — it's a real
  // verdict, not an error).
  const pendingBorder = active ? 'border-l-primary' : 'border-l-outline-variant';

  return (
    <tr className={`bg-surface-container-low border-l-4 ${pendingBorder}`}>
      {/* Empty checkbox cell to keep column alignment with selectable rows. */}
      <td className="px-3 py-2" />
      <td className="px-4 py-2 text-xs text-on-surface-variant">{behaviour.tactic}</td>
      <td className="px-4 py-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-on-surface-variant">
          {active && <Icon name="loader" size={12} className="animate-spin text-primary" />}
          {isMerged && <Icon name="git-fork" size={12} className="text-ext-teal" />}
          {isNotDetectable && <Icon name="eye-off" size={12} className="text-on-surface-variant" />}
          {isNeedsTelemetry && <Icon name="help-circle" size={12} className="text-on-surface-variant" />}
          {behaviour.title}
          <TrustFlags behaviour={behaviour} />
        </span>
      </td>
      <td colSpan={6} className="px-4 py-2 text-xs italic text-on-surface-variant">
        {isMerged ? <span className="not-italic font-medium text-ext-teal">Merged. </span> : null}
        {isNotDetectable ? <span className="not-italic font-medium text-on-surface-variant">Not detectable. </span> : null}
        {isNeedsTelemetry ? <span className="not-italic font-medium text-on-surface-variant">Needs telemetry. </span> : null}
        {message}
      </td>
      <td className="px-4 py-2">
        {offerResume ? (
          <button
            type="button"
            onClick={onResumeSession}
            title="Re-runs the session's failed jobs, including the Opportunity Planner that would produce this behaviour's opportunities."
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-outline-variant px-3 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container"
          >
            Resume session
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export default ResearchList;
