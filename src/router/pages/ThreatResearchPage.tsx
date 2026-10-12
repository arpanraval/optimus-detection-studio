import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { PagePending } from '@/components/ui/PagePending';
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { deleteSession, listSessions } from '../../lib/threatResearchService';
import { routeHelpers } from '../routes';
import type { ThreatResearchSession } from '../../types/threatResearch';
import { NewResearchModal } from '../../components/threat-research/NewResearchModal';
import { usePermissions } from '../../context/PermissionsContext';
import { useToast } from '../../hooks/useToast';

/** Status pill colours — opacity-based ring/text on transparent fills so the
 *  pills sit quietly on the surface in both themes and stay on-brand with the
 *  primary magenta token (used for "running"). */
const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-on-surface/5 text-on-surface-variant ring-1 ring-inset ring-on-surface/10',
  running:   'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25 animate-pulse',
  completed: 'bg-on-surface/[0.04] text-on-surface ring-1 ring-inset ring-on-surface/15',
  failed:    'bg-error/10 text-error ring-1 ring-inset ring-error/25',
  cancelled: 'bg-on-surface/5 text-on-surface-variant ring-1 ring-inset ring-on-surface/10',
};

const STATUS_FILTERS = [
  { key: 'all',       label: 'All',       icon: 'layers' },
  { key: 'running',   label: 'Running',   icon: 'loader' },
  { key: 'completed', label: 'Completed', icon: 'check' },
  { key: 'failed',    label: 'Failed',    icon: 'alert-triangle' },
  { key: 'cancelled', label: 'Cancelled', icon: 'x-circle' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['key'];

function countSavedDetections(session: ThreatResearchSession): number {
  let n = 0;
  for (const b of session.tree?.behaviours ?? []) {
    for (const o of b.opportunities ?? []) {
      if (o.detection?.saved_detection_id) n++;
    }
  }
  return n;
}

/** Detections with a passing QA verdict that AREN'T saved yet — ready to
 *  save, but not counted in countSavedDetections. Mutually exclusive with
 *  it by construction (excludes anything already saved), so the two counts
 *  can be shown side by side without double-counting the same detection —
 *  same reasoning as ResearchList's usableCount fix. A session with 10/12
 *  passing-but-unsaved detections previously read identically to one with
 *  zero usable output, since only the saved count was ever surfaced. */
function countUnsavedPassingDetections(session: ThreatResearchSession): number {
  let n = 0;
  for (const b of session.tree?.behaviours ?? []) {
    for (const o of b.opportunities ?? []) {
      const det = o.detection;
      if (det?.saved_detection_id) continue;
      if (det?.qa?.verdict === 'pass' || det?.qa?.verdict === 'pass_with_concerns') n++;
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
  const { showToast } = useToast();
  const { hasRole, isLoading: permissionsLoading } = usePermissions();
  const [sessions, setSessions] = useState<ThreatResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deleting, setDeleting] = useState<ThreatResearchSession | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteSession(deleting.id);
      setSessions(prev => prev.filter(s => s.id !== deleting.id));
      showToast('success', 'Session deleted');
      setDeleting(null);
    } catch (e) {
      showToast('error', toMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  // Counts power the filter-chip badges. Computed against the already-loaded
  // page; once server-side filter+pagination lands these become authoritative
  // totals, but the current "Load more" model only ever has the rendered
  // slice in memory.
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: sessions.length, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const s of sessions) {
      if (s.status in counts) counts[s.status as StatusFilter]++;
    }
    return counts;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      const subject = (s.tree?.subject?.subject ?? '').toLowerCase();
      const input = (s.input_text ?? '').toLowerCase();
      const classification = (s.input_classification ?? '').toLowerCase();
      return subject.includes(q) || input.includes(q) || classification.includes(q);
    });
  }, [sessions, search, statusFilter]);

  if (permissionsLoading) return <PagePending layout="list" />;
  if (!hasRole('owner')) return <Navigate to="/" replace />;

  const hasFilter = search.trim().length > 0 || statusFilter !== 'all';

  return (
    <div className="flex h-full flex-col">
      {/* Hero header — short, on-brand intro plus the primary action. The
          gradient is built from primary token opacity so it stays in palette
          in both light and dark themes. */}
      <div className="relative overflow-hidden border-b border-outline-variant bg-gradient-to-br from-primary/[0.07] via-transparent to-primary/[0.03] px-6 py-6">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
              <Icon name="spark" size={12} />
              AI agents · Research → Attack → Planner → Engineer → QA
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-on-surface">Investigate any threat, end&#8209;to&#8209;end</h2>
            <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
              Paste a CVE, threat actor, campaign, technique, or any detection idea — five AI agents will collaborate to map the threat, identify detection opportunities, and produce committable detection queries.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)} className="group">
            <Icon name="plus" size={14} />
            New Research
          </Button>
        </div>
      </div>

      {/* Search + filter row. Always rendered when there's at least one
          session so the controls don't appear/disappear when filters empty
          the list (which would hide the only way back). */}
      {!loading && sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant bg-surface-container-low/40 px-6 py-3">
          <div className="relative flex-1 min-w-[240px] max-w-xl">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by subject, prompt, or type…"
              className="w-full rounded-full border border-outline-variant bg-surface py-1.5 pl-9 pr-9 text-sm text-on-surface placeholder:text-on-surface-variant transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Search sessions"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.key;
              const count = statusCounts[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? 'bg-primary text-on-primary shadow-sm ring-1 ring-inset ring-primary'
                      : 'bg-surface text-on-surface-variant ring-1 ring-inset ring-outline-variant hover:bg-primary/5 hover:text-on-surface hover:ring-primary/30'
                  }`}
                >
                  {f.label}
                  <span className={`tabular-nums ${active ? 'opacity-90' : 'opacity-60'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-6">
        {loading && sessions.length > 0 && <LoadingStatus />}
        {loading && sessions.length === 0 ? <PagePending layout="list" /> : error ? (
          <div className="rounded-2xl bg-error/10 ring-1 ring-inset ring-error/30 p-6 text-on-surface">
            <div className="flex items-start gap-3">
              <Icon name="alert-triangle" size={20} className="mt-0.5 flex-shrink-0 text-error" />
              <div className="text-sm">
                <div className="font-medium text-on-surface">Couldn't load research sessions.</div>
                <div className="mt-1 text-on-surface-variant">{error}</div>
              </div>
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-outline-variant bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
              <Icon name="radar" size={28} />
            </div>
            <h3 className="text-base font-semibold text-on-surface">No research sessions yet</h3>
            <p className="mx-auto mt-1 mb-5 max-w-md text-sm text-on-surface-variant">
              Enter a threat actor, CVE, technique, or detection idea — five agents will collaborate to research it and produce committable detections.
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={14} />
              Start your first research
            </Button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-surface-container p-10 text-center">
            <Icon name="search" size={24} className="mx-auto mb-2 text-on-surface-variant" />
            <div className="text-sm font-medium text-on-surface">No sessions match these filters</div>
            <p className="mt-1 text-xs text-on-surface-variant">Try a different search or status.</p>
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20 transition-colors hover:bg-primary/15"
            >
              <Icon name="x" size={12} />
              Clear filters
            </button>
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
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-outline-variant">
                {filteredSessions.map(s => {
                  const subject = s.tree?.subject?.subject ?? s.input_text;
                  const total = countTotalDetections(s);
                  const saved = countSavedDetections(s);
                  const readyToSave = countUnsavedPassingDetections(s);
                  // Dedupe: when the subject and the input prompt are the
                  // same string (very common when users paste the title in
                  // verbatim), don't render the same value twice.
                  const showSecondary = (s.input_text ?? '').trim() !== (subject ?? '').trim();
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(routeHelpers.researchDetail(s.id))}
                      className="group cursor-pointer transition-colors hover:bg-primary/[0.04]"
                    >
                      <td className="px-4 py-3">
                        <div className="truncate font-medium text-on-surface group-hover:text-primary">{subject}</div>
                        {showSecondary && (
                          <div className="mt-0.5 truncate text-xs text-on-surface-variant">{s.input_text}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {s.input_classification ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status] ?? STATUS_STYLE.pending}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums">
                        {total > 0 ? (
                          <>
                            {saved} / {total} saved
                            {readyToSave > 0 && (
                              <span className="ml-1 text-on-surface" title={`${readyToSave} detection${readyToSave === 1 ? '' : 's'} passed QA but haven't been saved yet`}>
                                · {readyToSave} ready
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                      <td className="w-10 px-2 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleting(s); }}
                          aria-label={`Delete session "${subject}"`}
                          className="invisible inline-flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant opacity-0 transition-all hover:bg-error/10 hover:text-error group-hover:visible group-hover:opacity-100 focus:visible focus:opacity-100"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-outline-variant bg-surface-container-high px-4 py-2.5 text-xs text-on-surface-variant">
              <span className="tabular-nums">
                Showing <span className="font-medium text-on-surface">{filteredSessions.length}</span>
                {hasFilter && <> of <span className="font-medium text-on-surface">{sessions.length}</span> loaded</>}
                {!hasFilter && <> session{sessions.length === 1 ? '' : 's'}</>}
              </span>
              {hasMore && (
                <Button variant="text" color="surface" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <NewResearchModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => !deleteBusy && setDeleting(null)}
        onConfirm={handleConfirmDelete}
        title="Delete research session?"
        message={
          deleting
            ? `"${deleting.tree?.subject?.subject ?? deleting.input_text}" will be permanently removed, including all generated detections that haven't been saved to your library. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete session"
        variant="danger"
        icon="trash"
        loading={deleteBusy}
      />
    </div>
  );
}

export default ThreatResearchPage;
