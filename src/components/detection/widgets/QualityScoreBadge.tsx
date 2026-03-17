import React from 'react';
import { Icon } from '../../Icon';

export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface QualityScoreBadgeProps {
  score: number;
  size?: BadgeSize;
  showLabel?: boolean;
}

/**
 * QualityScoreBadge Component - Detection Studio Design System
 *
 * Colors (based on score thresholds):
 * - 80+: #4D7C6F (Sage Green) - Excellent
 * - 60-79: #0284C7 (Sky Blue) - Good
 * - 40-59: Orange - Fair
 * - <40: #A63D40 (Brick Red) - Needs Work
 *
 * Sizes: xs (32px), sm (40px), md (48px), lg (56px)
 */
export const QualityScoreBadge: React.FC<QualityScoreBadgeProps> = ({
  score,
  size = 'md',
  showLabel = false
}) => {
  const getScoreColor = (score: number): { hex: string; label: string } => {
    if (score >= 80) return { hex: '#4D7C6F', label: 'Excellent' };
    if (score >= 60) return { hex: '#0284C7', label: 'Good' };
    if (score >= 40) return { hex: '#F97316', label: 'Fair' }; // orange-500
    return { hex: '#A63D40', label: 'Needs Work' };
  };

  const { hex: color, label } = getScoreColor(score);

  // Size configurations matching design system
  const sizeConfig: Record<BadgeSize, { width: number; radius: number; stroke: number; fontSize: string }> = {
    xs: { width: 32, radius: 11, stroke: 3, fontSize: 'text-[8px]' },
    sm: { width: 40, radius: 14, stroke: 4, fontSize: 'text-[9px]' },
    md: { width: 48, radius: 18, stroke: 5, fontSize: 'text-sm' },
    lg: { width: 56, radius: 21, stroke: 5, fontSize: 'text-base' },
  };

  const config = sizeConfig[size];
  const circumference = 2 * Math.PI * config.radius;
  const offset = circumference - (score / 100) * circumference;

  if (showLabel) {
    // Inline badge style with label
    const labelSizeClasses: Record<BadgeSize, string> = {
      xs: 'px-1.5 py-0.5 text-[8px] gap-1',
      sm: 'px-2 py-0.5 text-[9px] gap-1.5',
      md: 'px-2.5 py-1 text-[10px] gap-1.5',
      lg: 'px-3 py-1.5 text-[11px] gap-2',
    };
    const iconSizes: Record<BadgeSize, string> = {
      xs: 'w-2.5 h-2.5',
      sm: 'w-3 h-3',
      md: 'w-3.5 h-3.5',
      lg: 'w-4 h-4',
    };

    return (
      <div
        className={`flex items-center rounded-lg border ${labelSizeClasses[size]}`}
        style={{
          backgroundColor: `${color}15`,
          borderColor: `${color}30`,
          color: color
        }}
      >
        <Icon name="award" className={iconSizes[size]} />
        <span className="font-bold">{score}</span>
        <span style={{ opacity: 0.6 }}>/100</span>
        {size !== 'xs' && (
          <span className="ml-1" style={{ opacity: 0.7 }}>
            {label}
          </span>
        )}
      </div>
    );
  }

  // Circular progress style (default)
  return (
    <div
      className="relative rounded-full"
      style={{
        width: config.width,
        height: config.width,
        backgroundColor: `${color}10`
      }}
    >
      <svg
        className="-rotate-90"
        style={{ width: config.width, height: config.width }}
      >
        <circle
          cx={config.width / 2}
          cy={config.width / 2}
          r={config.radius}
          fill="none"
          strokeWidth={config.stroke}
          stroke={`${color}20`}
        />
        <circle
          cx={config.width / 2}
          cy={config.width / 2}
          r={config.radius}
          fill="none"
          strokeWidth={config.stroke}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold ${config.fontSize}`}
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
};
