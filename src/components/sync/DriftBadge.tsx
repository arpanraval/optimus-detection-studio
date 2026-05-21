import React from 'react';
import { Icon } from '../Icon';
import type { DriftState } from '../../services/drift/types';

type BadgeSize = 'xs' | 'sm' | 'md';

interface DriftBadgeProps {
  state: DriftState;
  size?: BadgeSize;
  /** Render just the dot + label without the leading icon. */
  compact?: boolean;
  className?: string;
}

// Colour semantics (reviewed by detection-engineer + UX personas):
//   upstream_changed → amber  (you have work — this is the most common actionable state)
//   conflict         → red    (most urgent: accept-upstream would overwrite local edits)
//   upstream_removed → neutral grey (informational — rule no longer exists upstream)
//   in_sync          → green
//   dismissed        → muted neutral
const CONFIG: Partial<Record<DriftState, { label: string; icon: string; classes: string }>> = {
  upstream_changed: {
    label: 'Upstream update',
    icon: 'arrow-down',
    classes: 'bg-[#A6750D]/15 text-[#A6750D] dark:text-amber-400',
  },
  conflict: {
    label: 'Conflict',
    icon: 'alert-triangle',
    classes: 'bg-[#A63D40]/15 text-[#A63D40] dark:text-rose-400',
  },
  upstream_removed: {
    label: 'Removed upstream',
    icon: 'x-circle',
    classes: 'bg-surface-container-highest text-on-surface-variant',
  },
  dismissed: {
    label: 'Dismissed',
    icon: 'x-circle',
    classes: 'bg-surface-container-highest text-on-surface-variant/70',
  },
  in_sync: {
    label: 'In sync',
    icon: 'check-circle',
    classes: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
  },
};

const SIZES: Record<BadgeSize, { wrap: string; icon: string }> = {
  xs: { wrap: 'px-1.5 py-0.5 text-[9px] gap-1 rounded', icon: 'w-2.5 h-2.5' },
  sm: { wrap: 'px-2 py-0.5 text-[10px] gap-1 rounded-md', icon: 'w-3 h-3' },
  md: { wrap: 'px-2.5 py-1 text-[11px] gap-1.5 rounded-lg', icon: 'w-3.5 h-3.5' },
};

/** Small pill describing a detection's drift state. */
export const DriftBadge: React.FC<DriftBadgeProps> = ({ state, size = 'sm', compact = false, className = '' }) => {
  const cfg = CONFIG[state];
  if (!cfg) return null;
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-wide ${s.wrap} ${cfg.classes} ${className}`}
      title={cfg.label}
    >
      {!compact && <Icon name={cfg.icon} className={s.icon} />}
      {cfg.label}
    </span>
  );
};
