import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { listSessions } from '../../lib/threatResearchService';
import { routeHelpers } from '../routes';
import type { ThreatResearchSession } from '../../types/threatResearch';
import { NewResearchModal } from '../../components/threat-research/NewResearchModal';

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-700',
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-700',
  cancelled: 'bg-amber-100 text-amber-700',
};

function countSavedDetections(session: ThreatResearchSession): number {
  let n = 0;
  for (const b of session.tree?.behaviours ?? []) {
    for (const o of b.opportunities ?? []) {
      if (o.detection?.saved_detection_id) n++;
    }
  }
  return n;
}

function countTotalDetections(session: ThreatResearchSession): number {
  let n = 0;
  for (const b of session.tree?.behaviours ?? []) {
    n += b.opportunities?.length ?? 0;
  }
  return n;
}

export function ThreatResearchPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ThreatResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    listSessions()
      .then(rows => { if (active) { setSessions(rows); setLoading(false); } })
      .catch(e => { if (active) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } });
    return () => { active = false; };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Threat Research</h1>
          <p className="text-sm text-gray-500 mt-0.5">Multi-agent detection research from any threat input.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} />
          New Research
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center text-sm text-gray-500 py-12">Loading sessions...</div>
        ) : error ? (
          <div className="text-center text-sm text-red-600 py-12">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <Icon name="compass" size={32} className="mx-auto text-gray-400 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">No research sessions yet</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Enter a threat actor, CVE, technique, or detection idea — four agents will collaborate to research it and produce committable detections.
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={14} />
              Start your first research
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Detections</th>
                  <th className="px-4 py-2.5 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sessions.map(s => {
                  const subject = s.tree?.subject?.subject ?? s.input_text;
                  const total = countTotalDetections(s);
                  const saved = countSavedDetections(s);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(routeHelpers.researchDetail(s.id))}
                      className="cursor-pointer hover:bg-violet-50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate">{subject}</div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{s.input_text}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {s.input_classification ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {total > 0 ? `${saved} / ${total} saved` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewResearchModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export default ThreatResearchPage;
