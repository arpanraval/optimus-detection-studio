import React, { useEffect, useState } from 'react';
import { getImpactLabel, getImpactBgClass } from '../../hooks/useImpactScores';

interface ImpactScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * Displays an impact score with color coding based on severity
 * 90-100: Critical (green/tertiary)
 * 75-89: High (blue/primary)
 * 50-74: Medium (amber/warning)
 * 25-49: Low (orange)
 * 0-24: Minimal (red/error)
 */
export function ImpactScoreBadge({ 
  score, 
  size = 'md', 
  showLabel = true,
  animate = true,
  className = ''
}: ImpactScoreBadgeProps) {
  const [displayScore, setDisplayScore] = useState(animate ? 0 : score);
  const label = getImpactLabel(score);
  
  // Animate score counting up
  useEffect(() => {
    if (!animate) {
      setDisplayScore(score);
      return;
    }
    
    const duration = 800;
    const steps = 30;
    const increment = score / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setDisplayScore(score);
        clearInterval(timer);
      } else {
        setDisplayScore(Math.round(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [score, animate]);

  // Size classes
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-20 h-20 text-lg'
  };
  
  const labelSizeClasses = {
    sm: 'text-[8px]',
    md: 'text-[10px]',
    lg: 'text-xs'
  };

  // Color classes based on score
  const getColorClasses = () => {
    if (score >= 90) return 'bg-tertiary/20 text-tertiary border-tertiary/30';
    if (score >= 75) return 'bg-primary/20 text-primary border-primary/30';
    if (score >= 50) return 'bg-warning/20 text-warning border-warning/30';
    if (score >= 25) return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
    return 'bg-error/20 text-error border-error/30';
  };

  return (
    <div 
      className={`
        ${sizeClasses[size]} 
        ${getColorClasses()}
        flex flex-col items-center justify-center 
        rounded-lg border font-semibold
        ${className}
      `}
    >
      <span className="font-bold">{Math.round(displayScore)}</span>
      {showLabel && size !== 'sm' && (
        <span className={`${labelSizeClasses[size]} uppercase tracking-wide opacity-80`}>
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Inline pill version of the impact score
 */
export function ImpactScorePill({ score, className = '' }: { score: number; className?: string }) {
  const getColorClasses = () => {
    if (score >= 90) return 'bg-tertiary/20 text-tertiary';
    if (score >= 75) return 'bg-primary/20 text-primary';
    if (score >= 50) return 'bg-warning/20 text-warning';
    if (score >= 25) return 'bg-orange-500/20 text-orange-500';
    return 'bg-error/20 text-error';
  };

  return (
    <span className={`
      inline-flex items-center justify-center
      px-2 py-0.5 rounded-full text-xs font-semibold
      ${getColorClasses()}
      ${className}
    `}>
      {Math.round(score)}
    </span>
  );
}

/**
 * Progress bar showing impact score
 */
export function ImpactScoreBar({ 
  score, 
  showValue = true,
  height = 'md',
  animate = true,
  className = '' 
}: { 
  score: number; 
  showValue?: boolean;
  height?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}) {
  const [width, setWidth] = useState(animate ? 0 : score);
  
  useEffect(() => {
    if (!animate) {
      setWidth(score);
      return;
    }
    
    const timer = setTimeout(() => setWidth(score), 100);
    return () => clearTimeout(timer);
  }, [score, animate]);

  const heightClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  const getBarColor = () => {
    if (score >= 90) return 'bg-tertiary';
    if (score >= 75) return 'bg-primary';
    if (score >= 50) return 'bg-warning';
    if (score >= 25) return 'bg-orange-500';
    return 'bg-error';
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 bg-surface-alt rounded-full overflow-hidden ${heightClasses[height]}`}>
        <div 
          className={`${heightClasses[height]} ${getBarColor()} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${width}%` }}
        />
      </div>
      {showValue && (
        <span className="text-xs text-text-secondary font-medium w-8 text-right">
          {Math.round(score)}
        </span>
      )}
    </div>
  );
}

export default ImpactScoreBadge;
