import React from 'react';
import { badgeSizes, threatLevelColors } from '../../../lib/ui/badges';
import { ThreatLevel } from '../../../types/threatIntel';

interface ThreatLevelIndicatorProps {
  level?: ThreatLevel | string;
  size?: 'sm' | 'md';
}

export const ThreatLevelIndicator: React.FC<ThreatLevelIndicatorProps> = ({ level, size = 'md' }) => {
  const safeLevel = level && threatLevelColors[level as ThreatLevel] ? level : ThreatLevel.Informational;
  const c = threatLevelColors[safeLevel as ThreatLevel];

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[10px] gap-1.5'
    : `${badgeSizes.lg} gap-2`;
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <div className={`inline-flex items-center ${sizeClasses} ${c.bg} border ${c.border} ${c.text} rounded`}>
      <span className={`${dotSize} rounded-full ${c.dot} shadow-lg ${c.glow}`} />
      <span className="font-bold uppercase tracking-wide">{level || 'Unknown'}</span>
    </div>
  );
};
