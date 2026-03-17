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
  // Size configurations
  const sizeStyles: Record<BadgeSize, { padding: string; text: string; radius: string }> = {
    xs: { padding: 'px-1.5 py-0.5', text: 'text-[8px]', radius: 'rounded' },
    sm: { padding: 'px-2 py-0.5', text: 'text-[9px]', radius: 'rounded-md' },
    md: { padding: 'px-2.5 py-1', text: 'text-[10px]', radius: 'rounded-lg' },
    lg: { padding: 'px-3 py-1.5', text: 'text-[11px]', radius: 'rounded-lg' },
  };

  // Status color configurations using DS colors
  const statusStyles: Record<Status, string> = {
    [Status.Production]: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
    [Status.Testing]: 'bg-[#0284C7]/15 text-[#0284C7]',
    [Status.Development]: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    [Status.Review]: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    [Status.Draft]: 'bg-surface-container-highest text-on-surface-variant',
    [Status.Backlog]: 'bg-surface-container-highest text-on-surface-variant',
    [Status.Deprecated]: 'bg-[#A63D40]/15 text-[#A63D40]',
    [Status.Archived]: 'bg-surface-container-highest text-on-surface-variant/60',
  };

  const currentSize = sizeStyles[size];
  const currentStatus = statusStyles[status];

  return (
    <span
      className={[
        currentSize.padding,
        currentSize.text,
        currentSize.radius,
        currentStatus,
        'font-bold uppercase tracking-wide inline-flex items-center',
        className,
      ].filter(Boolean).join(' ')}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
