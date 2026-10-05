/**
 * OnboardingContext - Central state management for the onboarding pipeline
 *
 * Orchestrates multiple BulkImportJobManager instances (one per selected source),
 * maps their callbacks to UI state via useReducer, and provides actions for
 * the onboarding UI components.
 *
 * Manager instances are stored in a useRef<Map> since they are mutable objects
 * that should not trigger re-renders on their own.
 */

import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';

import { GitHubFetcher } from '../../services/bulk-import/fetchers/GitHubFetcher';
import { BulkImportJobManager } from '../../services/bulk-import/orchestrator/BulkImportJobManager';
import type { ImportJobStatus, ImportProgress, ValidatedRule, ImportJobConfig } from '../../services/bulk-import/types';
import { LIBRARY_DEVELOPMENT } from '../../constants/library';
import { PipelineController } from './pipeline/PipelineController';
import { useRegisterNavigationBlocker } from '../../context/NavigationBlockerContext';
import { useGlobalImport } from '../../context/GlobalImportContext';

import type {
  OnboardingPhase,
  OnboardingContextValue,
  SourceState,
  SourceStatus,
  StageState,
  StreamState,
  LiveStats,
  ConsoleEntry,
  ConsoleLevel,
  FolderInfo,
  PipelineStage,
  OfficialSource,
} from './types';

export const ONBOARDING_TARGET_LIBRARY = LIBRARY_DEVELOPMENT;
import { OFFICIAL_SOURCES } from './types';

/**
 * Visual pacing for the pipeline canvas. Each stage node stays lit for at least this long
 * before it may turn green, so small imports still read as data moving through the pipeline.
 * The real import is never delayed; only the picture lags, by at most one dwell per hop.
 */
const STAGE_DWELL_MS = 700;
/** Hard cap on how long the UI waits for the visual queue before moving on regardless. */
const VISUAL_SETTLE_CAP_MS = 4000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Wait for the pipeline animation queue to drain, but never longer than the cap. */
function settleVisual(pipeline: PipelineController): Promise<void> {
  return Promise.race([
    pipeline.whenIdle(),
    new Promise<void>((resolve) => setTimeout(resolve, VISUAL_SETTLE_CAP_MS)),
  ]);
}

// ============================================
// REDUCER STATE
// ============================================

interface OnboardingReducerState {
  phase: OnboardingPhase;
  sources: SourceState[];
  stages: StageState[];
  streams: StreamState[];
  liveStats: LiveStats;
  incompleteJobId?: string;
}

// ============================================
// REDUCER ACTIONS
// ============================================

type OnboardingAction =
  | { type: 'TOGGLE_SOURCE'; sourceId: string }
  | { type: 'SET_SOURCE_STATUS'; sourceId: string; status: SourceStatus }
  | {
      type: 'SET_RECON_REPORT';
      sourceId: string;
      reconReport: SourceState['reconReport'];
      folders: FolderInfo[];
    }
  | { type: 'TOGGLE_FOLDER'; sourceId: string; folderPath: string }
  | { type: 'SELECT_ALL_FOLDERS'; sourceId: string }
  | { type: 'DESELECT_ALL_FOLDERS'; sourceId: string }
  | { type: 'SET_PHASE'; phase: OnboardingPhase }
  | { type: 'UPDATE_PROGRESS'; sourceId: string; progress: ImportProgress }
  | {
      type: 'UPDATE_STAGE';
      stage: PipelineStage;
      status: StageState['status'];
      counter?: number;
      secondaryCounter?: number;
    }
  | { type: 'UPDATE_STREAM'; stream: StreamState }
  | { type: 'UPDATE_LIVE_STATS'; liveStats: LiveStats }
  | { type: 'SET_ERROR'; sourceId: string; errorMessage: string }
  | { type: 'RESET_SOURCE'; sourceId: string }
  | { type: 'RESET_AFTER_ABORT' };

// ============================================
// HELPERS
// ============================================

function updateSourceInList(
  sources: SourceState[],
  sourceId: string,
  updater: (source: SourceState) => SourceState,
): SourceState[] {
  return sources.map((s) => (s.source.id === sourceId ? updater(s) : s));
}

// ============================================
// REDUCER
// ============================================

