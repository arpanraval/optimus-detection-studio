/**
 * GlobalImportContext - App-level import state machine
 *
 * Manages the complete import lifecycle across page navigations:
 * - 8-state lifecycle: idle, pre_check, confirming, importing, paused, resumed, complete, rolling_back
 * - Network connectivity monitoring
 * - Auto-resume detection for interrupted jobs
 * - Navigation blocking via centralized NavigationBlockerContext
 * - beforeunload handler for tab close protection
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRegisterNavigationBlocker, useNavigationBlocker } from './NavigationBlockerContext';
import { bulkImportJobManager } from '../services/bulk-import/orchestrator/BulkImportJobManager';
import { batchInserter } from '../services/bulk-import/persistence/BatchInserter';
import type {
  ImportProgress,
  ImportJobConfig,
  PreCheckSummary,
  RollbackResult,
  ParsedRule,
  ValidatedRule,
} from '../services/bulk-import/types';

// ============================================
// TYPES
// ============================================

export type GlobalImportStatus =
  | 'idle'
  | 'pre_check'
  | 'confirming'
  | 'importing'
  | 'paused'
  | 'resumed'
  | 'complete'
  | 'rolling_back';

export type NetworkStatus = 'online' | 'offline' | 'reconnecting';

export interface InterruptedJobInfo {
  jobId: string;
  sourceName: string;
  insertedCount: number;
  totalCount: number;
  pausedAt?: string;
  checkpointData: any;
}

export interface GlobalImportContextValue {
  // State
  status: GlobalImportStatus;
  progress: ImportProgress | null;
  activeJob: any | null;
  preCheckResults: PreCheckSummary | null;
  networkStatus: NetworkStatus;
  interruptedJob: InterruptedJobInfo | null;
  isMinimized: boolean;
  importResult: any | null;

  // Actions
  startPreCheck: (parsedRules: ParsedRule[], userId: string) => Promise<PreCheckSummary>;
  confirmAndImport: (validatedRules: ValidatedRule[], jobConfig: ImportJobConfig) => Promise<void>;
  pauseImport: () => void;
  resumeImport: (jobId?: string) => Promise<void>;
  abortImport: () => void;
  rollbackImport: (jobId: string) => Promise<RollbackResult>;
  dismissInterruptedJob: (jobId: string) => Promise<void>;
  syncExternalJob: (status: GlobalImportStatus, progress: ImportProgress | null, job: any | null, result?: any | null) => void;
  takeOverJob: () => void;

  // UI
  minimize: () => void;
  expand: () => void;

  // Navigation
  navigationBlocker: {
    isBlocked: boolean;
    activeBlockerId: string | null;
    proceed: () => void;
    reset: () => void;
  };
}

// ============================================
// REDUCER
// ============================================

interface GlobalImportState {
  status: GlobalImportStatus;
  progress: ImportProgress | null;
  activeJob: any | null;
  preCheckResults: PreCheckSummary | null;
  networkStatus: NetworkStatus;
  interruptedJob: InterruptedJobInfo | null;
  isMinimized: boolean;
  importResult: any | null;
  retryCount: number;
}

type GlobalImportAction =
  | { type: 'SET_STATUS'; payload: GlobalImportStatus }
  | { type: 'SET_PROGRESS'; payload: ImportProgress | null }
  | { type: 'SET_JOB'; payload: any }
  | { type: 'SET_PRE_CHECK'; payload: PreCheckSummary | null }
  | { type: 'SET_NETWORK'; payload: NetworkStatus }
  | { type: 'SET_INTERRUPTED'; payload: InterruptedJobInfo | null }
  | { type: 'SET_MINIMIZED'; payload: boolean }
  | { type: 'SET_RESULT'; payload: any }
  | { type: 'SET_RETRY'; payload: number }
  | { type: 'RESET' };

const INITIAL_STATE: GlobalImportState = {
  status: 'idle',
  progress: null,
  activeJob: null,
  preCheckResults: null,
  networkStatus: 'online',
  interruptedJob: null,
  isMinimized: false,
  importResult: null,
  retryCount: 0,
};

function globalImportReducer(
  state: GlobalImportState,
  action: GlobalImportAction
): GlobalImportState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'SET_JOB':
      return { ...state, activeJob: action.payload };
    case 'SET_PRE_CHECK':
      return { ...state, preCheckResults: action.payload };
    case 'SET_NETWORK':
      return { ...state, networkStatus: action.payload };
    case 'SET_INTERRUPTED':
      return { ...state, interruptedJob: action.payload };
    case 'SET_MINIMIZED':
      return { ...state, isMinimized: action.payload };
    case 'SET_RESULT':
      return { ...state, importResult: action.payload };
    case 'SET_RETRY':
      return { ...state, retryCount: action.payload };
    case 'RESET':
      return { ...INITIAL_STATE, networkStatus: state.networkStatus, interruptedJob: state.interruptedJob };
    default:
      return state;
  }
}

// ============================================
// HELPERS
// ============================================

/** Statuses that indicate an import is actively running */
const ACTIVE_STATUSES: GlobalImportStatus[] = [
  'pre_check',
  'importing',
  'resumed',
  'rolling_back',
];

