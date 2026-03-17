import React from 'react';
import type { SourceState } from '../types';
import { FolderChip } from './FolderChip';
import { Button } from '../../ui/Button';

/** Map source IDs to bundled logo paths */
const SOURCE_LOGO_MAP: Record<string, string> = {
  'sigma-hq': '/logos/integrations/sigma.svg',
  'splunk-escu': '/logos/integrations/splunk.svg',
  'elastic-detection-rules': '/logos/integrations/elastic.svg',
  'chronicle-detection-rules': '/logos/integrations/chronicle.svg',
  'microsoft-sentinel': '/logos/integrations/sentinel.svg',
  'defender-xdr': '/logos/integrations/defender-xdr.svg',
};

export interface SourceCardProps {
  state: SourceState;
  onToggle: () => void;
  onToggleFolder: (folderPath: string) => void;
  onSelectAllFolders: () => void;
  onDeselectAllFolders: () => void;
  onRetry?: () => void;
  animationDelay?: number;
}

/** Status labels for active processing states */
const STATUS_LABELS: Record<string, string> = {
  fetching: 'Fetching...',
  parsing: 'Parsing...',
  validating: 'Validating...',
  inserting: 'Importing...',
  recon: 'Scanning...',
};

/** Accent bar color by status */
function getAccentColor(status: string): string | null {
  switch (status) {
    case 'fetching':
    case 'parsing':
    case 'validating':
    case 'inserting':
      return 'bg-primary';
    case 'complete':
      return 'bg-secondary';
    case 'error':
      return 'bg-error';
    case 'paused':
      return 'bg-amber-500';
    default:
      return null;
  }
}

/** Check if a status is an active processing state */
function isProcessing(status: string): boolean {
  return ['fetching', 'parsing', 'validating', 'inserting'].includes(status);
}

/**
 * SourceCard - Main card for a detection source in the onboarding panel.
 *
 * Displays vendor info, selection toggle, status indicators, and
 * an expandable folder grid when the source is selected and ready.
 */
