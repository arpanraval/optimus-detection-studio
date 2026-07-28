import React, { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { saveDetectionFromLeaf, archiveLeaf } from '../../lib/threatResearchService';
import type { LeafJobState } from '../../hooks/useThreatResearchJobs';
import type {
  ThreatResearchSession, ThreatResearchTree, AttackBehaviour, DetectionOpportunity,
} from '../../types/threatResearch';

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
  /** Retry handler. The id is bare behaviour id ("b1") for empty-behaviour
   *  rows where the engineer never produced opportunities; composite
   *  "{behaviour}/{opportunity}" for per-leaf retry. The orchestrator's
   *  retry_leaf endpoint accepts both shapes. */
  onRetryLeaf?: (behaviourOrCompositeId: string) => void;
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
  session, tree, activeBehaviourIds, jobsByLeaf, sessionFailed, onLeafClick, onRetryLeaf, onMutated,
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
        if (o.detection.saved_detection_id) continue;
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

  function selectAllPassing() {
    // Convenience: pick every eligible leaf whose QA verdict is pass or
    // pass_with_concerns (excludes fail and qa-pending).
    const next = new Set<LeafKey>();
    for (const l of eligibleLeaves) {
      const v = l.opportunity.detection.qa?.verdict;
      if (v === 'pass' || v === 'pass_with_concerns') next.add(l.key);
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
        Waiting for the Attack Researcher to produce behaviours...
      </div>
    );
  }

  // Session health summary — derived from the tree, NOT from session.status.
  // The status column on the row can be 'completed' even when every detection
  // is engineer_failed (legacy sessions from before the v55 status fix).
  // Surfacing these counts at the top of the list gives operators a one-glance
  // "is this session output usable?" answer.
  let engineerFailedCount = 0;
  let qaErrorCount = 0;
  let qaPassCount = 0;
  let qaPassWithConcernsCount = 0;
  let savedCount = 0;
  let totalDetections = 0;
  for (const b of tree.behaviours) {
    for (const o of b.opportunities) {
      totalDetections++;
      const det = o.detection;
      if (det.saved_detection_id) savedCount++;
      if (det.qa_error === 'engineer_failed') engineerFailedCount++;
      else if (det.qa_error) qaErrorCount++;
      if (det.qa?.verdict === 'pass') qaPassCount++;
      else if (det.qa?.verdict === 'pass_with_concerns') qaPassWithConcernsCount++;
      // qa.verdict === 'fail' is intentionally not surfaced in the header
      // counts — failed verdicts render per-row (Retry available) and
      // counting them here would imply a separate "X failed" badge that
      // doesn't exist in this view.
    }
  }
  const usableCount = qaPassCount + qaPassWithConcernsCount + savedCount;
  const passingCount = qaPassCount + qaPassWithConcernsCount;
  const allEngineerFailed = totalDetections > 0 && engineerFailedCount === totalDetections;
  const hasFailures = engineerFailedCount > 0 || qaErrorCount > 0;

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
              {engineerFailedCount > 0 ? `${engineerFailedCount} engineer-failed` : null}
              {engineerFailedCount > 0 && qaErrorCount > 0 ? ' · ' : ''}
              {qaErrorCount > 0 ? `${qaErrorCount} qa_error` : null}
            </span>
            <span>of {totalDetections} · {usableCount} usable ({passingCount} passing, {savedCount} saved) · retry individually or resume_session</span>
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
          onClick={selectAllPassing}
          disabled={passingCount === 0}
          title={passingCount === 0
            ? 'No detections have a passing QA verdict yet'
            : `Select ${passingCount} detection${passingCount === 1 ? '' : 's'} with pass / pass_with_concerns verdict`}
          className="rounded-md border border-outline-variant px-2 py-1 hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Select all passing{passingCount > 0 ? ` (${passingCount})` : ''}
        </button>
        {/* Quick summary alongside the action, so the table headers below
            aren't the only place users get an overview. */}
        <span className="text-on-surface-variant">
          {totalDetections} detection{totalDetections === 1 ? '' : 's'} ·{' '}
          {usableCount > 0 ? <span className="text-on-surface">{usableCount} usable</span> : <span className="text-on-surface-variant">0 usable</span>}
          {hasFailures ? <> · <span className="text-ext-coral">{engineerFailedCount + qaErrorCount} failed</span></> : null}
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
                  showRetry={!!sessionFailed && !activeIds.has(b.id)}
                  onRetry={onRetryLeaf ? () => onRetryLeaf(b.id) : undefined}
                />,
              ]
              : b.opportunities.map(o => {
                const key = `${b.id}/${o.id}` as LeafKey;
                const eligible = !o.detection.archived && !o.detection.saved_detection_id;
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

/** Canonical row state. Derived from (detection.qa, detection.qa_error,
 *  detection.saved_detection_id, detection.archived, jobs.{det,qa}_status).
 *  The mapping is precedence-ordered: terminal-good > running > terminal-bad
 *  > silent-loss > queued > idle. One label, one colour, one action. */
type RowState =
  | 'saved'           // already in library
  | 'discarded'       // user archived
  | 'detection_run'   // engineer worker is running right now
  | 'qa_run'          // qa worker is running right now
  | 'pass'            // qa.verdict='pass'  — ready to save
  | 'pass_concerns'   // qa.verdict='pass_with_concerns' — ready to save
  | 'fail'            // qa.verdict='fail' — actionable revision
  | 'eng_failed'      // qa_error='engineer_failed' — retry needed
  | 'qa_iteration'    // qa_error='iteration_cap' — KQL escape/JSON parse — retry
  | 'qa_budget'       // qa_error='model_budget_exhausted' — retry after cap bump
  | 'qa_timeout'      // qa_job_failed via reaper — retry
  | 'dup_no_qa'       // qa_error='duplicate_no_qa' — semantic duplicate, QA never ran
  | 'qa_other_error'  // any other qa_error string — retry
  | 'lost_silent'     // job completed yet qa is null and qa_error is null — retry
  | 'qa_pending'      // qa job exists, status=pending, not picked up yet
  | 'idle';           // no qa job, nothing to show

function resolveRowState(
  det: DetectionOpportunity['detection'],
  jobState: LeafJobState | null,
): RowState {
  if (det.archived) return 'discarded';
  if (det.saved_detection_id) return 'saved';
  if (jobState?.detection_status === 'running') return 'detection_run';
  if (jobState?.qa_status === 'running') return 'qa_run';
  if (det.qa?.verdict === 'pass') return 'pass';
  if (det.qa?.verdict === 'pass_with_concerns') return 'pass_concerns';
  if (det.qa?.verdict === 'fail') return 'fail';
  if (det.qa_error === 'engineer_failed') return 'eng_failed';
  if (det.qa_error === 'iteration_cap') return 'qa_iteration';
  if (det.qa_error === 'model_budget_exhausted') return 'qa_budget';
  if (det.qa_error && det.qa_error.startsWith('qa_job_failed')) return 'qa_timeout';
  // Before the generic qa_error arm: this leaf is a semantic duplicate that
  // never got a verdict. It used to arrive here carrying a synthesised
  // qa.verdict='pass_with_concerns' and was caught by the 'pass_concerns'
  // branch above — i.e. it rendered as QA-approved without QA ever running.
  if (det.qa_error === 'duplicate_no_qa') return 'dup_no_qa';
  if (det.qa_error) return 'qa_other_error';
  // qa is null and qa_error is null. If the qa job's terminal, the verdict
  // was silently dropped (the historical id='d1' bug, or another path that
  // landed an empty qa). If the qa job is still pending, this leaf is in
  // the dispatcher queue waiting for a worker.
  if (jobState?.qa_status === 'completed' || jobState?.qa_status === 'failed') return 'lost_silent';
  if (jobState?.qa_status === 'pending') return 'qa_pending';
  return 'idle';
}

interface StateRenderConfig {
  label: string;
  icon: string | null;
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
  qa_run:         { label: 'QA running…',       icon: 'loader', iconSpin: true, textCls: 'text-primary',                 borderCls: 'border-l-primary',          actionLabel: null   },
  pass:           { label: 'Passed QA',         icon: 'check-circle',   textCls: 'text-ext-teal font-medium',          borderCls: 'border-l-ext-teal',        actionLabel: 'Save' },
  pass_concerns:  { label: 'Passed with concerns', icon: 'alert-circle', textCls: 'text-ext-amber font-medium',         borderCls: 'border-l-ext-amber',       actionLabel: 'Save' },
  fail:           { label: 'QA: needs revision', icon: 'x-circle',      textCls: 'text-ext-coral font-medium',         borderCls: 'border-l-ext-coral',       actionLabel: 'Retry' },
  eng_failed:     { label: 'Engineer failed',    icon: 'x-circle',      textCls: 'text-ext-coral font-semibold',       borderCls: 'border-l-ext-coral',       actionLabel: 'Retry' },
  qa_iteration:   { label: 'QA stuck (JSON/escape)', icon: 'alert-triangle', textCls: 'text-ext-amber font-medium',     borderCls: 'border-l-ext-amber',       actionLabel: 'Retry' },
  qa_budget:      { label: 'QA budget exhausted', icon: 'alert-triangle', textCls: 'text-ext-amber font-medium',       borderCls: 'border-l-ext-amber',       actionLabel: 'Retry' },
  qa_timeout:     { label: 'QA worker timeout', icon: 'alert-triangle', textCls: 'text-ext-amber font-medium',         borderCls: 'border-l-ext-amber',       actionLabel: 'Retry' },
  dup_no_qa:      { label: "Duplicate — QA didn't run", icon: 'copy',     textCls: 'text-on-surface-variant font-medium', borderCls: 'border-l-outline-variant', actionLabel: null   },
  qa_other_error: { label: 'QA error',           icon: 'alert-triangle', textCls: 'text-ext-amber font-medium',        borderCls: 'border-l-ext-amber',       actionLabel: 'Retry' },
  lost_silent:    { label: 'Lost — needs retry', icon: 'help-circle',   textCls: 'text-ext-amber font-medium',         borderCls: 'border-l-ext-amber',       actionLabel: 'Retry' },
  qa_pending:     { label: 'QA queued',          icon: 'clock',         textCls: 'text-on-surface-variant italic',     borderCls: 'border-l-transparent',     actionLabel: null   },
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
  // A semantic duplicate that never reached QA has nothing worth saving — the
  // detection it duplicates is the one to keep. Suppress the checkbox rather
  // than let it into a bulk save.
  const isDuplicateNoQa = state === 'dup_no_qa';

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

  const failureTooltip =
    state === 'qa_other_error' ? `qa_error: ${det.qa_error}` :
    state === 'qa_timeout'     ? `qa_error: ${det.qa_error}` :
    state === 'qa_budget'      ? 'Session model-call cap reached. Resume_session with a cap bump retries this leaf.' :
    state === 'qa_iteration'   ? 'QA agent loop hit iteration cap — typically a JSON parse failure on the candidate KQL (escape chars). Retry usually succeeds.' :
    state === 'eng_failed'     ? 'Detection engineer agent loop failed (budget/timeout/validation). Retry regenerates the detection from scratch.' :
    state === 'lost_silent'    ? 'QA verdict was lost mid-pipeline (historical id-mismatch bug). Retry re-runs QA against the existing detection body.' :
    state === 'dup_no_qa'      ? `Semantic duplicate of detection ${det.duplicate_of ?? 'another leaf'}; QA never ran on this one. Nothing to save — use the detection it duplicates.` :
    state === 'fail'           ? (det.qa?.concerns?.[0] ?? 'QA judged the detection inadequate.') :
    null;

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer hover:bg-surface-container-high border-l-4 ${render.borderCls} ${det.archived ? 'opacity-50' : ''}`}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {eligible && !isEngineerFailed && !isDuplicateNoQa ? (
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
  showRetry,
  onRetry,
}: {
  behaviour: AttackBehaviour;
  active: boolean;
  showRetry: boolean;
  onRetry?: () => void;
}) {
  // Four mutually-exclusive states for a behaviour with zero opportunities:
  //   1. active            — agent is currently working on it
  //   2. engineer_failed   — agent loop crashed (budget/timeout/validation).
  //                          Recoverable via retry; this is NOT a model
  //                          verdict that the behaviour is undetectable.
  //   3. not_detectable    — engineer ran successfully and concluded no
  //                          reliable signal exists.
  //   4. otherwise         — genuinely waiting for engineer to claim the job.
  const isFailed = !active && behaviour.detectability === 'engineer_failed';
  const isNotDetectable = !active && behaviour.detectability === 'not_detectable';

  const message = active
    ? 'Agent working on this behaviour…'
    : isFailed
      ? 'Engineer agent failed (budget / timeout / validation). Retry available.'
      : isNotDetectable
        ? (behaviour.detectability_rationale
            || 'Engineer ran but found no reliable signal to detect this behaviour with current telemetry.')
        : 'Waiting for the Detection Engineer…';

  // Always offer Retry on engineer_failed regardless of session-level
  // showRetry flag — the recovery is per-leaf and harmless.
  const offerRetry = (showRetry || isFailed) && !!onRetry;

  // Pending rows still deserve a left-edge indicator so the row visually
  // aligns with status rows. Active = primary pulse, failed = error, not
  // detectable = muted, default waiting = neutral outline.
  const pendingBorder = active
    ? 'border-l-primary'
    : isFailed
      ? 'border-l-error'
      : 'border-l-outline-variant';

  return (
    <tr className={`bg-surface-container-low border-l-4 ${pendingBorder}`}>
      {/* Empty checkbox cell to keep column alignment with selectable rows. */}
      <td className="px-3 py-2" />
      <td className="px-4 py-2 text-xs text-on-surface-variant">{behaviour.tactic}</td>
      <td className="px-4 py-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-on-surface-variant">
          {active && <Icon name="loader" size={12} className="animate-spin text-primary" />}
          {isFailed && <Icon name="alert-triangle" size={12} className="text-error" />}
          {isNotDetectable && <Icon name="eye-off" size={12} className="text-on-surface-variant" />}
          {behaviour.title}
          <TrustFlags behaviour={behaviour} />
        </span>
      </td>
      <td colSpan={6} className="px-4 py-2 text-xs italic text-on-surface-variant">
        {isFailed ? <span className="not-italic font-medium text-error">Engineer failed. </span> : null}
        {isNotDetectable ? <span className="not-italic font-medium text-on-surface-variant">Not detectable. </span> : null}
        {message}
      </td>
      <td className="px-4 py-2">
        {offerRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium ${
              isFailed
                ? 'border border-primary bg-primary text-on-primary hover:opacity-90'
                : 'border border-outline-variant text-on-surface hover:bg-surface-container'
            }`}
          >
            Retry
          </button>
        ) : null}
      </td>
    </tr>
  );
}