function onboardingReducer(state: OnboardingReducerState, action: OnboardingAction): OnboardingReducerState {
  switch (action.type) {
    case 'TOGGLE_SOURCE':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          selected: !s.selected,
        })),
      };

    case 'SET_SOURCE_STATUS':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          status: action.status,
          // Clear error message when moving to a non-error status
          errorMessage: action.status === 'error' ? s.errorMessage : undefined,
        })),
      };

    case 'SET_RECON_REPORT':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          reconReport: action.reconReport,
          folders: action.folders,
          status: 'ready' as SourceStatus,
        })),
      };

    case 'TOGGLE_FOLDER':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          folders: s.folders.map((f) => (f.path === action.folderPath ? { ...f, selected: !f.selected } : f)),
        })),
      };

    case 'SELECT_ALL_FOLDERS':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          folders: s.folders.map((f) => ({ ...f, selected: true })),
        })),
      };

    case 'DESELECT_ALL_FOLDERS':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          folders: s.folders.map((f) => ({ ...f, selected: false })),
        })),
      };

    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    case 'UPDATE_PROGRESS':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          progress: { ...action.progress },
          importedCount: action.progress.insertedRules,
          duplicateCount: action.progress.duplicateRules,
        })),
      };

    case 'UPDATE_STAGE':
      return {
        ...state,
        stages: state.stages.map((s) =>
          s.stage === action.stage
            ? {
                ...s,
                status: action.status,
                counter: action.counter ?? s.counter,
                secondaryCounter: action.secondaryCounter ?? s.secondaryCounter,
              }
            : s,
        ),
      };

    case 'UPDATE_STREAM': {
      const existing = state.streams.findIndex(
        (s) => s.sourceId === action.stream.sourceId && s.from === action.stream.from && s.to === action.stream.to,
      );
      if (existing >= 0) {
        const newStreams = [...state.streams];
        newStreams[existing] = action.stream;
        return { ...state, streams: newStreams };
      }
      return { ...state, streams: [...state.streams, action.stream] };
    }

    case 'UPDATE_LIVE_STATS':
      return { ...state, liveStats: action.liveStats };

    case 'SET_ERROR':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          status: 'error' as SourceStatus,
          errorMessage: action.errorMessage,
        })),
      };

    case 'RESET_SOURCE':
      return {
        ...state,
        sources: updateSourceInList(state.sources, action.sourceId, (s) => ({
          ...s,
          status: 'idle' as SourceStatus,
          folders: [],
          reconReport: undefined,
          progress: undefined,
          errors: [],
          importedCount: 0,
          duplicateCount: 0,
          errorMessage: undefined,
        })),
      };

    case 'RESET_AFTER_ABORT':
      return {
        ...state,
        phase: 'selection',
        sources: state.sources.map((sourceState) => ({
          ...sourceState,
          status:
            sourceState.selected && sourceState.folders.length > 0
              ? ('ready' as SourceStatus)
              : ('idle' as SourceStatus),
          progress: undefined,
          errorMessage: undefined,
        })),
      };

    default:
      return state;
  }
}

// ============================================
// INITIAL STATE
// ============================================

function createInitialState(): OnboardingReducerState {
  return {
    phase: 'selection',
    sources: OFFICIAL_SOURCES.map((source) => ({
      source: source as OfficialSource,
      selected: false,
      status: 'idle' as SourceStatus,
      folders: [],
      errors: [],
      importedCount: 0,
      duplicateCount: 0,
    })),
    stages: [
      { stage: 'fetch', status: 'idle', counter: 0, label: 'FETCH' },
      { stage: 'parse', status: 'idle', counter: 0, label: 'PARSE' },
      { stage: 'validate', status: 'idle', counter: 0, label: 'VALIDATE' },
      { stage: 'normalize', status: 'idle', counter: 0, label: 'NORMALIZE' },
      { stage: 'store', status: 'idle', counter: 0, label: 'STORE' },
    ],
    streams: [],
    liveStats: {
      totalImported: 0,
      byPlatform: {},
      bySeverity: {},
      bySource: {},
      mitreTactics: new Set(),
      mitreTechniques: new Set(),
      avgQualityScore: 0,
    },
  };
}

// ============================================
// CONSOLE HELPER
// ============================================

function makeConsoleEntry(sourceId: string, sourceName: string, message: string, level: ConsoleLevel): ConsoleEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    sourceId,
    sourceName,
    message,
    level,
  };
}

// ============================================
// STATUS MAPPING: ImportJobStatus -> SourceStatus
// ============================================

