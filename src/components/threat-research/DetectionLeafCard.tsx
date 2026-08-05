import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { useSigmaConverter } from '../../hooks/useSigmaConverter';
import { saveDetectionFromLeaf, archiveLeaf, unarchiveLeaf } from '../../lib/threatResearchService';
import { routeHelpers } from '../../router/routes';
import { Section, CitationList } from './shared';
import type {
  ThreatResearchSession, AttackBehaviour, DetectionOpportunity, LibraryNearMatch,
  GeneratedDetection,
} from '../../types/threatResearch';

/** A few common conversion targets — not every backend SUPPORTED_BACKENDS
 *  lists, just the ones a Sigma-output session is most likely to need.
 *  `id` is the pysigma backend id (SigmaConverterService.convert's `target`
 *  param), NOT the ResearchQueryLanguage the rest of this feature uses. */
const SIGMA_CONVERT_TARGETS: { id: string; label: string }[] = [
  { id: 'kusto',   label: 'KQL (Sentinel / Defender)' },
  { id: 'splunk',  label: 'Splunk SPL' },
  { id: 'lucene',  label: 'Elasticsearch (Lucene)' },
  { id: 'eql',     label: 'Elasticsearch (EQL)' },
  { id: 'esql',    label: 'Elasticsearch (ES|QL)' },
];

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
  const stored = opportunity.detection;
  const [busy, setBusy] = useState(false);
  // Which candidate version the analyst has chosen, null = whatever the
  // pipeline made active.
  //
  // This lives HERE rather than inside QueryVersions because it has to reach
  // handleSave. When it was local to that component, picking v1 changed only
  // what was displayed: the save still sent `det`, whose `query` mirrors the
  // active version, so the analyst read v1, pressed Save, and stored v2. An
  // affordance that looks like a choice and is not one is worse than no
  // affordance.
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const det = useMemo<GeneratedDetection>(() => {
    const versions = stored.candidate_versions ?? [];
    if (selectedVersion === null || versions.length < 2) return stored;
    const picked = versions.find(v => v.version === selectedVersion);
    if (!picked) return stored;
    return { ...stored, query: picked.query, active_version: picked.version };
  }, [stored, selectedVersion]);
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
      <aside className="absolute inset-y-0 right-0 z-40 flex w-10 flex-col items-center border-l border-outline-variant bg-surface-container shadow-2xl animate-slide-left">
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand detection panel"
          className="mt-3 flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close detection panel"
          className="mt-1 flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
        >
          <Icon name="x" size={16} />
        </button>
        <div className="pointer-events-none mt-3 -rotate-90 whitespace-nowrap text-[11px] font-medium text-on-surface-variant">
          {det.name.slice(0, 40)}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="absolute inset-y-0 right-0 z-40 flex flex-col border-l border-outline-variant bg-surface-container shadow-2xl animate-slide-left"
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
            {det.reused_from_library
              // reused_from_library means the reuse-first short-circuit
              // pointed this leaf at an existing rule — no user action
              // happened, and the rule may already be Production/Testing,
              // not a Draft. The "Saved to library as a Draft" copy below
              // is wrong for this case.
              ? 'Already in your library — matched to an existing rule, not generated this session.'
              : 'Saved to library as a Draft.'}
          </div>
        )}

        <Section title="Description">
          <p className="text-sm text-on-surface">{det.description}</p>
        </Section>

        <Section title="Verdict">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Sessions that ran before the QA agent was removed still carry a
                verdict. It is shown as the historical record it is — nothing
                writes one now, and nothing reads one to decide anything. */}
            {det.qa && (
              <>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${VERDICT_STYLE[det.qa.verdict]}`}>
                  QA (archived): {det.qa.verdict.replace(/_/g, ' ')}
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
            {/* Semantic duplicate found by the finalise dedup pass. Recorded on
                the detection, never on a synthesised verdict. */}
            {det.duplicate_of && (
              <span
                className="inline-flex items-center rounded-full bg-tertiary-container px-2 py-0.5 font-medium text-on-tertiary-container"
                title={`Semantic duplicate of detection ${det.duplicate_of} (fingerprint match across MITRE / telemetry / query tokens), found by the finalise dedup pass.`}
              >
                Duplicate of {det.duplicate_of}
              </span>
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
          {det.library_near_match && <LibraryNearMatchNote match={det.library_near_match} />}
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
          <QueryVersions
            det={stored}
            selected={selectedVersion}
            onSelect={setSelectedVersion}
          />
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
          <CitationList citations={det.citations} />
        </Section>

        {det.covers_behaviour_ids.length > 1 && (
          <Section title="Cross-references">
            <div className="text-xs text-on-surface">
              This detection also covers: {det.covers_behaviour_ids.filter(id => id !== behaviour.id).join(', ')}
            </div>
          </Section>
        )}
      </div>

      <Footer
        det={det}
        busy={busy}
        onSave={handleSave}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
      />
    </aside>
  );
}

function Footer({
  det, busy, onSave, onArchive, onUnarchive,
}: {
  det: DetectionOpportunity['detection'];
  busy: boolean;
  onSave: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  // Save is gated on nothing but the mechanics of saving.
  //
  // It used to be gated on a QA verdict existing, and on acknowledging a `fail`
  // via a checkbox. With the QA agent removed `det.qa` is always null, so that
  // first condition would have disabled Save permanently — turning "the user
  // decides what to keep" into "the user can keep nothing". Deciding is the
  // whole point of this panel: the query, its citations, the schema notes and
  // any near-match are all on screen above.
  return (
    <div className="border-t border-outline-variant px-5 py-3">
      <div className="flex items-center gap-2">
        {det.saved_detection_id ? (
          <Button
            variant="outlined"
            onClick={() => window.open(routeHelpers.detectionDetail(det.saved_detection_id!), '_blank')}
          >
            View in Library
          </Button>
        ) : (
          <Button onClick={onSave} disabled={busy || det.archived}>
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

/** Convert-and-copy for Sigma-language detections. SigmaConverterService is
 *  a Pyodide WASM worker — booting it loads a full Python + sigma-cli
 *  runtime in-browser, which is real cost (several seconds) that shouldn't
 *  happen just because a leaf card opened. useSigmaConverter() is only
 *  called (and the worker only created) inside SigmaConvertRunner, which
 *  itself only mounts after the user explicitly clicks Convert — the idle
 *  state below never touches the hook. */
function SigmaConvertSection({ query }: { query: string }) {
  const [target, setTarget] = useState(SIGMA_CONVERT_TARGETS[0].id);
  const [running, setRunning] = useState(false);

  if (running) {
    return (
      <SigmaConvertRunner
        query={query}
        target={target}
        targetLabel={SIGMA_CONVERT_TARGETS.find(t => t.id === target)?.label ?? target}
        onDone={() => setRunning(false)}
      />
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <select
        value={target}
        onChange={e => setTarget(e.target.value)}
        className="rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface"
        aria-label="Convert target"
      >
        {SIGMA_CONVERT_TARGETS.map(t => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <Button variant="outlined" size="sm" onClick={() => setRunning(true)}>
        <Icon name="file-code" size={12} />
        Convert &amp; Copy
      </Button>
    </div>
  );
}

function SigmaConvertRunner({
  query, target, targetLabel, onDone,
}: {
  query: string;
  target: string;
  targetLabel: string;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const { isReady, convert } = useSigmaConverter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isReady || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const result = await convert(query, target);
      if (!result || result.error) {
        showToast('error', `Conversion to ${targetLabel} failed: ${result?.error ?? 'unknown error'}`);
      } else {
        try {
          await navigator.clipboard.writeText(result.query);
          showToast('success', `Converted to ${targetLabel} and copied to clipboard`);
        } catch {
          showToast('info', `Converted to ${targetLabel}, but clipboard write was blocked — check browser permissions`);
        }
      }
      onDone();
    })();
  }, [isReady, convert, query, target, targetLabel, onDone, showToast]);

  return (
    <div className="mt-2 flex items-center gap-2">
      <Button variant="outlined" size="sm" disabled>
        <Icon name="loader" size={12} className="animate-spin" />
        {isReady ? 'Converting…' : 'Loading converter…'}
      </Button>
    </div>
  );
}

/** Explains why a new query exists next to an adjacent library rule. The
 *  library search deliberately matches across every status so near-matches
 *  stay visible; only deployed rules in the session's language suppress
 *  generation. Without this note the decision lived solely in the event log,
 *  and the user just saw a duplicate-looking detection with no explanation. */
function LibraryNearMatchNote({ match }: { match: LibraryNearMatch }) {
  const isLanguage = match.skipped_reason === 'language_mismatch';
  const reason = isLanguage
    ? `it targets ${match.query_language || 'another SIEM'} and this session targets ${match.target_language}`
    : `it is ${match.status || 'not deployed'}, so it isn't detecting anything yet`;
  return (
    <div className="mt-2 rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
      <span className="font-medium text-on-surface">Not counted as coverage.</span>{' '}
      Your library has{' '}
      <a
        href={`/library/detections/${match.existing_detection_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline"
      >
        {match.name}
      </a>{' '}
      (similarity {match.combined_score.toFixed(2)}), but {reason}. A new detection was written instead.
    </div>
  );
}

/** Collapsible accordion of QA iteration_history. The default-rendered
 *  "Concerns" + "Suggested changes" lists show the FINAL round only —
 *  this surfaces the prior rounds so users can see what changed between
 *  revisions and whether the revision actually addressed each concern.
 *  Hidden when there's ≤1 entry (only the initial QA pass with no
 *  revisions to compare against). */
/** Query body, with the version history when QA revised it.
 *
 *  A QA `fail` triggers one engineer revision and no second critique. That
 *  revision used to REPLACE the query, so a wrong fail silently destroyed the
 *  better detector: a broad `mshta.exe` + http primitive becomes a four-
 *  condition ClickFix-only query -- higher fidelity, far worse recall, and no
 *  way back.
 *
 *  Both versions are kept now, so this shows both and lets the analyst read
 *  QA's reasoning between them. The revision is a proposal; the choice is
 *  theirs. Sessions persisted before versioning have no candidate_versions and
 *  render exactly as before. */
function QueryVersions({
  det, selected, onSelect,
}: {
  det: GeneratedDetection;
  /** null = show whatever the pipeline made active. Owned by the parent so the
   *  choice reaches Save. */
  selected: number | null;
  onSelect: (version: number) => void;
}) {
  const versions = det.candidate_versions ?? [];

  const active = det.active_version ?? (versions.length || 1);
  const shown = selected ?? active;
  const shownVersion = versions.find(v => v.version === shown);
  const body = shownVersion?.query ?? det.query;
  const shownValidation = shownVersion?.validation ?? null;

  return (
    <>
      {versions.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {versions.map(v => (
            <button
              key={v.version}
              type="button"
              onClick={() => onSelect(v.version)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                v.version === shown
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
              }`}
            >
              v{v.version}
              {v.source === 'generated' ? ' · original' : ' · QA revision'}
              {v.version === active ? ' · active' : ''}
              {v.validation?.checked && v.validation.problems.length > 0 ? ' · ✗' : ''}
            </button>
          ))}
          <span className="text-[11px] text-on-surface-variant">
            {shown === active
              ? 'Saving stores this version.'
              : `Saving stores v${shown}, not the active v${active}.`}
          </span>
        </div>
      )}
      {shownValidation?.checked && shownValidation.problems.length > 0 && (
        <div className="mb-2 rounded-md border border-error/40 bg-error-container/40 px-2.5 py-1.5 text-[11px] text-on-error-container">
          <span className="font-semibold">Schema check failed on this version:</span>{' '}
          {shownValidation.problems.join('; ')}
        </div>
      )}
      {versions.length > 1 && !shownValidation?.checked && (
        <div className="mb-2 text-[11px] text-tertiary">
          No schema is available for this product, so neither version was
          re-checked. Compare them before saving.
        </div>
      )}
      <pre className="overflow-x-auto rounded-md bg-surface-container-highest px-3 py-2.5 text-xs text-on-surface">
        <code>{body}</code>
      </pre>
      {det.query_language === 'Sigma' && body.trim() && (
        <SigmaConvertSection query={body} />
      )}
    </>
  );
}

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
