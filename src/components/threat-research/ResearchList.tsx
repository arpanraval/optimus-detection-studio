import React from 'react';
import { Icon } from '../Icon';
import type { ThreatResearchTree, AttackBehaviour, DetectionOpportunity } from '../../types/threatResearch';

interface Props {
  tree: ThreatResearchTree;
  onLeafClick: (b: AttackBehaviour, o: DetectionOpportunity) => void;
}

const VERDICT_DOT: Record<string, string> = {
  pass:                'bg-emerald-500',
  pass_with_concerns:  'bg-amber-500',
  fail:                'bg-red-500',
};

const FEASIBILITY_LABEL: Record<string, string> = {
  covered:    'covered',
  partial:    'partial',
  uncovered:  'uncovered',
};

export function ResearchList({ tree, onLeafClick }: Props) {
  if (tree.behaviours.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
        Waiting for the Attack Researcher to produce behaviours...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
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
        <tbody className="divide-y divide-gray-200">
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
    <tr onClick={onClick} className={`cursor-pointer hover:bg-violet-50 ${det.archived ? 'opacity-50' : ''}`}>
      <td className="px-4 py-2.5"><span className="text-xs text-gray-600">{behaviour.kill_chain_phase}</span></td>
      <td className="px-4 py-2.5"><span className="font-medium text-gray-900">{behaviour.title}</span></td>
      <td className="px-4 py-2.5 text-gray-700">{opportunity.title}</td>
      <td className="px-4 py-2.5 text-gray-900 font-medium">{det.name}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {det.mitre_technique_ids.slice(0, 3).map(id => (
            <span key={id} className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">{id}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5"><span className="text-xs">{det.suggested_severity}</span></td>
      <td className="px-4 py-2.5"><span className="text-xs">{FEASIBILITY_LABEL[det.feasibility]}</span></td>
      <td className="px-4 py-2.5">
        {det.qa ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${VERDICT_DOT[det.qa.verdict] ?? 'bg-gray-400'}`} />
            {det.qa.verdict.replace(/_/g, ' ')}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {det.saved_detection_id ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Icon name="check" size={12} /> Saved
          </span>
        ) : det.archived ? (
          <span className="text-xs text-gray-500">Discarded</span>
        ) : (
          <span className="text-xs text-gray-700">Pending</span>
        )}
      </td>
    </tr>
  );
}

function EmptyBehaviourRow({ behaviour }: { behaviour: AttackBehaviour }) {
  return (
    <tr className="bg-gray-50/50">
      <td className="px-4 py-2 text-xs text-gray-500">{behaviour.kill_chain_phase}</td>
      <td className="px-4 py-2 font-medium text-gray-700">{behaviour.title}</td>
      <td colSpan={7} className="px-4 py-2 text-xs italic text-gray-500">
        Detection Engineer running...
      </td>
    </tr>
  );
}

export default ResearchList;