function mapJobStatusToSourceStatus(jobStatus: ImportJobStatus): SourceStatus {
  switch (jobStatus) {
    case 'idle':
      return 'idle';
    case 'fetching':
      return 'fetching';
    case 'parsing':
      return 'parsing';
    case 'validating':
      return 'validating';
    case 'preview':
      return 'ready';
    case 'inserting':
      return 'inserting';
    case 'completed':
      return 'complete';
    case 'failed':
    case 'cancelled':
      return 'error';
    default:
      return 'idle';
  }
}

/** Map ImportJobStatus to the corresponding PipelineStage (if any) */
function jobStatusToPipelineStage(jobStatus: ImportJobStatus): PipelineStage | null {
  switch (jobStatus) {
    case 'fetching':
      return 'fetch';
    case 'parsing':
      return 'parse';
    case 'validating':
      return 'validate';
    case 'inserting':
      return 'store';
    default:
      return null;
  }
}

// ============================================
// FOLDER EXTRACTION FROM RECON
// ============================================

/**
 * Extract top-level folder information from reconReport.filePaths.
 *
 * Each filePath is relative to the repo root (e.g. "rules/windows/file.yml").
 * We strip the basePath prefix, then take the first remaining directory segment
 * as the folder name. Folders containing "deprecated" or "experimental" are
 * auto-deselected.
 */
function extractFoldersFromRecon(filePaths: string[], basePath: string): FolderInfo[] {
  const prefix = basePath ? basePath + '/' : '';
  const folderMap = new Map<string, number>();

  for (const filePath of filePaths) {
    // Only include files under the basePath
    if (prefix && !filePath.startsWith(prefix)) continue;

    // Strip basePath prefix
    const relative = prefix ? filePath.slice(prefix.length) : filePath;

    // Get the first directory segment
    const slashIndex = relative.indexOf('/');
    if (slashIndex === -1) {
      // File is directly in basePath, not in a subfolder -- skip
      continue;
    }

    const folderName = relative.slice(0, slashIndex);
    folderMap.set(folderName, (folderMap.get(folderName) || 0) + 1);
  }

  return Array.from(folderMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, fileCount]) => {
      const lowerName = name.toLowerCase();
      const shouldDeselect = lowerName.includes('deprecated') || lowerName.includes('experimental');

      return {
        name,
        path: prefix ? `${basePath}/${name}` : name,
        fileCount,
        selected: !shouldDeselect,
      };
    });
}

// ============================================
// PLATFORM NORMALIZATION
// ============================================

/** Normalize platform names to match the UI destination categories */
function normalizePlatform(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === 'windows' || lower.includes('windows')) return 'Windows';
  if (lower === 'linux' || lower.includes('linux')) return 'Linux';
  if (lower === 'macos' || lower === 'macosx' || lower.includes('macos')) return 'macOS';
  if (
    lower === 'aws' ||
    lower === 'azure' ||
    lower === 'gcp' ||
    lower.includes('cloud') ||
    lower === 'saas' ||
    lower === 'iaas'
  )
    return 'Cloud';
  if (lower.includes('network') || lower.includes('firewall') || lower.includes('proxy') || lower.includes('dns'))
    return 'Network';
  return 'Other';
}

// ============================================
// CONTEXT & PROVIDER
// ============================================

