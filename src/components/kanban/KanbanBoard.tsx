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
import { useTeam } from '../../context/TeamContext';

export type UserLookup = Record<string, { name: string; email: string }>;
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { BoardSearchBar } from './BoardSearchBar';
import { BoardFilterBar, EMPTY_FILTERS, hasActiveFilters, countActiveFilters } from './BoardFilterBar';
import type { BoardFilters } from './BoardFilterBar';
import { BoardAnalytics } from './BoardAnalytics';
import { useBoardKeyboardShortcuts } from './useBoardKeyboardShortcuts';
import { Icon } from '../Icon';
import { DecisionModal } from '../decisions/DecisionModal';
import { useDetectionDecisions } from '../../hooks/useDetectionDecisions';
import { useBoardPreferences } from './useBoardPreferences';
import { BoardSavedViews } from './BoardSavedViews';
import type { SavedView } from './BoardSavedViews';
import type { QuickReason } from '../../types/intelligence';
import type { Detection } from '../../types';

const DEFAULT_VISIBLE: Status[] = [
  Status.Backlog, Status.Draft, Status.Development,
  Status.Review, Status.Testing, Status.Production,
];

const SEVERITY_ORDER: Record<string, number> = {
  Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4,
};

function sortDetections(detections: Detection[], sortBy: string): Detection[] {
  const sorted = [...detections];
  switch (sortBy) {
    case 'severity':
      sorted.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5));
      break;
    case 'quality':
      sorted.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
      break;
    case 'updated':
      sorted.sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime());
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

