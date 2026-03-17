import React from 'react';

export interface FolderChipProps {
  name: string;
  fileCount: number;
  selected: boolean;
  onToggle: () => void;
  animationDelay?: number;
}

/**
 * FolderChip - Selectable chip for a folder discovered during source recon.
 *
 * Renders as a small toggleable chip with folder name, file count badge,
 * and a mini checkbox icon. Supports staggered entrance animations.
 */
export const FolderChip: React.FC<FolderChipProps> = ({
  name,
  fileCount,
  selected,
  onToggle,
  animationDelay = 0,
}) => {
  const displayName = name.length > 14 ? `${name.slice(0, 13)}...` : name;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={name.length > 14 ? name : undefined}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer',
        'transition-all duration-200 text-xs',
        'animate-enter-scale',
        selected
          ? 'bg-primary/10 border border-primary/40 text-on-surface'
          : 'bg-surface-container-low border border-outline-variant/20 text-on-surface-variant',
        'hover:border-primary/30',
      ].join(' ')}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Mini checkbox icon */}
      <svg
        width={12}
        height={12}
        viewBox="0 0 12 12"
        fill="none"
        className="shrink-0"
      >
        {selected ? (
          <>
            <rect
              x={0.5}
              y={0.5}
              width={11}
              height={11}
              rx={2}
              fill="currentColor"
              className="text-primary"
            />
            <path
              d="M3.5 6L5.5 8L8.5 4"
              stroke="white"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <rect
            x={0.5}
            y={0.5}
            width={11}
            height={11}
            rx={2}
            stroke="currentColor"
            strokeOpacity={0.4}
          />
        )}
      </svg>

      {/* Folder name */}
      <span className="truncate max-w-[80px]">{displayName}</span>

      {/* File count badge */}
      <span
        className={[
          'text-[10px] leading-none px-1.5 py-0.5 rounded-full',
          selected
            ? 'bg-primary/20 text-primary'
            : 'bg-on-surface/10 text-on-surface-variant',
        ].join(' ')}
      >
        {fileCount}
      </span>
    </button>
  );
};

export default FolderChip;
