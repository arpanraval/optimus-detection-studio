import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { saveDetectionFromLeaf, archiveLeaf, unarchiveLeaf } from '../../lib/threatResearchService';
import { routeHelpers } from '../../router/routes';
import type { ThreatResearchSession, AttackBehaviour, DetectionOpportunity } from '../../types/threatResearch';

interface Props {
  session: ThreatResearchSession;
  behaviour: AttackBehaviour;
  opportunity: DetectionOpportunity;
  onClose: () => void;
  onMutated: () => void;          // parent re-fetches session
}

const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 900;
const PANEL_DEFAULT_WIDTH = 520;
const PANEL_STORAGE_KEY = 'tr-leaf-panel-width';

const VERDICT_STYLE: Record<string, string> = {
  pass:                'bg-tertiary-container text-on-tertiary-container',
  pass_with_concerns:  'bg-secondary-container text-on-secondary-container',
  fail:                'bg-error-container text-on-error-container',
};

const FEASIBILITY_STYLE: Record<string, string> = {
  covered:    'bg-tertiary-container text-on-tertiary-container',
  partial:    'bg-secondary-container text-on-secondary-container',
  uncovered:  'bg-error-container text-on-error-container',
};

export function DetectionLeafCard({ session, behaviour, opportunity, onClose, onMutated }: Props) {
  const { showToast } = useToast();
  const det = opportunity.detection;
  const [busy, setBusy] = useState(false);
  // Acknowledgement gate for saving a QA-failed detection. Resets when the
  // user opens a different leaf because the component remounts.
  const [confirmFailedSave, setConfirmFailedSave] = useState(false);

  // Resizable / collapsible panel state
  const [width, setWidth] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? Number(localStorage.getItem(PANEL_STORAGE_KEY)) : NaN;
    return Number.isFinite(stored) && stored >= PANEL_MIN_WIDTH ? Math.min(stored, PANEL_MAX_WIDTH) : PANEL_DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const next = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, d.startW + (d.startX - e.clientX)));
      setWidth(next);
    }
    function onUp() {
      if (dragRef.current) {
        localStorage.setItem(PANEL_STORAGE_KEY, String(width));
      }
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [width]);

  function startResize(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  async function handleSave() {
    setBusy(true);
    try {
      const result = await saveDetectionFromLeaf(session, behaviour.id, opportunity.id, det);
      // tree_patched===false means library insert succeeded but the
      // session-tree leaf badge couldn't be updated. The detection exists
      // in the library; the badge will catch up on refresh.
      if (result.tree_patched) {
        showToast('success', `Saved as Draft (id: ${result.detection_id.slice(0, 8)})`);
      } else {
        showToast(
          'info',
          `Saved as Draft (id: ${result.detection_id.slice(0, 8)}) — leaf badge will update on refresh`,
        );
      }
      onMutated();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    setBusy(true);
    try {
      await archiveLeaf(session, behaviour.id, opportunity.id, det.id);
      showToast('info', 'Detection discarded — leaf marked archived in this session');
      onMutated();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnarchive() {
    setBusy(true);
    try {
      await unarchiveLeaf(session, behaviour.id, opportunity.id, det.id);
      onMutated();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  }

  // Collapsed: just a thin rail with an expand button.
  if (collapsed) {
    return (
      <aside className="fixed right-0 top-0 z-40 flex h-full w-10 flex-col items-center border-l border-outline-variant bg-surface-container shadow-2xl">
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand detection panel"
          className="mt-3 flex h-8 w-8 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close detection panel"
          className="mt-1 flex h-8 w-8 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          <Icon name="x" size={16} />
        </button>
        <div className="mt-3 -rotate-90 whitespace-nowrap text-[11px] font-medium text-on-surface-variant">
          {det.name.slice(0, 40)}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="fixed right-0 top-0 z-40 flex h-full flex-col border-l border-outline-variant bg-surface-container shadow-2xl"
      style={{ width: `${width}px` }}
    >
      {/* Resize handle on the LEFT edge */}
      <div
        onMouseDown={startResize}
        aria-label="Resize panel"
        className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/50"
      />

      <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-on-surface-variant">{behaviour.title} → {opportunity.title}</div>
          <h3 className="truncate text-base font-semibold text-on-surface">{det.name}</h3>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Collapse"
          className="text-on-surface-variant hover:text-on-surface"
        >
          <Icon name="chevron-right" size={18} />
        </button>
        <button onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {det.archived && (
          <div className="rounded-md bg-surface-variant px-3 py-2 text-sm text-on-surface-variant">
            This detection has been discarded for this session.
          </div>
        )}
        {det.saved_detection_id && (
          <div className="flex items-center gap-2 rounded-md bg-tertiary-container px-3 py-2 text-sm text-on-tertiary-container">
            <Icon name="check-circle" size={16} />
            Saved to library as a Draft.
          </div>
        )}

        <Section title="Description">
          <p className="text-sm text-on-surface">{det.description}</p>
        </Section>

        <Section title="Verdict">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {det.qa && (
              <>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${VERDICT_STYLE[det.qa.verdict]}`}>
                  QA: {det.qa.verdict.replace(/_/g, ' ')}
                </span>
                <span className="inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 font-medium text-on-surface-variant">
                  Coverage: {det.qa.coverage_quality}
                </span>
                {/* Show iteration count only when actor-critic actually ran
                    revisions (>0). Pre-revision-loop sessions always emit 0
                    and rendering "Iterations: 0" misleadingly suggests the
                    loop ran and chose not to revise. */}
                {det.qa.iteration_count > 0 && (
                  <span className="inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 font-medium text-on-surface-variant">
                    Revisions: {det.qa.iteration_count}
                  </span>
                )}
                {det.qa.duplicate_of && (
                  <span className="inline-flex items-center rounded-full bg-tertiary-container px-2 py-0.5 font-medium text-on-tertiary-container">
                    Duplicate
                  </span>
                )}
              </>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${FEASIBILITY_STYLE[det.feasibility]}`}>
              Feasibility: {det.feasibility}
            </span>
            <span className="inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 font-medium text-on-surface-variant">
              {det.suggested_severity}
            </span>
            <span className="inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 font-medium text-on-surface-variant">
              {det.suggested_detection_type}
            </span>
          </div>
          {det.feasibility_notes && (
            <div className="mt-2 text-xs text-on-surface-variant">{det.feasibility_notes}</div>
          )}
          {det.qa && det.qa.concerns.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold text-on-surface">Concerns</div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-on-surface-variant">
                {det.qa.concerns.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          {det.qa && det.qa.suggested_changes.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold text-on-surface">Suggested changes</div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-on-surface-variant">
                {det.qa.suggested_changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          {det.qa && (det.qa.iteration_history?.length ?? 0) > 1 && (
            <RevisionHistory history={det.qa.iteration_history} />
          )}
        </Section>

        <Section title={`Query (${det.query_language})`}>
          <pre className="overflow-x-auto rounded-md bg-surface-container-highest px-3 py-2.5 text-xs text-on-surface">
            <code>{det.query}</code>
          </pre>
        </Section>

        <Section title="MITRE">
          <div className="flex flex-wrap gap-1.5">
            {det.mitre_technique_ids.map(id => {
              const unverified = (det.unverified_mitre_ids ?? []).includes(id);
              const inconsistent = (behaviour.tactic_inconsistent_mitre_ids ?? []).includes(id);
              const flag = unverified ? 'unverified' : inconsistent ? 'tactic-mismatch' : null;
              const cls = flag === 'unverified'
                ? 'bg-error-container text-on-error-container'
                : flag === 'tactic-mismatch'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-primary-container text-on-primary-container';
              const titleAttr = flag === 'unverified'
                ? `${id} not found in canonical MITRE table — possible hallucination`
                : flag === 'tactic-mismatch'
                  ? `${id}'s canonical tactic does not match this behaviour's tagged tactic (${behaviour.tactic})`
                  : id;
              return (
                <a
                  key={id}
                  href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`}
                  target="_blank" rel="noopener noreferrer"
                  title={titleAttr}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:opacity-80 ${cls}`}
                >
                  {id}
                  {flag === 'unverified' && <Icon name="alert-triangle" size={11} />}
                  {flag === 'tactic-mismatch' && <Icon name="alert-circle" size={11} />}
                </a>
              );
            })}
            <span className="inline-flex items-center rounded-md bg-surface-variant px-2 py-1 text-xs text-on-surface-variant">
              {det.tactic}
            </span>
            {behaviour.unsourced && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-secondary-container px-2 py-1 text-xs font-medium text-on-secondary-container"
                title="Behaviour is from training knowledge, no specific source citation"
              >
                <Icon name="alert-circle" size={11} />
                training-only
              </span>
            )}
          </div>
        </Section>

        <Section title="Citations">
          <ul className="space-y-1.5">
            {det.citations.length === 0
              ? <li className="text-xs italic text-on-surface-variant">No citations.</li>
              : det.citations.map((c, i) => (
                <li key={i} className="text-xs">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{c.source}</a>
                  <span className="text-on-surface"> — {c.claim}</span>
                </li>
              ))}
          </ul>
        </Section>

        {det.covers_behaviour_ids.length > 1 && (
          <Section title="Cross-references">
            <div className="text-xs text-on-surface">
              This detection also covers: {det.covers_behaviour_ids.filter(id => id !== behaviour.id).join(', ')}
            </div>
          </Section>
        )}
      </div>

      {/* Footer: QA-fail detections are guarded behind a confirmation toggle
          rather than just disabled — analysts may legitimately want to save
          a flagged detection for manual review. The default-off state stops
          accidental ship of broken queries. */}
      <Footer
        det={det}
        busy={busy}
        confirmFailedSave={confirmFailedSave}
        setConfirmFailedSave={setConfirmFailedSave}
        onSave={handleSave}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
      />
    </aside>
  );
}

function Footer({
  det, busy, confirmFailedSave, setConfirmFailedSave, onSave, onArchive, onUnarchive,
}: {
  det: DetectionOpportunity['detection'];
  busy: boolean;
  confirmFailedSave: boolean;
  setConfirmFailedSave: (v: boolean) => void;
  onSave: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  const qaFailed = det.qa?.verdict === 'fail';
  const saveBlocked = qaFailed && !confirmFailedSave;
  return (
    <div className="border-t border-outline-variant px-5 py-3">
      {qaFailed && !det.saved_detection_id && (
        <label className="mb-2 flex items-start gap-2 text-xs text-on-surface-variant">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmFailedSave}
            onChange={(e) => setConfirmFailedSave(e.target.checked)}
          />
          <span>
            <span className="font-medium text-error">QA flagged this detection as failing.</span>{' '}
            Review the concerns above before saving. Tick to acknowledge and enable Save.
          </span>
        </label>
      )}
      <div className="flex items-center gap-2">
        {det.saved_detection_id ? (
          <Button
            variant="outlined"
            onClick={() => window.open(routeHelpers.detectionDetail(det.saved_detection_id!), '_blank')}
          >
            View in Library
          </Button>
        ) : (
          <Button onClick={onSave} disabled={busy || det.archived || saveBlocked}>
            {busy ? 'Saving...' : 'Save to Library'}
          </Button>
        )}
        {det.archived ? (
          <Button variant="outlined" onClick={onUnarchive} disabled={busy}>Restore</Button>
        ) : (
          <Button variant="outlined" onClick={onArchive} disabled={busy}>Discard</Button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{title}</div>
      {children}
    </div>
  );
}

/** Collapsible accordion of QA iteration_history. The default-rendered
 *  "Concerns" + "Suggested changes" lists show the FINAL round only —
 *  this surfaces the prior rounds so users can see what changed between
 *  revisions and whether the revision actually addressed each concern.
 *  Hidden when there's ≤1 entry (only the initial QA pass with no
 *  revisions to compare against). */
function RevisionHistory({
  history,
}: {
  history: NonNullable<DetectionOpportunity['detection']['qa']>['iteration_history'];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs font-semibold text-on-surface hover:underline"
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        Revision history ({history.length} round{history.length === 1 ? '' : 's'})
      </button>
      {open && (
        <ol className="mt-2 space-y-2 border-l border-outline-variant pl-3 text-xs">
          {history.map((round, i) => (
            <li key={i}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${VERDICT_STYLE[round.verdict] ?? ''}`}>
                  Round {i + 1}: {round.verdict.replace(/_/g, ' ')}
                </span>
              </div>
              {round.concerns.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-on-surface-variant">
                  {round.concerns.map((c, j) => <li key={j}>{c}</li>)}
                </ul>
              )}
              {round.concerns.length === 0 && (
                <div className="text-on-surface-variant italic">No concerns this round.</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default DetectionLeafCard;