/** Compact trust-signal cluster shown next to a behaviour title in the
 *  list view. Mirrors the per-detection chips on DetectionLeafCard so
 *  hallucination flags and unsourced-behaviour signals are visible while
 *  browsing the table — without these, a user would only see the flags
 *  by clicking into each leaf, defeating the whole point of the flags. */
function TrustFlags({ behaviour }: { behaviour: AttackBehaviour }) {
  const unverifiedCount = (behaviour.unverified_mitre_ids ?? []).length;
  const inconsistentCount = (behaviour.tactic_inconsistent_mitre_ids ?? []).length;
  const unsourced = behaviour.unsourced === true;
  if (!unverifiedCount && !inconsistentCount && !unsourced) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {unverifiedCount > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-error-container px-1 py-0.5 text-[10px] font-medium text-on-error-container"
          title={`${unverifiedCount} MITRE id${unverifiedCount === 1 ? '' : 's'} not in canonical table — possible hallucination`}
        >
          <Icon name="alert-triangle" size={9} />
          {unverifiedCount}
        </span>
      )}
      {inconsistentCount > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-secondary-container px-1 py-0.5 text-[10px] font-medium text-on-secondary-container"
          title={`${inconsistentCount} MITRE id${inconsistentCount === 1 ? '' : 's'} canonically belong to a different tactic than this behaviour's tagged tactic`}
        >
          <Icon name="alert-circle" size={9} />
          {inconsistentCount}
        </span>
      )}
      {unsourced && (
        <span
          className="inline-flex items-center rounded bg-secondary-container px-1 py-0.5 text-[10px] font-medium text-on-secondary-container"
          title="Behaviour is from training knowledge, no specific source citation"
        >
          training
        </span>
      )}
    </span>
  );
}

export default ResearchList;
