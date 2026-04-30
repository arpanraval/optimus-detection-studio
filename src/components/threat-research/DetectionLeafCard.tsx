import React, { useState } from 'react';
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

  async function handleSave() {
    setBusy(true);
    try {
      const { detection_id } = await saveDetectionFromLeaf(session, behaviour.id, opportunity.id, det);
      showToast('success', `Saved as Draft (id: ${detection_id.slice(0, 8)})`);
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

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-[480px] flex-col border-l border-outline-variant bg-surface-container shadow-2xl">
      <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-on-surface-variant">{behaviour.title} → {opportunity.title}</div>
          <h3 className="truncate text-base font-semibold text-on-surface">{det.name}</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="ml-2 text-on-surface-variant hover:text-on-surface">
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
                <span className="inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 font-medium text-on-surface-variant">
                  Iterations: {det.qa.iteration_count}
                </span>
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
        </Section>

        <Section title={`Query (${det.query_language})`}>
          <pre className="overflow-x-auto rounded-md bg-surface-container-highest px-3 py-2.5 text-xs text-on-surface">
            <code>{det.query}</code>
          </pre>
        </Section>

        <Section title="MITRE">
          <div className="flex flex-wrap gap-1.5">
            {det.mitre_technique_ids.map(id => (
              <a
                key={id}
                href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-primary-container px-2 py-1 text-xs font-medium text-on-primary-container hover:opacity-80"
              >
                {id}
              </a>
            ))}
            <span className="inline-flex items-center rounded-md bg-surface-variant px-2 py-1 text-xs text-on-surface-variant">
              {det.kill_chain_phase}
            </span>
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

      <div className="flex items-center gap-2 border-t border-outline-variant px-5 py-3">
        {det.saved_detection_id ? (
          <Button
            variant="outlined"
            onClick={() => window.open(routeHelpers.detectionDetail(det.saved_detection_id!), '_blank')}
          >
            View in Library
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={busy || det.archived}>
            {busy ? 'Saving...' : 'Save to Library'}
          </Button>
        )}
        {det.archived ? (
          <Button variant="outlined" onClick={handleUnarchive} disabled={busy}>Restore</Button>
        ) : (
          <Button variant="outlined" onClick={handleArchive} disabled={busy}>Discard</Button>
        )}
      </div>
    </aside>
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

export default DetectionLeafCard;
