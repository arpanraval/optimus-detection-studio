import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { listSessions } from '../../lib/threatResearchService';
import { routeHelpers } from '../routes';
import type { ThreatResearchSession } from '../../types/threatResearch';
import { NewResearchModal } from '../../components/threat-research/NewResearchModal';
import { usePermissions } from '../../context/PermissionsContext';

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-surface-variant text-on-surface-variant',
  running:   'bg-secondary-container text-on-secondary-container',
  completed: 'bg-tertiary-container text-on-tertiary-container',
  failed:    'bg-error-container text-on-error-container',
  cancelled: 'bg-surface-variant text-on-surface-variant',
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

/** Pull a human-readable string out of any thrown value. */
function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const obj = e as { message?: string; error?: string; details?: string };
    return obj.message ?? obj.error ?? obj.details ?? 'Unknown error';
  }
  return String(e);
}

/**
 * Treat "table doesn't exist" / "relation not found" as empty rather than as
 * a hard error — this is what users see on a brand-new deploy before the
 * migration has run, and the right response is "no sessions yet, here's how
 * to start one" rather than a red error blob.
 */
function looksLikeMissingSchema(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('does not exist')
    || m.includes('relation') && m.includes('not')
    || m.includes('404')
    || m.includes('schema cache');
}

const PAGE_SIZE = 50;

export function ThreatResearchPage() {
  const navigate = useNavigate();
  const { hasRole, isLoading: permissionsLoading } = usePermissions();
  const [sessions, setSessions] = useState<ThreatResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // hasMore is true when the last page returned exactly PAGE_SIZE rows —
  // a partial page means we've reached the end. Avoids one extra request.
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    listSessions({ limit: PAGE_SIZE })
      .then(rows => {
        if (!active) return;
        setSessions(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setLoading(false);
      })
      .catch(e => {
        if (!active) return;
        const msg = toMessage(e);
        if (looksLikeMissingSchema(msg)) {
          setSessions([]);
          setError(null);
        } else {
          setError(msg);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function handleLoadMore() {
    if (sessions.length === 0 || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const oldest = sessions[sessions.length - 1].created_at;
      const more = await listSessions({ limit: PAGE_SIZE, before: oldest });
      setSessions(prev => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  if (permissionsLoading) return null;
  if (!hasRole('owner')) return <Navigate to="/" replace />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end px-6 py-4">
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} />
          New Research
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-on-surface-variant">
            <Icon name="loader" size={20} className="mr-2 animate-spin" />
            Loading sessions...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-outline-variant bg-error-container p-6 text-on-error-container">
            <div className="flex items-start gap-3">
              <Icon name="alert-triangle" size={20} className="mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium">Couldn't load research sessions.</div>
                <div className="mt-1 opacity-90">{error}</div>
              </div>
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container p-12 text-center">
            <Icon name="compass" size={32} className="mx-auto mb-3 text-on-surface-variant" />
            <h3 className="text-base font-semibold text-on-surface">No research sessions yet</h3>
            <p className="mx-auto mt-1 mb-5 max-w-md text-sm text-on-surface-variant">
              Enter a threat actor, CVE, technique, or detection idea — four agents will collaborate to research it and produce committable detections.
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={14} />
              Start your first research
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-high text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Detections</th>
                  <th className="px-4 py-2.5 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {sessions.map(s => {
                  const subject = s.tree?.subject?.subject ?? s.input_text;
                  const total = countTotalDetections(s);
                  const saved = countSavedDetections(s);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(routeHelpers.researchDetail(s.id))}
                      className="cursor-pointer hover:bg-surface-container-high"
                    >
                      <td className="px-4 py-3">
                        <div className="truncate font-medium text-on-surface">{subject}</div>
                        <div className="mt-0.5 truncate text-xs text-on-surface-variant">{s.input_text}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {s.input_classification ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status] ?? 'bg-surface-variant text-on-surface-variant'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {total > 0 ? `${saved} / ${total} saved` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasMore && (
              <div className="flex items-center justify-center border-t border-outline-variant bg-surface-container-high px-4 py-3">
                <Button variant="text" color="surface" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more sessions'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <NewResearchModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export default ThreatResearchPage;