/** Statuses that require heartbeat monitoring */
const HEARTBEAT_STATUSES: GlobalImportStatus[] = [
  'importing',
  'paused',
  'resumed',
];

/** Retry delays in ms: immediate, 5s, 15s, 30s, then 60s repeating */
const RETRY_DELAYS = [0, 5000, 15000, 30000, 60000];

/** Hard stop: abort after 5 minutes offline */
const MAX_OFFLINE_MS = 5 * 60 * 1000;

function isActiveStatus(status: GlobalImportStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function getRetryDelay(retryCount: number): number {
  if (retryCount >= RETRY_DELAYS.length) {
    return RETRY_DELAYS[RETRY_DELAYS.length - 1];
  }
  return RETRY_DELAYS[retryCount];
}

// ============================================
// CONTEXT
// ============================================

const GlobalImportContext = createContext<GlobalImportContextValue | null>(null);

// ============================================
// PROVIDER
// ============================================

interface GlobalImportProviderProps {
  children: ReactNode;
  userId: string;
}

export function GlobalImportProvider({ children, userId }: GlobalImportProviderProps): React.JSX.Element {
  const [state, dispatch] = useReducer(globalImportReducer, INITIAL_STATE);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Track whether this provider is still mounted
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Refs for heartbeat and retry tracking
  const heartbeatIntervalRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const resumeImportRef = useRef<(jobId?: string) => Promise<void>>(async () => {});

  // ------------------------------------------
  // Navigation blocking
  // ------------------------------------------
  const shouldBlockNavigation = isActiveStatus(state.status) && !state.isMinimized;

  // Register with centralized blocker instead of calling useBlocker directly
  useRegisterNavigationBlocker('global-import', shouldBlockNavigation);
  const centralBlocker = useNavigationBlocker();

  // ------------------------------------------
  // beforeunload handler
  // ------------------------------------------
  useEffect(() => {
    if (!isActiveStatus(state.status)) return;

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = 'Import in progress. Are you sure you want to leave?';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.status]);

  // ------------------------------------------
  // Network connectivity monitoring
  // ------------------------------------------
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function handleOnline(): void {
      if (!mountedRef.current) return;

      if (state.networkStatus === 'offline') {
        dispatch({ type: 'SET_NETWORK', payload: 'reconnecting' });
        // Transition to online after a brief settling period
        reconnectTimer = setTimeout(() => {
          if (mountedRef.current) {
            dispatch({ type: 'SET_NETWORK', payload: 'online' });
          }
        }, 2000);
      }
    }

    function handleOffline(): void {
      if (!mountedRef.current) return;
      dispatch({ type: 'SET_NETWORK', payload: 'offline' });

      // Auto-pause active imports when offline
      if (state.status === 'importing' || state.status === 'resumed') {
        bulkImportJobManager.abort();
        dispatch({ type: 'SET_STATUS', payload: 'paused' });
      }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial state
    if (!navigator.onLine) {
      dispatch({ type: 'SET_NETWORK', payload: 'offline' });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [state.status, state.networkStatus]);

  // ------------------------------------------
  // Supabase heartbeat (verifies real connectivity)
  // ------------------------------------------
  useEffect(() => {
    const isHeartbeatActive = HEARTBEAT_STATUSES.includes(state.status);
    if (!isHeartbeatActive) {
      // Clean up if status no longer needs heartbeat
      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    function getInterval(): number {
      return document.hidden ? 120_000 : 30_000;
    }

    async function runHeartbeat(): Promise<void> {
      if (!mountedRef.current) return;

      const { error } = await supabase
        .from('bulk_import_jobs')
        .select('id')
        .limit(1);

      if (!mountedRef.current) return;

      if (error) {
        // Supabase unreachable - mark offline, auto-pause if importing
        dispatch({ type: 'SET_NETWORK', payload: 'offline' });
        if (state.status === 'importing' || state.status === 'resumed') {
          bulkImportJobManager.abort();
          dispatch({ type: 'SET_STATUS', payload: 'paused' });
        }
      } else if (state.networkStatus === 'reconnecting' || state.networkStatus === 'offline') {
        // Supabase reachable again
        dispatch({ type: 'SET_NETWORK', payload: 'online' });
      }
    }

    heartbeatIntervalRef.current = window.setInterval(runHeartbeat, getInterval()) as unknown as number;

    function handleVisibilityChange(): void {
      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current);
      }
      heartbeatIntervalRef.current = window.setInterval(runHeartbeat, getInterval()) as unknown as number;
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.status, state.networkStatus]);

  // ------------------------------------------
  // Exponential retry with backoff when paused
  // ------------------------------------------
  useEffect(() => {
    if (state.status !== 'paused') {
      // Reset tracking when not paused
      pausedAtRef.current = null;
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      return;
    }

    // Record when we first entered paused state
    if (pausedAtRef.current === null) {
      pausedAtRef.current = Date.now();
    }

    function scheduleRetry(): void {
      const delay = getRetryDelay(state.retryCount);

      retryTimeoutRef.current = window.setTimeout(async () => {
        if (!mountedRef.current) return;

        // Hard stop: abort after 5 minutes offline
        const elapsed = Date.now() - (pausedAtRef.current ?? Date.now());
        if (elapsed >= MAX_OFFLINE_MS) {
          bulkImportJobManager.abort();
          dispatch({ type: 'RESET' });
          return;
        }

        const { error } = await supabase
          .from('bulk_import_jobs')
          .select('id')
          .limit(1);

        if (!mountedRef.current) return;

        if (error) {
          dispatch({ type: 'SET_RETRY', payload: state.retryCount + 1 });
        } else {
          dispatch({ type: 'SET_NETWORK', payload: 'online' });
        }
      }, delay) as unknown as number;
    }

    scheduleRetry();

    return () => {
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [state.status, state.retryCount]);

  // ------------------------------------------
  // Auto-resume on reconnect
  // ------------------------------------------
  useEffect(() => {
    if (state.status === 'paused' && state.networkStatus === 'online') {
      dispatch({ type: 'SET_RETRY', payload: 0 });
      pausedAtRef.current = null;
      resumeImportRef.current();
    }
  }, [state.status, state.networkStatus]);

  // ------------------------------------------
  // Auto-resume detection on mount
  // ------------------------------------------
  useEffect(() => {
    async function checkInterruptedJobs(): Promise<void> {
      const { data, error } = await supabase
        .from('bulk_import_jobs')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['inserting', 'paused', 'failed'])
        .not('checkpoint_data', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return;
      if (!mountedRef.current) return;

      const job = data[0];
      dispatch({
        type: 'SET_INTERRUPTED',
        payload: {
          jobId: job.id,
          sourceName: job.source_url || job.source_vendor || 'Unknown source',
          insertedCount: job.success_count || 0,
          totalCount: (job.success_count || 0) + (job.failure_count || 0) + ((job.total_batches - job.last_successful_batch) * 50),
          pausedAt: job.updated_at,
          checkpointData: job.checkpoint_data,
        },
      });
    }

    checkInterruptedJobs();
  }, [userId]);

  // ------------------------------------------
  // Actions
  // ------------------------------------------

  // FIX: Store in-flight pre-check promise to prevent concurrent runs
  const preCheckPromiseRef = useRef<Promise<PreCheckSummary> | null>(null);

  const startPreCheck = useCallback(
    async (parsedRules: ParsedRule[], preCheckUserId: string): Promise<PreCheckSummary> => {
      // FIX: If a pre-check is already running, return the in-flight promise
      if (preCheckPromiseRef.current) {
        console.warn('[GlobalImport] Pre-check already running, returning in-flight promise');
        return preCheckPromiseRef.current;
      }

      const promise = (async (): Promise<PreCheckSummary> => {
        try {
          // FIX: Clear stale pre-check results before starting a new one
          dispatch({ type: 'SET_PRE_CHECK', payload: null });
          dispatch({ type: 'SET_STATUS', payload: 'pre_check' });

          const { DuplicateDetector } = await import(
            '../services/bulk-import/validators/DuplicateDetector'
          );
          const detector = new DuplicateDetector();
          const summary = await detector.runPreCheck(parsedRules, preCheckUserId);

          if (mountedRef.current) {
            dispatch({ type: 'SET_PRE_CHECK', payload: summary });
            dispatch({ type: 'SET_STATUS', payload: 'confirming' });
          }

          return summary;
        } finally {
          preCheckPromiseRef.current = null;
        }
      })();

      preCheckPromiseRef.current = promise;
      return promise;
    },
    []
  );

  const confirmAndImport = useCallback(
    async (validatedRules: ValidatedRule[], jobConfig: ImportJobConfig): Promise<void> => {
      // FIX: Guard against empty rules array
      const selectedRules = validatedRules.filter((r) => r.selected);
      if (selectedRules.length === 0) {
        console.warn('[GlobalImport] No selected rules to import');
        dispatch({ type: 'SET_STATUS', payload: 'idle' });
        return;
      }

      dispatch({ type: 'SET_STATUS', payload: 'importing' });

      // Create a job for tracking/persistence, but skip fetch/parse/validate —
      // rules are already validated by OnboardingContext's per-source managers
      const job = bulkImportJobManager.createJob(jobConfig);
      dispatch({ type: 'SET_JOB', payload: job });

      bulkImportJobManager.setCallbacks({
        onStatusChange: (jobStatus) => {
          if (!mountedRef.current) return;
          if (jobStatus === 'completed' || jobStatus === 'embedding') {
            // embedding is post-insert; treat as complete for UI
          } else if (jobStatus === 'failed') {
            dispatch({ type: 'SET_STATUS', payload: 'paused' });
          }
        },
        onProgress: (jobProgress) => {
          if (!mountedRef.current) return;
          dispatch({ type: 'SET_PROGRESS', payload: { ...jobProgress } });
        },
        onComplete: (result) => {
          if (!mountedRef.current) return;
          dispatch({ type: 'SET_RESULT', payload: result });
          dispatch({ type: 'SET_STATUS', payload: 'complete' });
        },
      });

      // Set initial progress so GlobalImportBar has numbers to show
      dispatch({
        type: 'SET_PROGRESS',
        payload: {
          phase: 'inserting',
          totalFiles: 0,
          processedFiles: 0,
          totalRules: selectedRules.length,
          validRules: selectedRules.length,
          warningRules: 0,
          errorRules: 0,
          duplicateRules: 0,
          insertedRules: 0,
          failedInserts: 0,
          skippedRules: 0,
        },
      });

      try {
        const result = await bulkImportJobManager.executeImport(selectedRules, userIdRef.current);

        if (mountedRef.current) {
          dispatch({ type: 'SET_RESULT', payload: result });
          dispatch({ type: 'SET_JOB', payload: bulkImportJobManager.getJob() });
          dispatch({ type: 'SET_STATUS', payload: 'complete' });
        }
      } catch (err) {
        if (mountedRef.current) {
          dispatch({ type: 'SET_STATUS', payload: 'paused' });
        }
      }
    },
    []
  );

  const pauseImport = useCallback((): void => {
    bulkImportJobManager.abort();
    dispatch({ type: 'SET_STATUS', payload: 'paused' });
  }, []);

  const resumeImport = useCallback(
    async (jobId?: string): Promise<void> => {
      dispatch({ type: 'SET_STATUS', payload: 'resumed' });
      dispatch({ type: 'SET_RETRY', payload: 0 });

      if (jobId) {
        // Resume from an interrupted job stored in the database
        const { data, error } = await supabase
          .from('bulk_import_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (error || !data) {
          dispatch({ type: 'SET_STATUS', payload: 'idle' });
          return;
        }

        // Update the job status in DB: back to inserting, clear pause metadata
        await supabase
          .from('bulk_import_jobs')
          .update({
            status: 'inserting',
            paused_at: null,
            pause_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        dispatch({ type: 'SET_JOB', payload: data });
        dispatch({ type: 'SET_INTERRUPTED', payload: null });
      }

      // Transition to importing — the actual batch resume
      // will be wired in Task 12 when BatchInserter resume is connected
      dispatch({ type: 'SET_STATUS', payload: 'importing' });
    },
    []
  );
  resumeImportRef.current = resumeImport;

  const abortImport = useCallback((): void => {
    bulkImportJobManager.abort();
    dispatch({ type: 'RESET' });
  }, []);

  const rollbackImport = useCallback(
    async (jobId: string): Promise<RollbackResult> => {
      dispatch({ type: 'SET_STATUS', payload: 'rolling_back' });

      const result = await batchInserter.rollbackImport(jobId, userIdRef.current);

      if (mountedRef.current) {
        dispatch({ type: 'SET_RESULT', payload: result });
        dispatch({ type: 'SET_STATUS', payload: result.success ? 'idle' : 'complete' });
      }

      return result;
    },
    []
  );
const dismissInterruptedJob = useCallback(
  async (jobId: string): Promise<void> => {
    await supabase
      .from('bulk_import_jobs')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (mountedRef.current) {
      dispatch({ type: 'SET_INTERRUPTED', payload: null });
    }
  },
  []
);

  const syncExternalJob = useCallback(
    (newStatus: GlobalImportStatus, newProgress: ImportProgress | null, newJob: any | null, newResult?: any | null) => {
      dispatch({ type: 'SET_STATUS', payload: newStatus });
      if (newProgress) dispatch({ type: 'SET_PROGRESS', payload: newProgress });
      if (newJob) dispatch({ type: 'SET_JOB', payload: newJob });
      if (newResult) dispatch({ type: 'SET_RESULT', payload: newResult });
    },
    []
  );

  const takeOverJob = useCallback(() => {
    const currentJob = bulkImportJobManager.getJob();
    if (!currentJob) return;

    bulkImportJobManager.setCallbacks({
      onStatusChange: (jobStatus) => {
        if (!mountedRef.current) return;
        if (jobStatus === 'completed' || jobStatus === 'embedding') {
          // handled below
        } else if (jobStatus === 'failed') {
          dispatch({ type: 'SET_STATUS', payload: 'paused' });
        }
      },
      onProgress: (jobProgress) => {
        if (!mountedRef.current) return;
        dispatch({ type: 'SET_PROGRESS', payload: { ...jobProgress } });
      },
      onComplete: (result) => {
        if (!mountedRef.current) return;
        dispatch({ type: 'SET_RESULT', payload: result });
        dispatch({ type: 'SET_STATUS', payload: 'complete' });
      },
    });

    dispatch({ type: 'SET_JOB', payload: currentJob });
    dispatch({ type: 'SET_PROGRESS', payload: currentJob.progress });

    // Map ImportJobStatus to GlobalImportStatus
    if (currentJob.status === 'inserting') dispatch({ type: 'SET_STATUS', payload: 'importing' });
    else if (currentJob.status === 'completed') dispatch({ type: 'SET_STATUS', payload: 'complete' });
    else if (currentJob.status === 'failed') dispatch({ type: 'SET_STATUS', payload: 'paused' });
  }, []);

  // ------------------------------------------
  // UI actions
  // ------------------------------------------

  const minimize = useCallback((): void => {
    dispatch({ type: 'SET_MINIMIZED', payload: true });
  }, []);

  const expand = useCallback((): void => {
    dispatch({ type: 'SET_MINIMIZED', payload: false });
  }, []);

  // ------------------------------------------
  // Context value
  // ------------------------------------------

  const value: GlobalImportContextValue = {
    status: state.status,
    progress: state.progress,
    activeJob: state.activeJob,
    preCheckResults: state.preCheckResults,
    networkStatus: state.networkStatus,
    interruptedJob: state.interruptedJob,
    isMinimized: state.isMinimized,
    importResult: state.importResult,

    startPreCheck,
    confirmAndImport,
    pauseImport,
    resumeImport,
    abortImport,
    rollbackImport,
    dismissInterruptedJob,
    syncExternalJob,
    takeOverJob,

    minimize,
    expand,

    navigationBlocker: {
      isBlocked: centralBlocker.isBlocked && (
        centralBlocker.activeBlockerId === 'global-import' ||
        centralBlocker.activeBlockerId === 'onboarding-processing'
      ),
      activeBlockerId: centralBlocker.activeBlockerId,
      proceed: centralBlocker.proceed,
      reset: centralBlocker.reset,
    },
  };

  return (
    <GlobalImportContext.Provider value={value}>
      {children}
    </GlobalImportContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useGlobalImport(): GlobalImportContextValue {
  const context = useContext(GlobalImportContext);
  if (!context) {
    throw new Error('useGlobalImport must be used within a GlobalImportProvider');
  }
  return context;
}
