import React, { useState, useMemo } from 'react';
import { Navigate, useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';
import { useThreatResearchSession } from '../../hooks/useThreatResearchSession';
import { useThreatResearchEvents } from '../../hooks/useThreatResearchEvents';
import { useThreatResearchJobs } from '../../hooks/useThreatResearchJobs';
import { cancelThreatResearch, resumeFailedSession, retryDetectionLeaf } from '../../lib/threatResearchService';
import { ResearchHeader } from '../../components/threat-research/ResearchHeader';
import { ResearchCanvas } from '../../components/threat-research/ResearchCanvas';
import { ResearchList } from '../../components/threat-research/ResearchList';
import { ResearchActivityConsole } from '../../components/threat-research/ResearchActivityConsole';
import { DetectionLeafCard } from '../../components/threat-research/DetectionLeafCard';
import { ROUTES } from '../routes';
import type { AttackBehaviour, DetectionOpportunity } from '../../types/threatResearch';
import { usePermissions } from '../../context/PermissionsContext';

/** Behaviour ids with an agent currently working on them, derived from the
 *  jobs table (authoritative). The previous events-derived implementation
 *  short-circuited on any historical session_failed event — which meant
 *  after resume_session flipped the session back to running, the UI showed
 *  zero active workers forever, even while real workers were emitting
 *  qa_refinement_started and agent_started events in real time.
 *
 *  A behaviour is "active" if any of its composite leaves (b1/o1, b1/o2,
 *  ...) has a detection or qa job in `running` status. We also fold in the
 *  attack_research phase, which is keyed off the bare behaviour id. */
function deriveActiveBehaviourIds(
  byLeaf: ReadonlyMap<string, { detection_status: string | null; qa_status: string | null }>,
  attackResearchActive: ReadonlySet<string>,
): Set<string> {
  const active = new Set<string>(attackResearchActive);
  for (const [composite, leaf] of byLeaf) {
    if (leaf.detection_status === 'running' || leaf.qa_status === 'running') {
      const slash = composite.indexOf('/');
      if (slash >= 0) active.add(composite.slice(0, slash));
    }
  }
  return active;
}

export function ThreatResearchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasRole, isLoading: permissionsLoading } = usePermissions();
  // refetch is owned by the hook now — calling it triggers an immediate
  // refetch and keeps the hook's session as the single source of truth.
  // The previous overrideSession lift-to-parent pattern permanently masked
  // realtime updates after any mutation; replaced.
  const { session, loading, error, refetch } = useThreatResearchSession(id ?? null);
  const events = useThreatResearchEvents(id ?? null);
  const jobs = useThreatResearchJobs(id ?? null);
  const activeBehaviourIds = useMemo(
    () => deriveActiveBehaviourIds(jobs.byLeaf, jobs.attackResearchActive),
    [jobs.byLeaf, jobs.attackResearchActive],
  );
  const [view, setView] = useState<'canvas' | 'list'>('canvas');
  const [activityOpen, setActivityOpen] = useState(false);
  const [selected, setSelected] = useState<{ behaviour: AttackBehaviour; opportunity: DetectionOpportunity } | null>(null);

  if (permissionsLoading) return null;
  if (!hasRole('owner')) return <Navigate to="/" replace />;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">
        <Icon name="loader" size={20} className="mr-2 animate-spin" />
        Loading session...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-on-error">
        <Icon name="alert-triangle" size={16} className="mr-2" />
        {error}
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="text-sm text-on-surface-variant">Session not found.</div>
        <Button onClick={() => navigate(ROUTES.RESEARCH)}>Back to Research</Button>
      </div>
    );
  }

  async function handleCancel() {
    if (!session) return;
    try {
      await cancelThreatResearch(session.id);
      showToast('info', 'Cancelling session…');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  async function handleResume() {
    if (!session) return;
    try {
      const { retried } = await resumeFailedSession(session.id);
      showToast('success', retried > 0 ? `Resumed ${retried} failed leaf${retried === 1 ? '' : 'es'}` : 'No failed leaves to resume');
      await refetch();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Resume failed');
    }
  }

  /** Per-leaf retry. `compositeId` is always "{behaviour}/{opportunity}" — the
   *  orchestrator rejects a bare behaviour id with a 400, because the detection
   *  job it enqueues is scoped to one opportunity. Behaviours with no
   *  opportunities use handleResume instead. */
  async function handleRetryLeaf(compositeId: string) {
    if (!session) return;
    try {
      await retryDetectionLeaf(session.id, compositeId);
      showToast('info', 'Retry queued');
      await refetch();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Retry failed');
    }
  }

  // Tree may be missing for a brief window between row-insert and the
  // orchestrator's first persistTree() write. Treat as empty-shape so the
  // page can render the "in progress" banner without crashing.
  const tree = session.tree ?? { subject: null, preflight: null, behaviours: [], open_questions: [] };

  return (
    <div className="flex h-full flex-col">
      <ResearchHeader session={session} view={view} onViewChange={setView} />

      {/* Planner-degraded banner. ext-amber wash matches the design
          system's Warning / Medium-severity treatment. */}
      {tree.planner_status === 'degraded' && (
        <div className="flex items-center gap-3 border-b border-ext-amber/30 bg-ext-amber/10 px-6 py-3">
          <Icon name="alert-triangle" size={16} className="flex-shrink-0 text-ext-amber" />
          <div className="min-w-0 flex-1 text-sm text-on-surface">
            <span className="font-semibold">Opportunity Planner did not run.</span>{' '}
            <span className="text-on-surface-variant">
              Detections were generated 1:1 per behaviour without canonical clustering, so this output may contain near-duplicate detections. Resume the session to re-run the planner.
            </span>
          </div>
          <Button variant="filled" color="primary" size="sm" onClick={handleResume}>
            Re-run planner
          </Button>
        </div>
      )}

      {/* List view: inline status banner row above the table — full width,
          no overlap. */}
      {view === 'list' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface px-6 py-3">
          {(session.status === 'pending' || session.status === 'running') && (
            <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-sm text-on-surface">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Research in progress
              <Button variant="text" color="surface" size="sm" onClick={handleCancel}>Cancel</Button>
            </div>
          )}
          {(session.status === 'failed' || session.status === 'cancelled') && (
            <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-sm">
              <Icon
                name={session.status === 'failed' ? 'alert-triangle' : 'x-circle'}
                size={14}
                className={`flex-shrink-0 ${session.status === 'failed' ? 'text-error' : 'text-on-surface-variant'}`}
              />
              <span className="text-on-surface">
                <span className="font-medium">{session.status === 'failed' ? 'Failed.' : 'Cancelled.'}</span>{' '}
                <span className="text-on-surface-variant">{session.failure_reason ?? 'no reason'}</span>
              </span>
              <Button variant="tonal" color="primary" size="sm" onClick={handleResume}>Resume</Button>
            </div>
          )}
        </div>
      )}

      {/* Canvas / list area. Activity console is overlaid (absolute) so it
          slides in over the canvas without resizing the layout. */}
      <div className="relative flex min-h-0 flex-1">
        {view === 'canvas' ? (
          <>
            <ResearchCanvas
              tree={tree}
              status={session.status}
              activeBehaviourIds={activeBehaviourIds}
              onLeafClick={(b, o) => setSelected({ behaviour: b, opportunity: o })}
              onLibraryMatchClick={(b) => {
                if (b.library_match) {
                  window.open(`/library/detections/${b.library_match.existing_detection_id}`, '_blank');
                }
              }}
            />

            {/* Floating chrome stack — ONLY on the canvas view. */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[560px] flex-col gap-2">
              {(session.status === 'pending' || session.status === 'running') && (
                <div className="pointer-events-auto inline-flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-4 py-2 shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <span className="text-sm text-on-surface">Research in progress</span>
                  <Button variant="text" color="surface" size="sm" onClick={handleCancel}>Cancel</Button>
                </div>
              )}
              {(session.status === 'failed' || session.status === 'cancelled') && (
                <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-4 py-2 shadow-sm">
                  <Icon
                    name={session.status === 'failed' ? 'alert-triangle' : 'x-circle'}
                    size={14}
                    className={`flex-shrink-0 ${session.status === 'failed' ? 'text-error' : 'text-on-surface-variant'}`}
                  />
                  <span className="text-sm text-on-surface">
                    <span className="font-medium">{session.status === 'failed' ? 'Failed.' : 'Cancelled.'}</span>{' '}
                    <span className="text-on-surface-variant">{session.failure_reason ?? 'no reason'}</span>
                  </span>
                  <Button variant="tonal" color="primary" size="sm" onClick={handleResume}>
                    {session.status === 'failed' ? 'Resume from failures' : 'Resume'}
                  </Button>
                </div>
              )}
            </div>

            <ResearchActivityConsole
              events={events}
              open={activityOpen}
              onToggle={() => setActivityOpen(o => !o)}
            />
          </>
        ) : (
          <ResearchList
            session={session}
            tree={tree}
            activeBehaviourIds={activeBehaviourIds}
            jobsByLeaf={jobs.byLeaf}
            sessionFailed={session.status === 'failed'}
            onLeafClick={(b, o) => setSelected({ behaviour: b, opportunity: o })}
            onRetryLeaf={handleRetryLeaf}
            onResumeSession={handleResume}
            onMutated={refetch}
          />
        )}

        {selected && (
          <DetectionLeafCard
            session={session}
            behaviour={selected.behaviour}
            opportunity={selected.opportunity}
            onClose={() => setSelected(null)}
            onMutated={refetch}
          />
        )}
      </div>
    </div>
  );
}

export default ThreatResearchDetailPage;
