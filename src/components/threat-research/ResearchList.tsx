import React from 'react';
import { Icon } from '../Icon';
import type { ThreatResearchTree, AttackBehaviour, DetectionOpportunity } from '../../types/threatResearch';

interface Props {
  tree: ThreatResearchTree;
  onLeafClick: (b: AttackBehaviour, o: DetectionOpportunity) => void;
}

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

export function ResearchList({ tree, onLeafClick }: Props) {
  if (tree.behaviours.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-on-surface-variant">
        Waiting for the Attack Researcher to produce behaviours...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-surface-container-high text-xs uppercase tracking-wide text-on-surface-variant">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Phase</th>
            <th className="px-4 py-2.5 text-left font-medium">Behaviour</th>
            <th className="px-4 py-2.5 text-left font-medium">Opportunity</th>
            <th className="px-4 py-2.5 text-left font-medium">Detection</th>
            <th className="px-4 py-2.5 text-left font-medium">MITRE</th>
            <th className="px-4 py-2.5 text-left font-medium">Severity</th>
            <th className="px-4 py-2.5 text-left font-medium">Feasibility</th>
            <th className="px-4 py-2.5 text-left font-medium">QA</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {tree.behaviours.flatMap(b =>
            b.opportunities.length === 0
              ? [<EmptyBehaviourRow key={b.id} behaviour={b} />]
              : b.opportunities.map(o => (
                <Row key={`${b.id}-${o.id}`} behaviour={b} opportunity={o} onClick={() => onLeafClick(b, o)} />
              )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ behaviour, opportunity, onClick }: { behaviour: AttackBehaviour; opportunity: DetectionOpportunity; onClick: () => void }) {
  const det = opportunity.detection;
  return (
    <tr onClick={onClick} className={`cursor-pointer hover:bg-surface-container-high ${det.archived ? 'opacity-50' : ''}`}>
      <td className="px-4 py-2.5"><span className="text-xs text-on-surface-variant">{behaviour.tactic}</span></td>
      <td className="px-4 py-2.5"><span className="font-medium text-on-surface">{behaviour.title}</span></td>
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
        {det.saved_detection_id ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-tertiary">
            <Icon name="check" size={12} /> Saved
          </span>
        ) : det.archived ? (
          <span className="text-xs text-on-surface-variant">Discarded</span>
        ) : (
          <span className="text-xs text-on-surface">Pending</span>
        )}
      </td>
    </tr>
  );
}

function EmptyBehaviourRow({ behaviour }: { behaviour: AttackBehaviour }) {
  return (
    <tr className="bg-surface-container-low">
      <td className="px-4 py-2 text-xs text-on-surface-variant">{behaviour.tactic}</td>
      <td className="px-4 py-2 font-medium text-on-surface-variant">{behaviour.title}</td>
      <td colSpan={7} className="px-4 py-2 text-xs italic text-on-surface-variant">
        Detection Engineer running...
      </td>
    </tr>
  );
}

export default ResearchList;
