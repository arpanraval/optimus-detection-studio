import React, { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { saveDetectionFromLeaf, archiveLeaf } from '../../lib/threatResearchService';
import type {
  ThreatResearchSession, ThreatResearchTree, AttackBehaviour, DetectionOpportunity,
} from '../../types/threatResearch';

interface Props {
  session: ThreatResearchSession;
  tree: ThreatResearchTree;
  /** Behaviours with an agent currently running on them; renders an inline
   *  spinner next to the behaviour title. Derived from the events stream. */
  activeBehaviourIds?: ReadonlySet<string>;
  /** When true, behaviours with no opportunities show a per-leaf "Retry"
   *  button. Used in the failed-session view. */
  sessionFailed?: boolean;
  onLeafClick: (b: AttackBehaviour, o: DetectionOpportunity) => void;
  onRetryLeaf?: (behaviourId: string) => void;
  /** Called after a bulk save/discard so the parent refetches the session. */
  onMutated?: () => void;
}

/** Composite key for selection — same shape as the leaf path the panel uses. */
type LeafKey = string; // `${behaviourId}/${opportunityId}`

const EMPTY_ACTIVE_SET: ReadonlySet<string> = new Set();

const VERDICT_DOT: Record<string, string> = {
  pass:                'bg-tertiary',
  pass_with_concerns:  'bg-tertiary-fixed-dim',
  fail:                'bg-error',
};

const FEASIBILITY_LABEL: Record<string, string> = {
  covered:    'covered',
  partial:    'partial',
  uncovered:  'uncovered',
};

export function ResearchList({
  session, tree, activeBehaviourIds, sessionFailed, onLeafClick, onRetryLeaf, onMutated,
}: Props) {
  const { showToast } = useToast();
  const activeIds = activeBehaviourIds ?? EMPTY_ACTIVE_SET;
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

  return (
    <div className="flex-1 overflow-auto p-4">
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
      <div className="mb-3 flex items-center gap-2 text-xs text-on-surface-variant">
        <button
          type="button"
          onClick={selectAllPassing}
          className="rounded-md border border-outline-variant px-2 py-1 hover:bg-surface-container"
        >
          Select all passing
        </button>
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
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">QA</th>
            <th className="border-b border-outline-variant px-4 py-3 text-left font-medium">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
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
                return (
                  <Row
                    key={`${b.id}-${o.id}`}
                    behaviour={b}
                    opportunity={o}
                    active={activeIds.has(b.id)}
                    onClick={() => onLeafClick(b, o)}
                    eligible={eligible}
                    selected={selected.has(key)}
                    onToggleSelect={() => toggleOne(key)}
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

function Row({
  behaviour, opportunity, active, onClick, eligible, selected, onToggleSelect,
}: {
  behaviour: AttackBehaviour;
  opportunity: DetectionOpportunity;
  active: boolean;
  onClick: () => void;
  eligible: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const det = opportunity.detection;
  return (
    <tr onClick={onClick} className={`cursor-pointer hover:bg-surface-container-high ${det.archived ? 'opacity-50' : ''}`}>
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {eligible ? (
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
      <td className="px-4 py-2.5 font-medium text-on-surface">{det.name}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {det.mitre_technique_ids.slice(0, 3).map(id => (
            <span key={id} className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-medium text-on-primary-container">{id}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5"><span className="text-xs text-on-surface">{det.suggested_severity}</span></td>
      <td className="px-4 py-2.5"><span className="text-xs text-on-surface-variant">{FEASIBILITY_LABEL[det.feasibility]}</span></td>
      <td className="px-4 py-2.5">
        {det.qa ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface">
            <span className={`h-2 w-2 rounded-full ${VERDICT_DOT[det.qa.verdict] ?? 'bg-surface-variant'}`} />
            {det.qa.verdict.replace(/_/g, ' ')}
          </span>
        ) : (
          <span className="text-xs text-on-surface-variant">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {/* State column reflects the leaf's actual lifecycle, not just save
            status. Order: terminal user actions first, then live agent state,
            then ready-to-review. */}
        {det.saved_detection_id ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-tertiary">
            <Icon name="check" size={12} /> Saved
          </span>
        ) : det.archived ? (
          <span className="text-xs text-on-surface-variant">Discarded</span>
        ) : active && !det.qa ? (
          <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
            <Icon name="loader" size={12} className="animate-spin text-primary" />
            QA running
          </span>
        ) : !det.qa ? (
          <span className="text-xs text-on-surface-variant italic">QA queued</span>
        ) : det.qa.verdict === 'fail' ? (
          <span className="text-xs font-medium text-error">Needs revision</span>
        ) : (
          <span className="text-xs font-medium text-on-surface">Ready to save</span>
        )}
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
  const isWaiting = !active && !isFailed && !isNotDetectable;

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

  return (
    <tr className="bg-surface-container-low">
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
