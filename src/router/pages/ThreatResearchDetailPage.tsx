import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';
import { useThreatResearchSession } from '../../hooks/useThreatResearchSession';
import { useThreatResearchEvents } from '../../hooks/useThreatResearchEvents';
import { cancelThreatResearch, getSession } from '../../lib/threatResearchService';
import { ResearchHeader } from '../../components/threat-research/ResearchHeader';
import { ResearchCanvas } from '../../components/threat-research/ResearchCanvas';
import { ResearchList } from '../../components/threat-research/ResearchList';
import { ResearchActivityConsole } from '../../components/threat-research/ResearchActivityConsole';
import { DetectionLeafCard } from '../../components/threat-research/DetectionLeafCard';
import { PreflightGapBanner } from '../../components/threat-research/PreflightGapBanner';
import { ROUTES } from '../routes';
import type { AttackBehaviour, DetectionOpportunity, ThreatResearchSession } from '../../types/threatResearch';

export function ThreatResearchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { session: liveSession, loading, error } = useThreatResearchSession(id ?? null);
  const events = useThreatResearchEvents(id ?? null);
  const [view, setView] = useState<'canvas' | 'list'>('canvas');
  const [selected, setSelected] = useState<{ behaviour: AttackBehaviour; opportunity: DetectionOpportunity } | null>(null);
  const [overrideSession, setOverrideSession] = useState<ThreatResearchSession | null>(null);

  // After mutating (save / archive), pull a fresh copy so badges update.
  const refetch = useCallback(async () => {
    if (!id) return;
    try {
      const s = await getSession(id);
      if (s) setOverrideSession(s);
    } catch (e) {
      console.warn('refetch failed', e);
    }
  }, [id]);

  const session = overrideSession ?? liveSession;

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

  const preflightActive = !session.tree.subject && session.tree.preflight !== null;

  return (
    <div className="flex h-full flex-col">
      <ResearchHeader session={session} view={view} onViewChange={setView} />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {(session.status === 'pending' || session.status === 'running') && (
            <div className="flex items-center justify-between border-b border-outline-variant bg-secondary-container px-6 py-2 text-sm text-on-secondary-container">
              <div className="flex items-center gap-2">
                <Icon name="loader" size={14} className="animate-spin" />
                <span>Research in progress…</span>
              </div>
              <Button variant="text" color="surface" size="sm" onClick={handleCancel}>Cancel</Button>
            </div>
          )}
          {session.status === 'failed' && (
            <div className="border-b border-outline-variant bg-error-container px-6 py-2 text-sm text-on-error-container">
              Failed: {session.failure_reason ?? 'unknown'}
            </div>
          )}

          <div className="px-6 pt-4">
            <PreflightGapBanner
              preflight={session.tree.preflight}
              active={preflightActive}
              onCancel={handleCancel}
            />
          </div>

          {view === 'canvas' ? (
            <ResearchCanvas
              tree={session.tree}
              status={session.status}
              onLeafClick={(b, o) => setSelected({ behaviour: b, opportunity: o })}
              onLibraryMatchClick={(b) => {
                if (b.library_match) {
                  window.open(`/library/detections/${b.library_match.existing_detection_id}`, '_blank');
                }
              }}
            />
          ) : (
            <ResearchList
              tree={session.tree}
              onLeafClick={(b, o) => setSelected({ behaviour: b, opportunity: o })}
            />
          )}
        </div>

        <ResearchActivityConsole events={events} />
      </div>

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
  );
}

export default ThreatResearchDetailPage;
