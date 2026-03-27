// ============================================================================
// ENTERPRISE DASHBOARD — State Management (Context + Reducer)
// Follows existing ThemeContext.tsx pattern.
// ============================================================================

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import type { DashboardDefinition, WidgetConfig, UnifiedWidgetConfig, WidgetInstance, ResponsiveLayouts, WidgetLayoutItem, TimeRange, AutoRefreshInterval } from './widgets/types';
import { loadDashboards, saveDashboard, deleteDashboard as persistDelete, getLastActiveDashboardId, setLastActiveDashboardId } from './dashboardPersistence';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DashboardState {
  dashboards: DashboardDefinition[];
  activeDashboardId: string | null;
  isEditMode: boolean;
  isDirty: boolean;
  undoStack: DashboardDefinition[];
  redoStack: DashboardDefinition[];
  settingsWidgetId: string | null;
  catalogOpen: boolean;
  isLoading: boolean;
  /** Snapshot of the active dashboard taken when entering edit mode, for cancel */
  editSnapshot: DashboardDefinition | null;
  timeRange: TimeRange;
  autoRefreshInterval: AutoRefreshInterval;
  refreshTick: number;
  queryBuilderOpen: boolean;
  queryBuilderWidgetId: string | null; // null = creating new, string = editing existing
  scopeFilter: 'production' | 'all';
}

