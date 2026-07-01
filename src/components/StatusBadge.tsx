import React from 'react';
import { Status } from '../types';

export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface StatusBadgeProps {
  status: Status;
  size?: BadgeSize;
  className?: string;
}

/**
 * StatusBadge Component - Detection Studio Design System
 *
 * Colors:
 * - Production: #4D7C6F (Sage Green)
 * - Testing: #0284C7 (Sky Blue)
 * - Development/Review: Purple (Tailwind)
 * - Draft/Backlog: Surface Gray
 * - Deprecated/Archived: #A63D40 (Brick Red)
 *
 * Sizes: xs (16px), sm (20px), md (24px), lg (28px)
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  className = ''
}) => {
  // Size configurations — uniform pill (rounded-full) regardless of size
  const sizeStyles: Record<BadgeSize, { height: string; padding: string; text: string }> = {
    xs: { height: 'h-4',   padding: 'px-2',    text: 'text-[9px]' },
    sm: { height: 'h-5',   padding: 'px-2.5',  text: 'text-[10px]' },
    md: { height: 'h-6',   padding: 'px-3',    text: 'text-[11px]' },
    lg: { height: 'h-7',   padding: 'px-3.5',  text: 'text-[12px]' },
  };

  // Accent (text + border) only — bg/shape come from the shared pill recipe below.
  // Uses M3 extended tokens which auto-adapt across light/dark themes.
  const statusStyles: Record<Status, string> = {
    [Status.Production]: 'text-ext-green border-ext-green/30',
    [Status.Testing]: 'text-ext-cyan border-ext-cyan/30',
    [Status.Development]: 'text-ext-violet border-ext-violet/30',
    [Status.Review]: 'text-ext-violet border-ext-violet/30',
    [Status.Draft]: 'text-on-surface-variant border-outline-variant/40',
    [Status.Backlog]: 'text-on-surface-variant border-outline-variant/40',
    [Status.Deprecated]: 'text-ext-coral border-ext-coral/30',
    [Status.Archived]: 'text-on-surface-variant/70 border-outline-variant/40',
  };

  const currentSize = sizeStyles[size];
  const currentStatus = statusStyles[status];

  return (
    <span
      className={[
        'inline-flex items-center rounded-full bg-surface-container-high border font-bold uppercase tracking-wider',
        currentSize.height,
        currentSize.padding,
        currentSize.text,
        currentStatus,
        className,
      ].filter(Boolean).join(' ')}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