export const KanbanBoard: React.FC = () => {
  const { userDetections, isLoading, bulkUpdateStatus, userId, refreshAll } = useLibrary();
  const { subscribe } = useRealtime();
  const { can, hasRoleOrHigher } = usePermissions();
  const { showToast } = useToast();
  const { allUsers } = useTeam();

  // Build user ID → name/email lookup once
  const userLookup = useMemo<UserLookup>(() => {
    const map: UserLookup = {};
    for (const u of allUsers) {
      map[u.id] = { name: u.full_name || u.email?.split('@')[0] || '?', email: u.email || '' };
    }
    return map;
  }, [allUsers]);

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
  const { prefs, setPrefs, toggleCollapsedColumn, setWipLimit } = useBoardPreferences();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [boardFilters, setBoardFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  useBoardKeyboardShortcuts({
    toggleMyWork: () => setMyWorkOnly(v => !v),
    toggleFilters: () => setShowFilters(v => !v),
    toggleArchived: () => setShowArchived(v => !v),
    clearSelection: () => setSelectedIds(new Set()),
    focusSearch: () => document.querySelector<HTMLInputElement>('[data-board-search]')?.focus(),
  });

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        d.mitreAttackIds?.some(id => id.toLowerCase().includes(q)) ||
        d.mitreTactics?.some(t => t.toLowerCase().includes(q))
      );
    }

    if (boardFilters.severities.length > 0) {
      filtered = filtered.filter(d => boardFilters.severities.includes(d.severity));
    }
    if (boardFilters.queryLanguages.length > 0) {
      filtered = filtered.filter(d => {
        const langs = d.queries?.map(q => q.language) || [d.queryLanguage].filter(Boolean);
        return langs.some(l => boardFilters.queryLanguages.includes(l));
      });
    }

    for (const detection of filtered) {
      const status = detection.status || Status.Backlog;
      if (map[status]) map[status].push(detection);
    }

    // Sort within each column
    for (const status of STATUSES) {
      map[status] = sortDetections(map[status], prefs.sortWithinColumn);
    }

    return map;
  }, [userDetections, myWorkOnly, userId, searchQuery, boardFilters, prefs.sortWithinColumn]);

  const activeDetection = useMemo(
    () => activeId ? userDetections.find(d => d.id === activeId) : null,
    [activeId, userDetections]
  );

  // Stats
  const totalFiltered = useMemo(
    () => columns.reduce((sum, status) => sum + (grouped[status]?.length || 0), 0),
    [columns, grouped]
  );
  const totalUnfiltered = useMemo(
    () => myWorkOnly && userId
      ? userDetections.filter(d => d.assigned_to === userId).length
      : userDetections.length,
    [userDetections, myWorkOnly, userId]
  );
  const productionCount = grouped[Status.Production]?.length || 0;
  const inProgressCount = (grouped[Status.Development]?.length || 0) + (grouped[Status.Review]?.length || 0) + (grouped[Status.Testing]?.length || 0);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const d of userDetections) {
      if (d.queries) d.queries.forEach(q => { if (q.language) langs.add(q.language); });
      else if (d.queryLanguage) langs.add(d.queryLanguage);
    }
    return Array.from(langs).sort();
  }, [userDetections]);

  const swimlanes = useMemo(() => {
    if (prefs.swimlaneGroupBy === 'none') return null;
    const laneMap = new Map<string, Detection[]>();
    const allFiltered = Object.values(grouped).flat();

    for (const d of allFiltered) {
      let key: string;
      switch (prefs.swimlaneGroupBy) {
        case 'assignee': key = d.assigned_to || '__unassigned__'; break;
        case 'severity': key = d.severity || 'Unknown'; break;
        case 'source': key = d.source || 'custom'; break;
        case 'mitreTactic': key = d.mitreTactics?.[0] || '__unmapped__'; break;
        default: key = '__all__';
      }
      if (!laneMap.has(key)) laneMap.set(key, []);
      laneMap.get(key)!.push(d);
    }

    return Array.from(laneMap.entries()).map(([key, detections]) => {
      const byStatus: Record<string, Detection[]> = {};
      for (const s of STATUSES) byStatus[s] = [];
      for (const d of detections) byStatus[d.status || Status.Backlog].push(d);
      for (const s of STATUSES) byStatus[s] = sortDetections(byStatus[s], prefs.sortWithinColumn);

      let label = key;
      if (key === '__unassigned__') label = 'Unassigned';
      else if (key === '__unmapped__') label = 'No MITRE Mapping';
      else if (prefs.swimlaneGroupBy === 'assignee' && userLookup[key]) label = userLookup[key].name;
      return { key, label, detections: byStatus };
    });
  }, [grouped, prefs.swimlaneGroupBy, prefs.sortWithinColumn, userLookup]);

  const handleLoadView = useCallback((view: SavedView) => {
    setBoardFilters(view.filters);
    setMyWorkOnly(view.myWorkOnly);
    setPrefs({ swimlaneGroupBy: view.swimlaneGroupBy, sortWithinColumn: view.sortWithinColumn });
    if (view.filters.severities.length > 0 || view.filters.queryLanguages.length > 0) {
      setShowFilters(true);
    }
  }, [setPrefs]);

  const toggleFlag = useCallback((id: string) => {
    setFlaggedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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

    const previousStatuses = [...new Set(
      detectionsToMove
        .map(id => userDetections.find(d => d.id === id)?.status)
        .filter(Boolean)
    )] as string[];

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
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-6 h-6 border-2 border-[#783264] border-t-transparent rounded-full" />
          <span className="text-sm text-on-surface-variant">Loading board...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-surface-container-low border-b border-outline-variant/20">
        {/* Left: Stats */}
        <div className="flex items-center gap-4">
          {/* Stat tiles - mini version of command center style */}
          <div className="flex items-center gap-1.5 bg-surface-container/50 rounded-xl px-3 py-1.5 border border-outline-variant/10">
            <span className="text-[11px] text-on-surface-variant">Total</span>
            <span className="text-[13px] font-bold text-on-surface tabular-nums">{totalFiltered}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#4D7C6F]/8 rounded-xl px-3 py-1.5 border border-[#4D7C6F]/10">
            <Icon name="check-circle" className="w-3.5 h-3.5 text-[#4D7C6F]" />
            <span className="text-[11px] text-[#4D7C6F]">Production</span>
            <span className="text-[13px] font-bold text-[#4D7C6F] tabular-nums">{productionCount}</span>
          </div>
          {inProgressCount > 0 && (
            <div className="flex items-center gap-1.5 bg-purple-500/8 rounded-xl px-3 py-1.5 border border-purple-500/10">
              <Icon name="code" className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] text-purple-400">In Progress</span>
              <span className="text-[13px] font-bold text-purple-400 tabular-nums">{inProgressCount}</span>
            </div>
          )}

          <BoardSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            resultCount={totalFiltered}
            totalCount={totalUnfiltered}
          />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mr-1 px-3 py-1.5 rounded-xl bg-[#783264]/10 border border-[#783264]/20">
              <span className="text-[11px] font-bold text-[#783264] tabular-nums">{selectedIds.size} selected</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[#783264]/60 hover:text-[#783264] transition-colors"
              >
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <BoardSavedViews
            currentFilters={boardFilters}
            myWorkOnly={myWorkOnly}
            swimlaneGroupBy={prefs.swimlaneGroupBy}
            sortWithinColumn={prefs.sortWithinColumn}
            onLoadView={handleLoadView}
          />

          <select
            value={prefs.sortWithinColumn}
            onChange={(e) => setPrefs({ sortWithinColumn: e.target.value as typeof prefs.sortWithinColumn })}
            className="bg-surface-container/50 rounded-xl text-[11px] font-bold text-on-surface-variant border border-outline-variant/15 px-2.5 py-1.5 outline-none focus:border-[#783264]/30 cursor-pointer"
          >
            <option value="updated">Sort: Updated</option>
            <option value="severity">Sort: Severity</option>
            <option value="quality">Sort: Quality</option>
            <option value="name">Sort: Name</option>
          </select>

          <button
            onClick={() => setShowFilters(v => !v)}
            title="Filters (F)"
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
              showFilters || hasActiveFilters(boardFilters)
                ? 'bg-[#783264]/10 text-[#783264] border-[#783264]/20'
                : 'bg-surface-container/50 text-on-surface-variant border-outline-variant/15 hover:border-outline-variant/30'
            }`}
          >
            <Icon name={hasActiveFilters(boardFilters) ? 'filter' : 'filter'} className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters(boardFilters) && (
              <span className="ml-0.5 px-1 py-0 rounded-md bg-[#783264] text-white text-[9px] font-bold leading-tight">
                {countActiveFilters(boardFilters)}
              </span>
            )}
          </button>

          <select
            value={prefs.swimlaneGroupBy}
            onChange={(e) => setPrefs({ swimlaneGroupBy: e.target.value as typeof prefs.swimlaneGroupBy })}
            className="bg-surface-container/50 rounded-xl text-[11px] font-bold text-on-surface-variant border border-outline-variant/15 px-2.5 py-1.5 outline-none focus:border-[#783264]/30 cursor-pointer"
          >
            <option value="none">Swimlanes: Off</option>
            <option value="assignee">By Assignee</option>
            <option value="severity">By Severity</option>
            <option value="source">By Source</option>
            <option value="mitreTactic">By MITRE Tactic</option>
          </select>

          <button
            onClick={() => setPrefs({ cardDensity: prefs.cardDensity === 'comfortable' ? 'compact' : 'comfortable' })}
            title={prefs.cardDensity === 'comfortable' ? 'Switch to compact' : 'Switch to comfortable'}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all border bg-surface-container/50 text-on-surface-variant border-outline-variant/15 hover:border-outline-variant/30"
          >
            <Icon name={prefs.cardDensity === 'comfortable' ? 'list' : 'grid'} className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setShowAnalytics(v => !v)}
            title="Board Analytics"
            className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
              showAnalytics
                ? 'bg-[#783264]/10 text-[#783264] border-[#783264]/20'
                : 'bg-surface-container/50 text-on-surface-variant border-outline-variant/15 hover:border-outline-variant/30'
            }`}
          >
            <Icon name="chart-bar" className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setMyWorkOnly(!myWorkOnly)}
            title="My Work (M)"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
              myWorkOnly
                ? 'bg-[#783264]/10 text-[#783264] border-[#783264]/20'
                : 'bg-surface-container/50 text-on-surface-variant border-outline-variant/15 hover:border-outline-variant/30'
            }`}
          >
            <Icon name="user" className="w-3.5 h-3.5" />
            {myWorkOnly ? 'My Work' : 'All Team'}
          </button>

          <button
            onClick={() => setShowArchived(!showArchived)}
            title="Active Only (A)"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
              showArchived
                ? 'bg-surface-container-high text-on-surface border-outline-variant/30'
                : 'bg-surface-container/50 text-on-surface-variant border-outline-variant/15 hover:border-outline-variant/30'
            }`}
          >
            <Icon name="archive" className="w-3.5 h-3.5" />
            {showArchived ? 'All Stages' : 'Active Only'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <BoardFilterBar filters={boardFilters} onChange={setBoardFilters} availableLanguages={availableLanguages} />
      )}

      {/* Board Canvas */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {swimlanes ? (
              <div className="flex flex-col gap-6 p-4 min-h-full">
                {swimlanes.map(lane => (
                  <div key={lane.key}>
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-2 sticky left-0">
                      <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{lane.label}</span>
                      <span className="text-[10px] text-on-surface-variant/40 tabular-nums">
                        {Object.values(lane.detections).flat().length}
                      </span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto">
                      {columns.map(status => (
                        <KanbanColumn
                          key={`${lane.key}-${status}`}
                          status={status}
                          detections={lane.detections[status] || []}
                          selectedIds={selectedIds}
                          onToggleSelect={toggleSelect}
                          totalDetections={totalFiltered}
                          userLookup={userLookup}
                          isCollapsed={prefs.collapsedColumns.includes(status)}
                          onToggleCollapse={() => toggleCollapsedColumn(status)}
                          wipLimit={prefs.wipLimits[status]}
                          onSetWipLimit={(limit) => setWipLimit(status, limit)}
                          cardDensity={prefs.cardDensity}
                          flaggedIds={flaggedIds}
                          onToggleFlag={toggleFlag}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-3 h-full p-4">
                {columns.map(status => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    detections={grouped[status] || []}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    totalDetections={totalFiltered}
                    userLookup={userLookup}
                    isCollapsed={prefs.collapsedColumns.includes(status)}
                    onToggleCollapse={() => toggleCollapsedColumn(status)}
                    wipLimit={prefs.wipLimits[status]}
                    onSetWipLimit={(limit) => setWipLimit(status, limit)}
                    cardDensity={prefs.cardDensity}
                    flaggedIds={flaggedIds}
                    onToggleFlag={toggleFlag}
                  />
                ))}
              </div>
            )}
            <DragOverlay dropAnimation={null}>
              {activeDetection ? (
                <div className="w-[320px] relative">
                  <KanbanCard detection={activeDetection} overlay userLookup={userLookup} cardDensity={prefs.cardDensity} isFlagged={flaggedIds.has(activeDetection.id)} />
                  {selectedIds.size > 1 && selectedIds.has(activeDetection.id) && (
                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#783264] text-white text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-surface">
                      {selectedIds.size}
                    </div>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
        {showAnalytics && (
          <BoardAnalytics grouped={grouped} columns={columns} onClose={() => setShowAnalytics(false)} />
        )}
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
