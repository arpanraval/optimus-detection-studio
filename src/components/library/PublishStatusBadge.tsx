import React from 'react';
import { Icon } from '../Icon';
import { PublishStatus } from '../../types';

export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface PublishStatusBadgeProps {
  status: PublishStatus;
  size?: BadgeSize;
  showLabel?: boolean;
}

/**
 * PublishStatusBadge Component - Detection Studio Design System
 *
 * Colors:
 * - unpublished: Surface Gray
 * - pending: Yellow (warning)
 * - published: #4D7C6F (Sage Green - success)
 * - rejected: #A63D40 (Brick Red - error)
 *
 * Sizes: xs (16px), sm (20px), md (24px), lg (28px)
 */
const statusConfig: Record<PublishStatus, {
  icon: string;
  label: string;
  className: string;
  iconClassName: string;
}> = {
  unpublished: {
    icon: 'circle',
    label: 'Unpublished',
    className: 'bg-surface-container-highest text-on-surface-variant',
    iconClassName: 'text-on-surface-variant'
  },
  pending: {
    icon: 'clock',
    label: 'Pending Review',
    className: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20',
    iconClassName: 'text-yellow-500 animate-pulse'
  },
  published: {
    icon: 'check-circle',
    label: 'Published',
    className: 'bg-[#4D7C6F]/15 text-[#4D7C6F] border border-[#4D7C6F]/20',
    iconClassName: 'text-[#4D7C6F]'
  },
  rejected: {
    icon: 'x-circle',
    label: 'Rejected',
    className: 'bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20',
    iconClassName: 'text-[#A63D40]'
  }
};

// Size configurations matching design system
const sizeStyles: Record<BadgeSize, { padding: string; text: string; radius: string; iconSize: string; gap: string }> = {
  xs: { padding: 'px-1.5 py-0.5', text: 'text-[8px]', radius: 'rounded', iconSize: 'w-2 h-2', gap: 'gap-1' },
  sm: { padding: 'px-2 py-0.5', text: 'text-[9px]', radius: 'rounded-md', iconSize: 'w-2.5 h-2.5', gap: 'gap-1' },
  md: { padding: 'px-2.5 py-1', text: 'text-[10px]', radius: 'rounded-lg', iconSize: 'w-3 h-3', gap: 'gap-1.5' },
  lg: { padding: 'px-3 py-1.5', text: 'text-[11px]', radius: 'rounded-lg', iconSize: 'w-3.5 h-3.5', gap: 'gap-1.5' },
};

export const PublishStatusBadge: React.FC<PublishStatusBadgeProps> = ({
  status,
  size = 'sm',
  showLabel = true
}) => {
  const config = statusConfig[status];
  const sizeConfig = sizeStyles[size];

  return (
    <span
      className={[
        'inline-flex items-center font-bold uppercase tracking-wide',
        sizeConfig.padding,
        sizeConfig.text,
        sizeConfig.radius,
        sizeConfig.gap,
        config.className,
      ].join(' ')}
    >
      <Icon name={config.icon} className={`${sizeConfig.iconSize} ${config.iconClassName}`} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};