export const SourceCard: React.FC<SourceCardProps> = ({
  state,
  onToggle,
  onToggleFolder,
  onSelectAllFolders,
  onDeselectAllFolders,
  onRetry,
  animationDelay = 0,
}) => {
  const { source, selected, status, folders, importedCount, errorMessage } = state;
  const accentColor = getAccentColor(status);
  const processing = isProcessing(status);
  const showFolders = selected && status === 'ready' && folders.length > 0;
  const selectedFolderCount = folders.filter((f) => f.selected).length;
  const totalFolderFiles = folders
    .filter((f) => f.selected)
    .reduce((sum, f) => sum + f.fileCount, 0);

  return (
    <div
      className={[
        'relative rounded-2xl border p-4 transition-all duration-200',
        'bg-surface-container-lowest',
        selected
          ? 'border-primary/30 shadow-sm'
          : 'border-outline-variant/20',
        'hover:border-primary/30 hover:shadow-sm',
      ].join(' ')}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Accent bar */}
      {accentColor && (
        <div
          className={[
            'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl',
            accentColor,
          ].join(' ')}
        />
      )}

      {/* Recon shimmer overlay */}
      {status === 'recon' && (
        <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-pulse pointer-events-none" />
      )}

      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Vendor logo or initial circle */}
        {SOURCE_LOGO_MAP[source.id] ? (
          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 border border-outline-variant/15 overflow-hidden">
            <img
              src={SOURCE_LOGO_MAP[source.id]}
              alt={source.shortName}
              width={20}
              height={20}
              className="object-contain"
            />
          </div>
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-brand text-sm font-bold text-white"
            style={{ backgroundColor: source.color }}
          >
            {source.shortName.charAt(0)}
          </div>
        )}

        {/* Source info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-on-surface truncate">
              {source.name}
            </span>

            {/* Toggle / status indicator */}
            {status === 'complete' ? (
              <CompletionCheck />
            ) : (
              <button
                type="button"
                onClick={onToggle}
                className="shrink-0"
                aria-label={selected ? `Deselect ${source.name}` : `Select ${source.name}`}
              >
                <ToggleCheckbox checked={selected} />
              </button>
            )}
          </div>

          <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">
            {source.description}
          </p>

          {/* Meta line */}
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-on-surface-variant/70">
            {status === 'complete' ? (
              <span className="text-secondary font-medium">
                {importedCount.toLocaleString()} imported
              </span>
            ) : (
              <span>~{source.estimatedRules.toLocaleString()} rules</span>
            )}
            <span>&middot;</span>
            <span className="capitalize">{source.format}</span>

            {/* Processing spinner + label */}
            {processing && (
              <>
                <span>&middot;</span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <LoadingSpinner />
                  {STATUS_LABELS[status]}
                </span>
              </>
            )}

            {/* Recon label */}
            {status === 'recon' && (
              <>
                <span>&middot;</span>
                <span className="text-primary">Scanning...</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {status === 'error' && errorMessage && (
        <div className="mt-3 flex items-start gap-2 text-xs text-error">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5">
            <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={2} />
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="flex-1">{errorMessage}</span>
          {onRetry && (
            <Button
              variant="text"
              color="error"
              size="sm"
              onClick={onRetry}
              className="shrink-0 !h-auto !px-2 !py-0.5 text-[11px]"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Paused state */}
      {status === 'paused' && (
        <div className="mt-3 text-xs text-amber-500 flex items-center gap-1.5">
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" className="shrink-0">
            <rect x={6} y={5} width={4} height={14} rx={1} fill="currentColor" />
            <rect x={14} y={5} width={4} height={14} rx={1} fill="currentColor" />
          </svg>
          Paused - waiting for rate limit...
        </div>
      )}

      {/* Folder grid */}
      {showFolders && (
        <div className="mt-3 pt-3 border-t border-outline-variant/10">
          <div className="flex flex-wrap gap-1.5">
            {folders.map((folder, index) => (
              <FolderChip
                key={folder.path}
                name={folder.name}
                fileCount={folder.fileCount}
                selected={folder.selected}
                onToggle={() => onToggleFolder(folder.path)}
                animationDelay={index * 30}
              />
            ))}
          </div>

          {/* Select all / deselect all */}
          <div className="flex items-center gap-2 mt-2 text-[11px]">
            <button
              type="button"
              onClick={onSelectAllFolders}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              Select All
            </button>
            <span className="text-on-surface-variant/30">&middot;</span>
            <button
              type="button"
              onClick={onDeselectAllFolders}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              Deselect All
            </button>
            <span className="ml-auto text-on-surface-variant/50">
              {selectedFolderCount}/{folders.length} folders &middot; ~{totalFolderFiles.toLocaleString()} files
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/** Inline checkbox SVG */
function ToggleCheckbox({ checked }: { checked: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      {checked ? (
        <>
          <rect x={1} y={1} width={16} height={16} rx={4} className="fill-primary" />
          <path
            d="M5 9L8 12L13 6"
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <rect
          x={1}
          y={1}
          width={16}
          height={16}
          rx={4}
          className="stroke-on-surface-variant/40"
          strokeWidth={1.5}
          fill="none"
        />
      )}
    </svg>
  );
}

/** Green completion checkmark */
function CompletionCheck() {
  return (
    <div className="animate-enter-scale">
      <svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <circle cx={9} cy={9} r={8} className="fill-secondary" />
        <path
          d="M5.5 9L8 11.5L12.5 6.5"
          stroke="white"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Small animated spinner */
function LoadingSpinner() {
  return (
    <svg
      className="animate-spin"
      width={10}
      height={10}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx={8}
        cy={8}
        r={6}
        stroke="currentColor"
        strokeWidth={2}
        strokeOpacity={0.25}
      />
      <path
        d="M14 8a6 6 0 00-6-6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default SourceCard;
