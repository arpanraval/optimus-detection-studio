import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { Status } from '../../types';
import { STATUSES } from '../../constants';
import { useLibrary } from '../../context/LibraryContext';
import { useRealtime } from '../../context/RealtimeContext';
import { usePermissions } from '../../context/PermissionsContext';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { Icon } from '../Icon';
import { DecisionModal } from '../decisions/DecisionModal';
import { useDetectionDecisions } from '../../hooks/useDetectionDecisions';
import type { QuickReason } from '../../types/intelligence';

const DEFAULT_VISIBLE: Status[] = [
  Status.Backlog, Status.Draft, Status.Development,
  Status.Review, Status.Testing, Status.Production,
];

export const KanbanBoard: React.FC = () => {
  const { userDetections, isLoading, bulkUpdateStatus, userId, refreshAll } = useLibrary();
  const { subscribe } = useRealtime();
  const { can, hasRoleOrHigher } = usePermissions();
  const { showToast } = useToast();

  useEffect(() => {
    const unsub = subscribe('detections', '*', (payload) => {
      if (payload.eventType === 'UPDATE') {
        const updated = payload.new as any;
        if (updated.status !== (payload.old as any)?.status || updated.assigned_to !== (payload.old as any)?.assigned_to) {
          refreshAll();
        }
      }
    });
    return unsub;
  }, [subscribe, refreshAll]);

  const [showArchived, setShowArchived] = useState(false);
  const [myWorkOnly, setMyWorkOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    detectionIds: string[];
    targetStatus: Status;
    previousStatuses: string[];
  } | null>(null);

  const { createDecision } = useDetectionDecisions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const columns = useMemo(() => showArchived ? STATUSES : DEFAULT_VISIBLE, [showArchived]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof userDetections> = {};
    for (const status of STATUSES) map[status] = [];

    let filtered = userDetections;
    if (myWorkOnly && userId) {
      filtered = userDetections.filter(d => d.assigned_to === userId);
    }

    for (const detection of filtered) {
      const status = detection.status || Status.Backlog;
      if (map[status]) map[status].push(detection);
    }
    return map;
  }, [userDetections, myWorkOnly, userId]);

  const activeDetection = useMemo(
    () => activeId ? userDetections.find(d => d.id === activeId) : null,
    [activeId, userDetections]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const targetStatus = over.data.current?.status as Status | undefined;
    if (!targetStatus) return;

    const draggedId = active.id as string;
    const idsToMove = selectedIds.has(draggedId) ? Array.from(selectedIds) : [draggedId];

    const detectionsToMove = idsToMove.filter(id => {
      const d = userDetections.find(det => det.id === id);
      return d && d.status !== targetStatus;
    });
    if (detectionsToMove.length === 0) return;

    if (!can('detection:update:any') && !can('detection:update:own')) {
      showToast('error', 'Permission Denied', 'You do not have permission to change detection status');
      return;
    }

    if (targetStatus === Status.Production && !hasRoleOrHigher('lead')) {
      showToast('error', 'Permission Denied', 'Only Leads and above can move detections to Production');
      return;
    }

    // Derive previous statuses for all detections being moved
    const previousStatuses = [...new Set(
      detectionsToMove
        .map(id => userDetections.find(d => d.id === id)?.status)
        .filter(Boolean)
    )] as string[];

    // Set pending instead of executing immediately
    setPendingStatusChange({ detectionIds: detectionsToMove, targetStatus, previousStatuses });
  }, [selectedIds, userDetections, can, hasRoleOrHigher, showToast]);

  const isBlockingTransition = useCallback((targetStatus: Status) => {
    return targetStatus === Status.Production || targetStatus === Status.Deprecated;
  }, []);

  const executePendingStatusChange = useCallback(async (
    reasoning: string | null,
    quickReason: string | null
  ) => {
    if (!pendingStatusChange) return;
    const { detectionIds, targetStatus } = pendingStatusChange;

    const result = await bulkUpdateStatus(detectionIds, targetStatus);
    if (result.success) {
      // Log decisions per detection with individual previous status
      for (const id of detectionIds) {
        const prevStatus = userDetections.find(d => d.id === id)?.status || 'unknown';
        try {
          await createDecision({
            detection_id: id,
            decision_type: 'status_change',
            decision_context: `Moving from ${prevStatus} to ${targetStatus}`,
            reasoning,
            quick_reason: quickReason as QuickReason | null,
            previous_value: prevStatus,
            new_value: targetStatus,
            related_entity_ids: detectionIds.filter(x => x !== id),
          });
        } catch (err) {
          console.warn('Failed to log decision for', id, err);
        }
      }

      setSelectedIds(new Set());

      // Notify assignees (keep existing notification logic)
      const movedDetections = detectionIds.map(id => userDetections.find(d => d.id === id)).filter(Boolean);
      for (const detection of movedDetections) {
        if (detection && detection.assigned_to && detection.assigned_to !== userId) {
          supabase.from('user_notifications').insert({
            user_id: detection.assigned_to,
            type: 'status_change',
            title: `${detection.name} moved to ${targetStatus}`,
            message: `Detection status changed to ${targetStatus}`,
            detection_id: detection.id,
            action_url: `/library/detections/${detection.id}`,
            category: 'status_change',
            source_user_id: userId,
          }).then(({ error }) => { if (error) console.warn('Failed to notify:', error); });
        }
      }

      if (targetStatus === Status.Review) {
        showToast('info', 'Detection moved to Review', 'Consider assigning a reviewer');
      }
    }

    setPendingStatusChange(null);
  }, [pendingStatusChange, bulkUpdateStatus, createDecision, userDetections, selectedIds, showToast, userId]);

  const skipPendingStatusChange = useCallback(async () => {
    if (!pendingStatusChange) return;
    const { detectionIds, targetStatus } = pendingStatusChange;
    await bulkUpdateStatus(detectionIds, targetStatus);
    setSelectedIds(new Set());
    setPendingStatusChange(null);
  }, [pendingStatusChange, bulkUpdateStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-page-enter">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-on-surface">Pipeline</h1>
          <span className="text-sm text-on-surface-variant">{userDetections.length} detections</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMyWorkOnly(!myWorkOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              myWorkOnly ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {myWorkOnly ? 'My Work' : 'All Team'}
          </button>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showArchived ? 'bg-surface-container-high text-on-surface' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {showArchived ? 'Hide Archived' : 'Show All'}
          </button>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10">
              <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-primary/60 hover:text-primary">
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto px-4 py-4">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full">
            {columns.map(status => (
              <KanbanColumn
                key={status}
                status={status}
                detections={grouped[status] || []}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDetection ? (
              <div className="w-[264px] relative">
                <KanbanCard detection={activeDetection} overlay />
                {selectedIds.size > 1 && selectedIds.has(activeDetection.id) && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shadow-lg">
                    {selectedIds.size}
                  </div>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {pendingStatusChange && (
        <DecisionModal
          isOpen={true}
          onClose={() => {
            if (!isBlockingTransition(pendingStatusChange.targetStatus)) {
              skipPendingStatusChange();
            }
          }}
          onConfirm={executePendingStatusChange}
          onSkip={isBlockingTransition(pendingStatusChange.targetStatus) ? undefined : skipPendingStatusChange}
          decisionType="status_change"
          title={`Moving to ${pendingStatusChange.targetStatus}`}
          description={
            pendingStatusChange.detectionIds.length === 1
              ? `Moving detection to ${pendingStatusChange.targetStatus}`
              : `Moving ${pendingStatusChange.detectionIds.length} detections (from ${pendingStatusChange.previousStatuses.join(', ')}) to ${pendingStatusChange.targetStatus}`
          }
          isBlocking={isBlockingTransition(pendingStatusChange.targetStatus)}
        />
      )}
    </div>
  );
};
