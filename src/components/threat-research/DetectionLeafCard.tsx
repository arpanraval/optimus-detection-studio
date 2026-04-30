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
  pass:                'bg-emerald-100 text-emerald-800',
  pass_with_concerns:  'bg-amber-100 text-amber-800',
  fail:                'bg-red-100 text-red-800',
};

const FEASIBILITY_STYLE: Record<string, string> = {
  covered:    'bg-emerald-100 text-emerald-800',
  partial:    'bg-amber-100 text-amber-800',
  uncovered:  'bg-red-100 text-red-800',
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
    <aside className="fixed right-0 top-0 z-40 flex h-full w-[480px] flex-col border-l bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-500">{behaviour.title} → {opportunity.title}</div>
          <h3 className="text-base font-semibold text-gray-900 truncate">{det.name}</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-900 ml-2">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {det.archived && (
          <div className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
            This detection has been discarded for this session.
          </div>
        )}
        {det.saved_detection_id && (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
            <Icon name="check-circle" size={16} />
            Saved to library as a Draft.
          </div>
        )}

        <Section title="Description">
          <p className="text-sm text-gray-700">{det.description}</p>
        </Section>

        <Section title="Verdict">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {det.qa && (
              <>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${VERDICT_STYLE[det.qa.verdict]}`}>
                  QA: {det.qa.verdict.replace(/_/g, ' ')}
                </span>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                  Coverage: {det.qa.coverage_quality}
                </span>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                  Iterations: {det.qa.iteration_count}
                </span>
              </>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${FEASIBILITY_STYLE[det.feasibility]}`}>
              Feasibility: {det.feasibility}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              {det.suggested_severity}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              {det.suggested_detection_type}
            </span>
          </div>
          {det.feasibility_notes && (
            <div className="mt-2 text-xs text-gray-600">{det.feasibility_notes}</div>
          )}
          {det.qa && det.qa.concerns.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-700 mb-1">Concerns</div>
              <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
                {det.qa.concerns.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          {det.qa && det.qa.suggested_changes.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-700 mb-1">Suggested changes</div>
              <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
                {det.qa.suggested_changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </Section>

        <Section title={`Query (${det.query_language})`}>
          <pre className="overflow-x-auto rounded-md bg-gray-900 px-3 py-2.5 text-xs text-gray-100">
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
                className="inline-flex items-center rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                {id}
              </a>
            ))}
            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
              {det.kill_chain_phase}
            </span>
          </div>
        </Section>

        <Section title="Citations">
          <ul className="space-y-1.5">
            {det.citations.length === 0
              ? <li className="text-xs text-gray-500 italic">No citations.</li>
              : det.citations.map((c, i) => (
                <li key={i} className="text-xs">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium text-violet-700 hover:underline">{c.source}</a>
                  <span className="text-gray-700"> — {c.claim}</span>
                </li>
              ))}
          </ul>
        </Section>

        {det.covers_behaviour_ids.length > 1 && (
          <Section title="Cross-references">
            <div className="text-xs text-gray-700">
              This detection also covers: {det.covers_behaviour_ids.filter(id => id !== behaviour.id).join(', ')}
            </div>
          </Section>
        )}
      </div>

      <div className="flex items-center gap-2 border-t px-5 py-3">
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
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

export default DetectionLeafCard;