const initialState: DashboardState = {
  dashboards: [],
  activeDashboardId: null,
  isEditMode: false,
  isDirty: false,
  undoStack: [],
  redoStack: [],
  settingsWidgetId: null,
  catalogOpen: false,
  isLoading: true,
  editSnapshot: null,
  timeRange: { preset: 'all', startDate: null, endDate: null },
  autoRefreshInterval: 0,
  refreshTick: 0,
  queryBuilderOpen: false,
  queryBuilderWidgetId: null,
  scopeFilter: 'production',
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type DashboardAction =
  | { type: 'LOAD_DASHBOARDS'; dashboards: DashboardDefinition[]; initialDashboardId?: string }
  | { type: 'SET_ACTIVE'; id: string }
  | { type: 'TOGGLE_EDIT_MODE' }
  | { type: 'SET_EDIT_MODE'; value: boolean }
  | { type: 'UPDATE_LAYOUTS'; layouts: ResponsiveLayouts }
  | { type: 'ADD_WIDGET'; widget: WidgetInstance; layout: WidgetLayoutItem }
  | { type: 'REMOVE_WIDGET'; widgetId: string }
  | { type: 'UPDATE_WIDGET_CONFIG'; widgetId: string; config: Partial<WidgetConfig> | UnifiedWidgetConfig }
  | { type: 'CREATE_DASHBOARD'; dashboard: DashboardDefinition }
  | { type: 'DELETE_DASHBOARD'; id: string }
  | { type: 'RENAME_DASHBOARD'; id: string; name: string }
  | { type: 'SET_DEFAULT_DASHBOARD'; id: string }
  | { type: 'OPEN_SETTINGS'; widgetId: string }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'OPEN_CATALOG' }
  | { type: 'CLOSE_CATALOG' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'SAVE_AS_COPY'; newDashboard: DashboardDefinition }
  | { type: 'MARK_CLEAN' }
  | { type: 'SET_TIME_RANGE'; timeRange: TimeRange }
  | { type: 'SET_AUTO_REFRESH'; interval: AutoRefreshInterval }
  | { type: 'REFRESH_TICK' }
  | { type: 'OPEN_QUERY_BUILDER'; widgetId?: string }
  | { type: 'CLOSE_QUERY_BUILDER' }
  | { type: 'SET_SCOPE_FILTER'; scope: 'production' | 'all' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_UNDO = 30;

function getActive(state: DashboardState): DashboardDefinition | undefined {
  return state.dashboards.find(d => d.id === state.activeDashboardId);
}

function replaceActive(state: DashboardState, updater: (d: DashboardDefinition) => DashboardDefinition): DashboardState {
  const current = getActive(state);
  if (!current) return state;

  // Push current snapshot onto undo stack
  const undoStack = [...state.undoStack, current].slice(-MAX_UNDO);

  const updated = updater({ ...current, updatedAt: new Date().toISOString() });
  return {
    ...state,
    dashboards: state.dashboards.map(d => (d.id === updated.id ? updated : d)),
    undoStack,
    redoStack: [],
    isDirty: true,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'LOAD_DASHBOARDS': {
      // Priority: URL dashboardId > last active (localStorage) > isDefault > first
      const urlMatch = action.initialDashboardId ? action.dashboards.find(d => d.id === action.initialDashboardId) : null;
      const lastId = getLastActiveDashboardId();
      const lastMatch = lastId ? action.dashboards.find(d => d.id === lastId) : null;
      const defaultDash = urlMatch || lastMatch || action.dashboards.find(d => d.isDefault) || action.dashboards[0];
      return {
        ...state,
        dashboards: action.dashboards,
        activeDashboardId: defaultDash?.id ?? null,
        isLoading: false,
      };
    }

    case 'SET_ACTIVE':
      return { ...state, activeDashboardId: action.id, settingsWidgetId: null, catalogOpen: false };

    case 'TOGGLE_EDIT_MODE': {
      const entering = !state.isEditMode;
      return {
        ...state,
        isEditMode: entering,
        settingsWidgetId: null,
        catalogOpen: false,
        editSnapshot: entering ? getActive(state) ?? null : null,
        // Clear undo/redo when exiting edit mode
        ...(!entering ? { undoStack: [], redoStack: [] } : {}),
      };
    }

    case 'SET_EDIT_MODE': {
      return {
        ...state,
        isEditMode: action.value,
        settingsWidgetId: null,
        catalogOpen: false,
        editSnapshot: action.value ? getActive(state) ?? null : null,
        ...(!action.value ? { undoStack: [], redoStack: [] } : {}),
      };
    }

    case 'UPDATE_LAYOUTS':
      return replaceActive(state, d => ({ ...d, layouts: action.layouts }));

    case 'ADD_WIDGET': {
      return replaceActive(state, d => {
        const widgets = [...d.widgets, action.widget];
        const layouts: ResponsiveLayouts = {
          lg: [...d.layouts.lg, action.layout],
          md: [...d.layouts.md, { ...action.layout, w: Math.min(action.layout.w, 8) }],
          sm: [...d.layouts.sm, { ...action.layout, w: Math.min(action.layout.w, 4), x: 0 }],
          xs: [...d.layouts.xs, { ...action.layout, w: 2, x: 0 }],
        };
        return { ...d, widgets, layouts };
      });
    }

    case 'REMOVE_WIDGET':
      return replaceActive(state, d => ({
        ...d,
        widgets: d.widgets.filter(w => w.id !== action.widgetId),
        layouts: {
          lg: d.layouts.lg.filter(l => l.i !== action.widgetId),
          md: d.layouts.md.filter(l => l.i !== action.widgetId),
          sm: d.layouts.sm.filter(l => l.i !== action.widgetId),
          xs: d.layouts.xs.filter(l => l.i !== action.widgetId),
        },
      }));

    case 'UPDATE_WIDGET_CONFIG':
      return replaceActive(state, d => ({
        ...d,
        widgets: d.widgets.map(w => {
          if (w.id !== action.widgetId) return w;
          // Engine configs: full replacement; specialized: shallow merge
          if ('kind' in action.config && action.config.kind === 'engine') {
            return { ...w, config: action.config as UnifiedWidgetConfig };
          }
          return { ...w, config: { ...w.config, ...action.config } as UnifiedWidgetConfig };
        }),
      }));

    case 'CREATE_DASHBOARD':
      return {
        ...state,
        dashboards: [...state.dashboards, action.dashboard],
        activeDashboardId: action.dashboard.id,
        isDirty: true,
      };

    case 'DELETE_DASHBOARD': {
      const remaining = state.dashboards.filter(d => d.id !== action.id);
      return {
        ...state,
        dashboards: remaining,
        activeDashboardId: state.activeDashboardId === action.id
          ? (remaining[0]?.id ?? null)
          : state.activeDashboardId,
        isDirty: true,
      };
    }

    case 'RENAME_DASHBOARD':
      return {
        ...state,
        dashboards: state.dashboards.map(d =>
          d.id === action.id ? { ...d, name: action.name, updatedAt: new Date().toISOString() } : d,
        ),
        isDirty: true,
      };

    case 'SET_DEFAULT_DASHBOARD':
      return {
        ...state,
        dashboards: state.dashboards.map(d => ({
          ...d,
          isDefault: d.id === action.id,
          updatedAt: d.id === action.id ? new Date().toISOString() : d.updatedAt,
        })),
        isDirty: true,
      };

    case 'OPEN_SETTINGS':
      return { ...state, settingsWidgetId: action.widgetId, catalogOpen: false };

    case 'CLOSE_SETTINGS':
      return { ...state, settingsWidgetId: null };

    case 'OPEN_CATALOG':
      return { ...state, catalogOpen: true, settingsWidgetId: null };

    case 'CLOSE_CATALOG':
      return { ...state, catalogOpen: false };

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const current = getActive(state);
      if (!current) return state;
      const previous = state.undoStack[state.undoStack.length - 1];
      return {
        ...state,
        dashboards: state.dashboards.map(d => (d.id === previous.id ? previous : d)),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, current].slice(-MAX_UNDO),
        isDirty: true,
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const current = getActive(state);
      if (!current) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        ...state,
        dashboards: state.dashboards.map(d => (d.id === next.id ? next : d)),
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, current].slice(-MAX_UNDO),
        isDirty: true,
      };
    }

    case 'CANCEL_EDIT': {
      // Restore the snapshot taken when entering edit mode
      if (!state.editSnapshot) return { ...state, isEditMode: false, settingsWidgetId: null, catalogOpen: false, editSnapshot: null, undoStack: [], redoStack: [] };
      return {
        ...state,
        dashboards: state.dashboards.map(d => d.id === state.editSnapshot!.id ? state.editSnapshot! : d),
        isEditMode: false,
        isDirty: true, // trigger save of restored state
        settingsWidgetId: null,
        catalogOpen: false,
        editSnapshot: null,
        undoStack: [],
        redoStack: [],
      };
    }

    case 'SAVE_AS_COPY': {
      return {
        ...state,
        dashboards: [...state.dashboards, action.newDashboard],
        activeDashboardId: action.newDashboard.id,
        isEditMode: false,
        isDirty: true,
        settingsWidgetId: null,
        catalogOpen: false,
        editSnapshot: null,
        undoStack: [],
        redoStack: [],
      };
    }

    case 'MARK_CLEAN':
      return { ...state, isDirty: false };

    case 'SET_TIME_RANGE':
      return { ...state, timeRange: action.timeRange };

    case 'SET_AUTO_REFRESH':
      return { ...state, autoRefreshInterval: action.interval };

    case 'REFRESH_TICK':
      return { ...state, refreshTick: state.refreshTick + 1 };

    case 'OPEN_QUERY_BUILDER':
      return { ...state, queryBuilderOpen: true, queryBuilderWidgetId: action.widgetId ?? null, settingsWidgetId: null, catalogOpen: false };

    case 'CLOSE_QUERY_BUILDER':
      return { ...state, queryBuilderOpen: false, queryBuilderWidgetId: null };

    case 'SET_SCOPE_FILTER':
      return { ...state, scopeFilter: action.scope };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Time range resolver
