/**
 * SourceOverlay
 *
 * Glass morphism HTML overlay on the left zone of the onboarding canvas.
 * Appears when at least one source is selected, showing rich detail:
 *   - Repo URL, description, format badge
 *   - Collapsible source sections with expand/collapse chevron
 *   - Directory tree with connectors for folder selection
 *   - Status indicators and error handling
 *   - Quick-select buttons for unselected sources
 *
 * Uses M3 theme tokens for full light/dark theme support.
 */

import { useState, useEffect, useRef } from 'react';
import { useOnboarding } from './OnboardingContext';
import type { SourceState, FolderInfo } from './types';

/** Map source IDs to bundled logo paths */
const SOURCE_LOGO_MAP: Record<string, string> = {
  'sigma-hq': '/logos/integrations/sigma.svg',
  'splunk-escu': '/logos/integrations/splunk.svg',
  'elastic-detection-rules': '/logos/integrations/elastic.svg',
  'chronicle-detection-rules': '/logos/integrations/chronicle.svg',
  'microsoft-sentinel': '/logos/integrations/sentinel.svg',
  'defender-xdr': '/logos/integrations/defender-xdr.svg',
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function isProcessing(status: string): boolean {
  return ['fetching', 'parsing', 'validating', 'inserting', 'recon'].includes(status);
}

// ---------------------------------------------------------------------------
// Folder tree row
// ---------------------------------------------------------------------------

interface FolderTreeRowProps {
  folder: FolderInfo;
  isLast: boolean;
  onToggle: () => void;
}

function FolderTreeRow({ folder, isLast, onToggle }: FolderTreeRowProps): React.JSX.Element {
  const connector = isLast ? '\u2514\u2500' : '\u251C\u2500';

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="w-full flex items-center gap-1 py-[2px] px-0.5 rounded cursor-pointer transition-colors duration-150 hover:bg-on-surface/[0.04]"
    >
      {/* Tree connector */}
      <span
        className="text-[10px] shrink-0 select-none text-outline-variant"
        style={{ fontFamily: 'monospace', width: '20px' }}
      >
        {connector}
      </span>

      {/* Checkbox */}
      <span
        className={[
          'shrink-0 w-3 h-3 rounded-[3px] flex items-center justify-center transition-all duration-200',
          folder.selected
            ? 'border-[1.5px] border-primary bg-primary/20'
            : 'border-[1.5px] border-outline-variant',
        ].join(' ')}
      >
        {folder.selected && (
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 4L3.2 5.7L6.5 2.3"
              stroke="rgb(var(--md-sys-color-primary))"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      {/* Folder name */}
      <span
        className={[
          'text-[11px] truncate flex-1 text-left transition-colors duration-150',
          folder.selected ? 'text-on-surface' : 'text-on-surface-variant',
        ].join(' ')}
        style={{ fontFamily: 'monospace' }}
      >
        {folder.name}
      </span>

      {/* File count */}
      <span className="text-[10px] shrink-0 tabular-nums text-on-surface-variant">
        {folder.fileCount}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Scanning indicator
// ---------------------------------------------------------------------------

function ScanningIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 py-2 px-1">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-[10px] text-on-surface-variant">Scanning repository...</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single source detail section
// ---------------------------------------------------------------------------

interface SourceDetailProps {
  state: SourceState;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleFolder: (path: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRetry: () => void;
}

function SourceDetail({
  state,
  expanded,
  onToggleExpand,
  onToggleFolder,
  onSelectAll,
  onDeselectAll,
  onRetry,
}: SourceDetailProps): React.JSX.Element {
  const { source, status, folders, errorMessage } = state;
  const processing = isProcessing(status);
  const showFolders = status === 'ready' && folders.length > 0;
  const selectedFolderCount = folders.filter((f) => f.selected).length;

  // Status indicator dot color
  const statusDotClass =
    status === 'complete' ? 'bg-[#10b981]'
    : status === 'error' ? 'bg-error'
    : processing ? 'bg-primary animate-pulse'
    : status === 'ready' ? 'bg-[#10b981]'
    : 'bg-outline-variant';

  return (
    <div className="last:mb-0">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-1.5 py-1.5 px-1 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-on-surface/[0.04]"
      >
        {/* Chevron */}
        <svg
          className="w-3 h-3 shrink-0 text-on-surface-variant transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>

        {/* Source logo */}
        {SOURCE_LOGO_MAP[source.id] ? (
          <div className="w-4 h-4 rounded shrink-0 bg-surface-container-high flex items-center justify-center overflow-hidden">
            <img
              src={SOURCE_LOGO_MAP[source.id]}
              alt={source.shortName}
              width={12}
              height={12}
              className="object-contain"
            />
          </div>
        ) : (
          <div
            className="w-4 h-4 rounded shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
            style={{ backgroundColor: source.color }}
          >
            {source.shortName.charAt(0)}
          </div>
        )}

        {/* Source name */}
        <span className="text-[12px] font-medium text-on-surface truncate flex-1 text-left">
          {source.shortName}
        </span>

        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
      </button>

      {/* Expanded content — folder tree + status */}
      {expanded && (
        <div className="pl-5 pr-1 pb-1.5">
          {/* Error with retry */}
          {status === 'error' && (
            <div className="flex items-center gap-2 py-1">
              <span className="text-[10px] text-error truncate">
                {errorMessage || 'Failed'}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer text-error border border-error/30 bg-error/10"
              >
                Retry
              </button>
            </div>
          )}

          {/* Scanning state */}
          {status === 'recon' && <ScanningIndicator />}

          {/* Folder tree */}
          {showFolders && (
            <div className="mt-0.5">
              {/* Tree header */}
              <div
                className="text-[10px] mb-0.5 text-on-surface-variant"
                style={{ fontFamily: 'monospace' }}
              >
                {source.basePath}/
              </div>

              {/* Tree rows */}
              <div className="ml-0.5">
                {folders.map((folder, i) => (
                  <FolderTreeRow
                    key={folder.path}
                    folder={folder}
                    isLast={i === folders.length - 1}
                    onToggle={() => onToggleFolder(folder.path)}
                  />
                ))}
              </div>

              {/* Select All / None + counter */}
              <div className="flex items-center gap-2 mt-1 px-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectAll(); }}
                  className="cursor-pointer transition-colors text-on-primary-container hover:text-on-surface"
                >
                  All
                </button>
                <span className="text-outline-variant">|</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeselectAll(); }}
                  className="cursor-pointer transition-colors text-on-primary-container hover:text-on-surface"
                >
                  None
                </button>
                <span className="ml-auto tabular-nums text-on-surface-variant">
                  {selectedFolderCount}/{folders.length}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-outline-variant/10" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel content — inner content only, no positioning wrapper
// Used inside foreignObject in PipelineVisualization
// ---------------------------------------------------------------------------

interface SourcePanelContentProps {
  onCollapse: () => void;
}

export function SourcePanelContent({ onCollapse }: SourcePanelContentProps): React.JSX.Element | null {
  const {
    sources,
    toggleSource,
    toggleFolder,
    selectAllFolders,
    deselectAllFolders,
    retrySource,
  } = useOnboarding();

  const selectedSources = sources.filter((s) => s.selected);
  const unselectedSources = sources.filter((s) => !s.selected);

  // Collapsible state: which source section is expanded (null = all collapsed)
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  // Track previous selected source IDs to detect new additions
  const prevSelectedIdsRef = useRef<Set<string>>(new Set());

  // Auto-expand only when a NEW source is selected (not on every render)
  useEffect(() => {
    const currentIds = new Set(selectedSources.map((s) => s.source.id));
    const prevIds = prevSelectedIdsRef.current;

    const newlyAdded = selectedSources.filter((s) => !prevIds.has(s.source.id));

    if (newlyAdded.length > 0) {
      setExpandedSourceId(newlyAdded[0].source.id);
    }

    if (expandedSourceId && !currentIds.has(expandedSourceId)) {
      setExpandedSourceId(null);
    }

    prevSelectedIdsRef.current = currentIds;
  }, [selectedSources, expandedSourceId]);

  if (selectedSources.length === 0) return null;

  return (
    <>
      {/* Panel header with collapse button */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5 shrink-0">
        <span className="text-[11px] font-medium tracking-wide uppercase text-on-surface-variant">
          Sources ({selectedSources.length})
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.08]"
          title="Collapse panel"
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 4l-4 4 4 4" />
          </svg>
        </button>
      </div>

      {/* Quick-select chips for unselected sources */}
      {unselectedSources.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {unselectedSources.map((s) => (
            <button
              key={s.source.id}
              type="button"
              onClick={() => toggleSource(s.source.id)}
              className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-all duration-150 text-on-surface-variant border border-outline-variant/25 hover:border-primary/40 hover:text-on-surface flex items-center gap-1"
            >
              {SOURCE_LOGO_MAP[s.source.id] && (
                <img
                  src={SOURCE_LOGO_MAP[s.source.id]}
                  alt=""
                  width={10}
                  height={10}
                  className="object-contain"
                />
              )}
              + {s.source.shortName}
            </button>
          ))}
        </div>
      )}

      {/* Divider after quick-select */}
      {unselectedSources.length > 0 && (
        <div className="h-px mx-3 bg-outline-variant/10" />
      )}

      {/* Selected source details (scrollable) */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-minimal">
        {selectedSources.map((state) => (
          <SourceDetail
            key={state.source.id}
            state={state}
            expanded={expandedSourceId === state.source.id}
            onToggleExpand={() =>
              setExpandedSourceId(
                expandedSourceId === state.source.id ? null : state.source.id
              )
            }
            onToggleFolder={(path) => toggleFolder(state.source.id, path)}
            onSelectAll={() => selectAllFolders(state.source.id)}
            onDeselectAll={() => deselectAllFolders(state.source.id)}
            onRetry={() => retrySource(state.source.id)}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Legacy wrapper — kept for backwards compat but no longer used
// ---------------------------------------------------------------------------

export function SourceOverlay(): React.JSX.Element | null {
  return null;
}

export default SourceOverlay;
