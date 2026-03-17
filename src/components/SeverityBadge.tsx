import React from 'react';
import { Severity } from '../types';

export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface SeverityBadgeProps {
  severity: Severity;
  size?: BadgeSize;
  className?: string;
}

/**
 * SeverityBadge Component - Detection Studio Design System
 *
 * Colors (with distinct hue progression):
 * - Critical: #A63D40 (Brick Red)
 * - High: Orange (Tailwind)
 * - Medium: Yellow (Tailwind)
 * - Low: #4D7C6F (Sage Green)
 * - Informational: Surface Gray
 *
 * All badges include a subtle border for definition.
 * Sizes: xs (16px), sm (20px), md (24px), lg (28px)
 */
export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
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

  // Severity color configurations using DS colors
  const severityStyles: Record<Severity, string> = {
    [Severity.Critical]: 'bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20',
    [Severity.High]: 'bg-orange-500/15 text-orange-500 border border-orange-500/20',
    [Severity.Medium]: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20',
    [Severity.Low]: 'bg-[#4D7C6F]/15 text-[#4D7C6F] border border-[#4D7C6F]/20',
    [Severity.Informational]: 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/20',
  };

  const currentSize = sizeStyles[size];
  const currentSeverity = severityStyles[severity];

  return (
    <span
      className={[
        currentSize.padding,
        currentSize.text,
        currentSize.radius,
        currentSeverity,
        'font-bold uppercase tracking-wide inline-flex items-center',
        className,
      ].filter(Boolean).join(' ')}
    >
      {severity}
    </span>
  );
};

export default SeverityBadge;