// ---------------------------------------------------------------------------

function resolvePresetToRange(preset: string): { startDate: string | null; endDate: string | null } {
  if (preset === 'all' || preset === 'custom') return { startDate: null, endDate: null };
  const now = new Date();
  const endDate = now.toISOString();
  const msMap: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
  };
  const ms = msMap[preset];
  if (!ms) return { startDate: null, endDate: null };
  return { startDate: new Date(now.getTime() - ms).toISOString(), endDate };
}

interface DashboardContextValue {
  state: DashboardState;
  dispatch: React.Dispatch<DashboardAction>;
  activeDashboard: DashboardDefinition | undefined;
  resolvedTimeRange: { startDate: string | null; endDate: string | null };
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export const useDashboard = () => {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within a DashboardProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const DashboardProvider: React.FC<{
  userId: string | null;
  initialDashboardId?: string;
  children: React.ReactNode;
}> = ({ userId, initialDashboardId, children }) => {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDashboardsRef = useRef<DashboardDefinition[]>([]);

  // Load dashboards on mount
  useEffect(() => {
    loadDashboards(userId).then(dashboards => {
      dispatch({ type: 'LOAD_DASHBOARDS', dashboards, initialDashboardId });
      prevDashboardsRef.current = dashboards;
    });
  }, [userId]);

  // Sync URL → Context when initialDashboardId changes (e.g. sidebar/URL navigation)
  useEffect(() => {
    if (initialDashboardId && !state.isLoading && state.activeDashboardId !== initialDashboardId) {
      const exists = state.dashboards.some(d => d.id === initialDashboardId);
      if (exists) {
        dispatch({ type: 'SET_ACTIVE', id: initialDashboardId });
      }
    }
  }, [initialDashboardId, state.isLoading, state.dashboards]);

  // Persist last active dashboard ID to localStorage for URL-less navigation
  useEffect(() => {
    if (state.activeDashboardId) {
      setLastActiveDashboardId(state.activeDashboardId);
    }
  }, [state.activeDashboardId]);

  // Auto-save with 2s debounce — saves all changed dashboards, not just the active one
  useEffect(() => {
    if (!state.isDirty) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const prev = prevDashboardsRef.current;
      const toSave = state.dashboards.filter(d => {
        const old = prev.find(p => p.id === d.id);
        return !old || old.updatedAt !== d.updatedAt;
      });

      if (toSave.length > 0) {
        Promise.all(toSave.map(d => saveDashboard(d, userId))).then(() => {
          dispatch({ type: 'MARK_CLEAN' });
        });
      } else {
        dispatch({ type: 'MARK_CLEAN' });
      }
      prevDashboardsRef.current = [...state.dashboards];
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.isDirty, state.dashboards, userId]);

  // Auto-refresh interval
  useEffect(() => {
    if (state.autoRefreshInterval === 0) return;
    const id = setInterval(() => {
      dispatch({ type: 'REFRESH_TICK' });
    }, state.autoRefreshInterval * 1000);
    return () => clearInterval(id);
  }, [state.autoRefreshInterval, dispatch]);

  // Resolve time range from preset or custom values
  const resolvedTimeRange = useMemo(() => {
    const { preset, startDate, endDate } = state.timeRange;
    if (preset === 'custom') return { startDate, endDate };
    return resolvePresetToRange(preset);
    // Re-resolve on refreshTick so preset ranges pick up the latest "now"
  }, [state.timeRange, state.refreshTick]);

  const activeDashboard = useMemo(
    () => state.dashboards.find(d => d.id === state.activeDashboardId),
    [state.dashboards, state.activeDashboardId],
  );

  const value = useMemo(() => ({ state, dispatch, activeDashboard, resolvedTimeRange }), [state, dispatch, activeDashboard, resolvedTimeRange]);

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};
