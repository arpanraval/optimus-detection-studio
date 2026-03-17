import React from 'react';

export type QualityScoreSize = 'xs' | 'sm' | 'md' | 'lg';

interface QualityScoreProps {
  score: number;
  size?: QualityScoreSize;
  className?: string;
}

/**
 * QualityScore Component - Detection Studio Design System
 *
 * Circular progress ring with color-coded score:
 * - 80+: #4D7C6F (Sage Green)
 * - 60-79: #0284C7 (Sky Blue)
 * - 40-59: #D97706 (Orange)
 * - <40: #A63D40 (Brick Red)
 *
 * Sizes: xs (32px), sm (40px), md (48px), lg (56px)
 */
export const QualityScore: React.FC<QualityScoreProps> = ({
  score,
  size = 'md',
  className = ''
}) => {
  // Size configurations
  const sizeConfig: Record<QualityScoreSize, {
    width: number;
    radius: number;
    stroke: number;
    fontSize: string;
  }> = {
    xs: { width: 32, radius: 11, stroke: 3, fontSize: 'text-[8px]' },
    sm: { width: 40, radius: 14, stroke: 4, fontSize: 'text-[9px]' },
    md: { width: 48, radius: 18, stroke: 5, fontSize: 'text-sm' },
    lg: { width: 56, radius: 21, stroke: 5, fontSize: 'text-base' },
  };

  // Get color based on score
  const getColor = (score: number): string => {
    if (score >= 80) return '#4D7C6F'; // Sage Green
    if (score >= 60) return '#0284C7'; // Sky Blue
    if (score >= 40) return '#D97706'; // Orange
    return '#A63D40'; // Brick Red
  };

  const config = sizeConfig[size];
  const color = getColor(score);
  const circumference = 2 * Math.PI * config.radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className={`relative rounded-full flex-shrink-0 ${className}`}
      style={{
        width: config.width,
        height: config.width,
        backgroundColor: `${color}10`,
      }}
    >
      <svg
        className="-rotate-90"
        style={{ width: config.width, height: config.width }}
      >
        {/* Background track */}
        <circle
          cx={config.width / 2}
          cy={config.width / 2}
          r={config.radius}
          fill="none"
          strokeWidth={config.stroke}
          stroke={`${color}20`}
        />
        {/* Progress arc */}
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
      {/* Score number */}
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold ${config.fontSize}`}
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
};

export default QualityScore;
