import React, { useEffect, useRef, useState } from 'react';
import type { OnboardingPhase } from '../types';

interface SeverityQualityCardProps {
  bySeverity: Record<string, number>;
  avgQualityScore: number;
  phase: OnboardingPhase;
}

const SEVERITY_ROWS: { key: string; label: string; color: string }[] = [
  { key: 'critical', label: 'Critical', color: '#ef4444' },
  { key: 'high', label: 'High', color: '#f97316' },
  { key: 'medium', label: 'Medium', color: '#eab308' },
  { key: 'low', label: 'Low', color: '#3b82f6' },
  { key: 'info', label: 'Info', color: '#6b7280' },
];

/** Animated counter that eases toward target */
function useAnimatedNumber(target: number): number {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef<number>(undefined);

  useEffect(() => {
    const start = prevRef.current;
    const end = target;
    if (start === end) return;

    const duration = 500;
    const t0 = performance.now();

    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = end;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return display;
}

/** Quality gauge SVG */
const QualityGauge: React.FC<{ score: number }> = ({ score }) => {
  const size = 56;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  let colorClass = 'text-red-500';
  if (score >= 80) colorClass = 'text-emerald-500';
  else if (score >= 60) colorClass = 'text-blue-500';
  else if (score >= 40) colorClass = 'text-yellow-500';
  else if (score >= 20) colorClass = 'text-orange-500';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg className="transform -rotate-90 w-full h-full overflow-visible">
          {/* Track */}
          <circle
            className="text-surface-variant opacity-20"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          {/* Progress */}
          <circle
            className={`${colorClass} transition-all duration-1000 ease-out`}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <div className="absolute flex items-center justify-center">
          <span className={`font-brand text-sm font-bold ${colorClass}`}>
            {Math.round(score)}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-on-surface-variant">Avg Quality</span>
    </div>
  );
};

/** Single severity row — extracted so useAnimatedNumber is called at component top level */
const SeverityRow: React.FC<{ label: string; color: string; count: number }> = ({
  label,
  color,
  count,
}) => {
  const animatedCount = useAnimatedNumber(count);

  return (
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-on-surface-variant flex-1">
        {label}
      </span>
      <span className="font-brand text-[13px] font-bold text-on-surface tabular-nums">
        {Intl.NumberFormat('en-US').format(animatedCount)}
      </span>
    </div>
  );
};

export const SeverityQualityCard: React.FC<SeverityQualityCardProps> = ({
  bySeverity,
  avgQualityScore,
  phase,
}) => {
  return (
    <div className="rounded-xl p-3 bg-surface-container-lowest border border-outline-variant/20 flex gap-4">
      {/* Left: Severity distribution */}
      <div className="flex-1 flex flex-col gap-1.5 justify-center">
        {SEVERITY_ROWS.map(({ key, label, color }) => (
          <SeverityRow
            key={key}
            label={label}
            color={color}
            count={bySeverity[key] ?? 0}
          />
        ))}
      </div>

      {/* Right: Quality gauge */}
      <div className="flex items-center justify-center px-1">
        <QualityGauge score={avgQualityScore} />
      </div>
    </div>
  );
};