export const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export const useOnboarding = (): OnboardingContextValue => {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
};

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(onboardingReducer, undefined, createInitialState);
  const { addConsoleEntry, consoleEntries } = useGlobalImport();

  /** Map of sourceId -> BulkImportJobManager (mutable, not state) */
  const managersRef = useRef<Map<string, BulkImportJobManager>>(new Map());

  /** Map of sourceId -> GitHubFetcher used during recon (mutable) */
  const fetchersRef = useRef<Map<string, GitHubFetcher>>(new Map());

  /** Last activity milestone emitted for each source and pipeline phase. */
  const progressMilestonesRef = useRef<Map<string, number>>(new Map());

  // ------------------------------------------
  // Navigation blocking during processing phase
  // ------------------------------------------
  const isProcessing =
    state.phase === 'processing' ||
    state.phase === 'confirming' ||
    state.phase === 'importing' ||
    state.phase === 'embedding';
  useRegisterNavigationBlocker('onboarding-processing', isProcessing);

  // Block browser tab close / refresh during processing
  useEffect(() => {
    if (!isProcessing) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = 'Import in progress. Leaving will lose all progress.';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  /** PipelineController drives inter-stage stream and stage animations */
  const pipelineRef = useRef<PipelineController>(
    new PipelineController(
      (animState) => {
        // Sync pipeline animation state into reducer
        for (const stage of animState.stages) {
          dispatch({
            type: 'UPDATE_STAGE',
            stage: stage.stage,
            status: stage.status,
            counter: stage.counter,
            secondaryCounter: stage.secondaryCounter,
          });
        }
        for (const stream of animState.streams) {
          dispatch({ type: 'UPDATE_STREAM', stream });
        }
      },
      { minStageDwellMs: prefersReducedMotion() ? 0 : STAGE_DWELL_MS },
    ),
  );

  /**
   * Bumped by abort/reset so an initialize run that is only waiting on the visual queue
   * does not push the UI into 'confirming' after the user has already backed out.
   */
  const runGenerationRef = useRef(0);
  /** Guards completeImportPipeline against re-entry while the visual queue drains. */
  const completingRef = useRef(false);

  // ------------------------------------------
  // Helper: log to console
  // ------------------------------------------
  const logConsole = useCallback(
    (sourceId: string, sourceName: string, message: string, level: ConsoleLevel) => {
      addConsoleEntry(makeConsoleEntry(sourceId, sourceName, message, level));
    },
    [addConsoleEntry],
  );

  // ------------------------------------------
  // Helper: aggregate live stats from all sources
  // ------------------------------------------
  const aggregateLiveStats = useCallback(() => {
    const managers = managersRef.current;
    let totalImported = 0;
    const byPlatform: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const mitreTactics = new Set<string>();
    const mitreTechniques = new Set<string>();
    let qualityScoreSum = 0;
    let qualityScoreCount = 0;

    for (const [, manager] of managers) {
      const job = manager.getJob();
      if (!job) continue;

      totalImported += job.progress.insertedRules;

      // Aggregate from validated rules
      for (const rule of job.rules) {
        if (!rule.validation.isValid) continue;

        // By platform (normalize to match UI destination names)
        for (const rawPlatform of rule.parsed.platforms) {
          const platform = normalizePlatform(rawPlatform);
          byPlatform[platform] = (byPlatform[platform] || 0) + 1;
        }

        // By severity
        const sev = rule.parsed.level || 'unknown';
        bySeverity[sev] = (bySeverity[sev] || 0) + 1;

        // By source format
        const fmt = rule.parsed.sourceFormat;
        bySource[fmt] = (bySource[fmt] || 0) + 1;

        // MITRE
        for (const tactic of rule.parsed.mitreTactics) {
          mitreTactics.add(tactic);
        }
        for (const techId of rule.parsed.mitreAttackIds) {
          mitreTechniques.add(techId);
        }

        // Quality
        if (rule.validation.qualityScore > 0) {
          qualityScoreSum += rule.validation.qualityScore;
          qualityScoreCount++;
        }
      }
    }

    const avgQualityScore = qualityScoreCount > 0 ? Math.round(qualityScoreSum / qualityScoreCount) : 0;

    dispatch({
      type: 'UPDATE_LIVE_STATS',
      liveStats: {
        totalImported,
        byPlatform,
        bySeverity,
        bySource,
        mitreTactics,
        mitreTechniques,
        avgQualityScore,
      },
    });
  }, []);

  // ------------------------------------------
  // Helper: find source in current state ref
  // ------------------------------------------
  const findSource = useCallback((sourceId: string): OfficialSource | undefined => {
    return OFFICIAL_SOURCES.find((s) => s.id === sourceId) as OfficialSource | undefined;
  }, []);

  // ------------------------------------------
  // toggleSource
  // ------------------------------------------
  const toggleSource = useCallback(
    (sourceId: string) => {
      const currentSource = state.sources.find((s) => s.source.id === sourceId);
      if (!currentSource) return;

      dispatch({ type: 'TOGGLE_SOURCE', sourceId });

      if (!currentSource.selected) {
        // Selecting: run recon
        const source = findSource(sourceId);
        if (!source) return;

        dispatch({ type: 'SET_SOURCE_STATUS', sourceId, status: 'recon' });
        logConsole(sourceId, source.shortName, 'Starting repository scan...', 'info');

        const fetcher = new GitHubFetcher();
        fetchersRef.current.set(sourceId, fetcher);

        // Two-step scan: first detect default branch, then scan with basePath
        // This ensures we use the correct branch (main vs master) AND target the right directory
        fetcher
          .getRepoInfo(source.repoOwner, source.repoName)
          .then((repoInfo) => {
            if (!repoInfo) {
              throw new Error(
                `Could not access repository: ${source.repoOwner}/${source.repoName}. Check network or GitHub rate limits.`,
              );
            }
            const branch = repoInfo.defaultBranch;
            logConsole(
              sourceId,
              source.shortName,
              `Detected branch: ${branch}, scanning ${source.basePath}/...`,
              'info',
            );

            const url = `https://github.com/${source.repoOwner}/${source.repoName}/tree/${branch}/${source.basePath}`;
            return fetcher.scanRepository(url);
          })
          .then((reconReport) => {
            // Log any warnings from the scan (rate limits, truncation, etc.)
            if (reconReport.warnings && reconReport.warnings.length > 0) {
              for (const warning of reconReport.warnings) {
                logConsole(sourceId, source.shortName, warning, 'warn');
              }
            }

            const folders = extractFoldersFromRecon(reconReport.filePaths, source.basePath);

            dispatch({
              type: 'SET_RECON_REPORT',
              sourceId,
              reconReport,
              folders,
            });

            const selectedCount = folders.filter((f) => f.selected).length;

            if (reconReport.matchingFiles === 0) {
              logConsole(
                sourceId,
                source.shortName,
                `Scan found 0 matching files in ${source.basePath}/. The repo may use a different directory structure.`,
                'warn',
              );
            } else {
              logConsole(
                sourceId,
                source.shortName,
                `Scan complete: ${reconReport.matchingFiles} files in ${folders.length} folders (${selectedCount} selected)`,
                'ok',
              );
            }
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : 'Scan failed';
            dispatch({ type: 'SET_ERROR', sourceId, errorMessage: message });
            logConsole(sourceId, source.shortName, `Scan failed: ${message}`, 'error');
          })
          .finally(() => {
            fetchersRef.current.delete(sourceId);
          });
      } else {
        // Deselecting: reset
        dispatch({ type: 'RESET_SOURCE', sourceId });

        // Abort any in-progress fetcher
        const fetcher = fetchersRef.current.get(sourceId);
        if (fetcher) {
          fetcher.abort();
          fetchersRef.current.delete(sourceId);
        }

        // Clean up any existing manager
        const manager = managersRef.current.get(sourceId);
        if (manager) {
          manager.abort();
          managersRef.current.delete(sourceId);
        }
      }
    },
    [state.sources, findSource, logConsole],
  );

  // ------------------------------------------
  // toggleFolder
  // ------------------------------------------
  const toggleFolder = useCallback((sourceId: string, folderPath: string) => {
    dispatch({ type: 'TOGGLE_FOLDER', sourceId, folderPath });
  }, []);

  // ------------------------------------------
  // selectAllFolders / deselectAllFolders
  // ------------------------------------------
  const selectAllFolders = useCallback((sourceId: string) => {
    dispatch({ type: 'SELECT_ALL_FOLDERS', sourceId });
  }, []);

  const deselectAllFolders = useCallback((sourceId: string) => {
    dispatch({ type: 'DESELECT_ALL_FOLDERS', sourceId });
  }, []);

  // ------------------------------------------
  // Wire callbacks for a BulkImportJobManager
  // ------------------------------------------
  const wireManagerCallbacks = useCallback(
    (manager: BulkImportJobManager, sourceId: string, sourceName: string) => {
      const pipeline = pipelineRef.current;
      const sourceColor = findSource(sourceId)?.color ?? '#783264';

      manager.setCallbacks({
        onStatusChange: (jobStatus: ImportJobStatus) => {
          const sourceStatus = mapJobStatusToSourceStatus(jobStatus);
          dispatch({ type: 'SET_SOURCE_STATUS', sourceId, status: sourceStatus });

          // Drive PipelineController for inter-stage streams and stage state
          if (jobStatus === 'fetching') {
            pipeline.onSourceFetchStart(sourceId, sourceColor);
          } else if (jobStatus === 'parsing') {
            pipeline.onSourceFetchComplete(sourceId);
            pipeline.onParseStart();
          } else if (jobStatus === 'validating') {
            pipeline.onValidateStart();
          } else if (jobStatus === 'inserting') {
            pipeline.onNormalizeProgress(0); // activate normalize stage
            pipeline.onInsertStart(sourceId);
          } else if (jobStatus === 'completed') {
            pipeline.onSourceComplete(sourceId);
          } else if (jobStatus === 'failed' || jobStatus === 'cancelled') {
            pipeline.onSourceError(sourceId);
          }

          logConsole(
            sourceId,
            sourceName,
            `Status: ${jobStatus}`,
            jobStatus === 'failed' || jobStatus === 'cancelled' ? 'error' : 'info',
          );
        },

        onProgress: (progress: ImportProgress) => {
          dispatch({ type: 'UPDATE_PROGRESS', sourceId, progress });

          // Drive PipelineController counters
          if (progress.phase === 'fetching') {
            pipeline.onSourceFetchProgress(sourceId, progress.processedFiles, progress.totalFiles);
          } else if (progress.phase === 'parsing') {
            pipeline.onParseProgress(progress.totalRules, progress.errorRules);
          } else if (progress.phase === 'validating') {
            pipeline.onValidateProgress(progress.validRules, progress.warningRules);
          } else if (progress.phase === 'inserting') {
            pipeline.onInsertProgress(progress.insertedRules, progress.totalRules);
          }

          const current =
            progress.phase === 'validating'
              ? progress.validRules
              : progress.phase === 'inserting'
                ? progress.insertedRules
                : progress.processedFiles;
          const total =
            progress.phase === 'validating' || progress.phase === 'inserting'
              ? progress.totalRules
              : progress.totalFiles;

          if (total > 0) {
            const milestone = Math.min(100, Math.floor((current / total) * 10) * 10);
            const milestoneKey = `${sourceId}:${progress.phase}`;
            const lastMilestone = progressMilestonesRef.current.get(milestoneKey);

            if (lastMilestone === undefined || milestone > lastMilestone) {
              progressMilestonesRef.current.set(milestoneKey, milestone);
              const unit = progress.phase === 'validating' || progress.phase === 'inserting' ? 'rules' : 'files';
              logConsole(
                sourceId,
                sourceName,
                `${progress.phase}: ${current.toLocaleString()}/${total.toLocaleString()} ${unit}`,
                'info',
              );
            }
          }

          aggregateLiveStats();
        },

        onError: (error) => {
          dispatch({
            type: 'SET_ERROR',
            sourceId,
            errorMessage: error.message,
          });
          logConsole(sourceId, sourceName, `Error [${error.code}]: ${error.message}`, 'error');
        },

        onComplete: () => {
          dispatch({ type: 'SET_SOURCE_STATUS', sourceId, status: 'complete' });
          pipeline.onSourceComplete(sourceId);
          logConsole(sourceId, sourceName, 'Import complete', 'ok');
          aggregateLiveStats();
        },
      });
    },
    [findSource, logConsole, aggregateLiveStats],
  );

  // ------------------------------------------
  // Build source URL for selected folders
  // ------------------------------------------
  const buildSourceUrl = useCallback((source: OfficialSource): string => {
    return `https://github.com/${source.repoOwner}/${source.repoName}`;
  }, []);

  // ------------------------------------------
  // Process a single source through the import pipeline
  // ------------------------------------------
  const processSource = useCallback(
    async (sourceState: SourceState): Promise<BulkImportJobManager | null> => {
      const { source } = sourceState;
      const selectedFolders = sourceState.folders.filter((f) => f.selected);

      if (selectedFolders.length === 0) {
        logConsole(source.id, source.shortName, 'No folders selected, skipping', 'warn');
        return null;
      }

      const manager = new BulkImportJobManager();
      managersRef.current.set(source.id, manager);
      for (const key of progressMilestonesRef.current.keys()) {
        if (key.startsWith(`${source.id}:`)) progressMilestonesRef.current.delete(key);
      }

      const sourceUrl = buildSourceUrl(source);

      manager.createJob({
        sourceType: 'github',
        sourceUrl,
        vendor: source.vendor,
        vendorFilter: [source.vendor],
        targetLibrary: ONBOARDING_TARGET_LIBRARY,
        duplicateStrategy: 'skip',
        githubPath: source.basePath,
        includePaths: selectedFolders.map((f) => f.path),
      });

      wireManagerCallbacks(manager, source.id, source.shortName);

      logConsole(source.id, source.shortName, 'Starting fetch & parse pipeline...', 'info');

      try {
        // Run through fetch -> parse -> validate (stops at preview)
        await manager.runToPreview();

        // Auto-select all valid rules
        manager.selectAllValid();

        const job = manager.getJob();
        const validCount = job?.rules.filter((r) => r.validation.isValid).length ?? 0;
        logConsole(source.id, source.shortName, `Preview ready: ${validCount} valid rules parsed for pre-check`, 'ok');
      } catch (err) {
        // FIX: Catch errors from runToPreview so they surface clearly
        const message = err instanceof Error ? err.message : 'Pipeline failed';
        dispatch({ type: 'SET_ERROR', sourceId: source.id, errorMessage: message });
        logConsole(source.id, source.shortName, `Pipeline error: ${message}`, 'error');
        // Manager remains in managersRef for cleanup but job status is 'failed'
      }

      return manager;
    },
    [buildSourceUrl, wireManagerCallbacks, logConsole],
  );

  // ------------------------------------------
  // getParsedRulesForImport
  // ------------------------------------------
  const getParsedRulesForImport = useCallback((): import('../../services/bulk-import/types').ParsedRule[] => {
    const allRules: import('../../services/bulk-import/types').ParsedRule[] = [];
    for (const [, manager] of managersRef.current) {
      const job = manager.getJob();
      if (!job || job.status === 'failed' || job.status === 'cancelled') continue;

      // We want to pass ALL rules to the pre-check so it can show the full breakdown
      // (net_new vs updated vs duplicates), not just the ones that passed validation
      for (const rule of job.rules) {
        allRules.push(rule.parsed);
      }
    }
    return allRules;
  }, []);

  // ------------------------------------------
  // initializeOnboarding
  // ------------------------------------------
  const initializeOnboarding = useCallback(async () => {
    dispatch({ type: 'SET_PHASE', phase: 'processing' });
    const generation = runGenerationRef.current;

    const selectedSources = state.sources.filter((s) => s.selected && s.folders.some((f) => f.selected));

    if (selectedSources.length === 0) {
      logConsole('system', 'System', 'No sources with selected folders to import', 'warn');
      dispatch({ type: 'SET_PHASE', phase: 'selection' });
      return;
    }

    logConsole('system', 'System', `Starting onboarding for ${selectedSources.length} source(s)...`, 'info');

    // Phase 1: Run all sources through fetch/parse/validate in parallel
    const results = await Promise.allSettled(selectedSources.map((sourceState) => processSource(sourceState)));

    // Log any rejected promises
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const src = selectedSources[i];
        const message = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        dispatch({ type: 'SET_ERROR', sourceId: src.source.id, errorMessage: message });
        logConsole(src.source.id, src.source.shortName, `Pipeline failed: ${message}`, 'error');
      }
    }

    // Phase 2: Transition to 'confirming' — insertion will be handled
    // by OnboardingPage via GlobalImportContext after pre-check
    const totalParsed = getParsedRulesForImport().length;
    if (totalParsed === 0) {
      logConsole('system', 'System', 'No valid rules after processing — nothing to import', 'warn');
      dispatch({ type: 'SET_PHASE', phase: 'selection' });
      return;
    }

    logConsole('system', 'System', `Processing complete: ${totalParsed} rules ready for pre-check`, 'ok');

    // Final stats aggregation
    aggregateLiveStats();

    // Signal pipeline controller that processing (fetch/parse/validate) is done
    // but insert hasn't started — don't mark normalize/store as complete
    pipelineRef.current.onProcessingComplete();

    // Let the canvas finish showing fetch -> parse -> validate before the pre-check appears.
    await settleVisual(pipelineRef.current);
    if (runGenerationRef.current !== generation) return; // aborted while settling

    dispatch({ type: 'SET_PHASE', phase: 'confirming' });
  }, [state.sources, processSource, logConsole, aggregateLiveStats, getParsedRulesForImport]);

  // ------------------------------------------
  // getValidatedRulesForImport — Collect validated rules + combined job config
  // for handoff to GlobalImportContext.confirmAndImport()
  // ------------------------------------------
  const getValidatedRulesForImport = useCallback((): {
    rules: ValidatedRule[];
    jobConfig: ImportJobConfig;
  } => {
    const allRules: ValidatedRule[] = [];
    let combinedVendor: string | undefined;

    for (const [, manager] of managersRef.current) {
      const job = manager.getJob();
      if (!job || job.status === 'failed' || job.status === 'cancelled') continue;

      // Only require that they are structurally valid. Duplicates will be handled by the pre-check modal.
      const validRules = job.rules.filter((r) => r.validation.isValid);
      allRules.push(...validRules);

      // Track vendor for the combined config
      if (job.config.vendor && !combinedVendor) {
        combinedVendor = job.config.vendor;
      } else if (job.config.vendor && combinedVendor !== job.config.vendor) {
        combinedVendor = 'mixed';
      }
    }

    const jobConfig: ImportJobConfig = {
      sourceType: 'github',
      vendor: (combinedVendor as ImportJobConfig['vendor']) ?? 'mixed',
      targetLibrary: ONBOARDING_TARGET_LIBRARY,
      duplicateStrategy: 'skip',
      returnRoute: '/onboarding',
    };

    return { rules: allRules, jobConfig };
  }, []);

  // ------------------------------------------
  // syncImportProgress — Allow UI to sync global import progress to visual pipeline
  // ------------------------------------------
  const syncImportProgress = useCallback((progress: ImportProgress) => {
    if (progress.phase === 'embedding') {
      dispatch({ type: 'SET_PHASE', phase: 'embedding' });
      return;
    }

    if (progress.phase === 'inserting' && progress.totalRules > 0) {
      dispatch({ type: 'SET_PHASE', phase: 'importing' });
      pipelineRef.current.onNormalizeProgress(progress.totalRules);
      pipelineRef.current.onInsertStart('system');
      pipelineRef.current.onInsertProgress(progress.insertedRules, progress.totalRules);
    }
  }, []);

  const completeImportPipeline = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    const generation = runGenerationRef.current;

    pipelineRef.current.onAllComplete();
    // Let the store node finish its dwell before the completion report covers the canvas.
    await settleVisual(pipelineRef.current);
    if (runGenerationRef.current !== generation) return; // reset while settling

    dispatch({ type: 'SET_PHASE', phase: 'complete' });
  }, []);

  // ------------------------------------------
  // resetPhase — Allow UI to reset phase (e.g. cancel pre-check)
  // ------------------------------------------
  const resetPhase = useCallback((phase: OnboardingPhase) => {
    dispatch({ type: 'SET_PHASE', phase });
    // FIX: When going back to selection, reset the pipeline visualization
    if (phase === 'selection') {
      runGenerationRef.current += 1;
      completingRef.current = false;
      pipelineRef.current.reset();
    }
  }, []);

  // ------------------------------------------
  // retrySource
  // ------------------------------------------
  const retrySource = useCallback(
    async (sourceId: string) => {
      // Clean up old manager
      const oldManager = managersRef.current.get(sourceId);
      if (oldManager) {
        oldManager.abort();
        managersRef.current.delete(sourceId);
      }

      dispatch({ type: 'RESET_SOURCE', sourceId });

      const sourceState = state.sources.find((s) => s.source.id === sourceId);
      if (!sourceState) return;

      const source = findSource(sourceId);
      if (!source) return;

      logConsole(sourceId, source.shortName, 'Retrying...', 'info');
      dispatch({ type: 'SET_SOURCE_STATUS', sourceId, status: 'fetching' });

      await processSource({
        ...sourceState,
        status: 'idle',
        errors: [],
        errorMessage: undefined,
      });

      aggregateLiveStats();
    },
    [state.sources, findSource, processSource, logConsole, aggregateLiveStats],
  );

  // ------------------------------------------
  // retryAll
  // ------------------------------------------
  const retryAll = useCallback(async () => {
    const erroredSources = state.sources.filter((s) => s.status === 'error');
    for (const sourceState of erroredSources) {
      await retrySource(sourceState.source.id);
    }
  }, [state.sources, retrySource]);

  // ------------------------------------------
  // abort
  // ------------------------------------------
  const abort = useCallback(() => {
    for (const [sourceId, manager] of managersRef.current) {
      manager.abort();
      const source = findSource(sourceId);
      if (source) {
        logConsole(sourceId, source.shortName, 'Aborted', 'warn');
      }
    }

    // Abort any active fetchers too
    for (const [sourceId, fetcher] of fetchersRef.current) {
      fetcher.abort();
      const source = findSource(sourceId);
      if (source) {
        logConsole(sourceId, source.shortName, 'Recon aborted', 'warn');
      }
    }

    runGenerationRef.current += 1;
    completingRef.current = false;
    pipelineRef.current.reset();
    dispatch({ type: 'RESET_AFTER_ABORT' });
  }, [findSource, logConsole]);

  // ------------------------------------------
  // Context value
  // ------------------------------------------
  const contextValue: OnboardingContextValue = {
    // State
    phase: state.phase,
    sources: state.sources,
    stages: state.stages,
    streams: state.streams,
    liveStats: state.liveStats,
    consoleEntries,
    incompleteJobId: state.incompleteJobId,

    // Actions
    toggleSource,
    toggleFolder,
    selectAllFolders,
    deselectAllFolders,
    initializeOnboarding,
    retrySource,
    retryAll,
    abort,
    getParsedRulesForImport,
    getValidatedRulesForImport,
    resetPhase,
    syncImportProgress,
    completeImportPipeline,
  };

  return <OnboardingContext.Provider value={contextValue}>{children}</OnboardingContext.Provider>;
};
