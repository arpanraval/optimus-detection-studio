import React from 'react';

/** UseCaseCard's QualityScore gauge treatment, scaled to 64px for the pack summary. */
export function PackCoverageGauge({ score }: { score: number }) {
  const size = 64;
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, score));
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-[#783264]/10"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value}% of ATT&CK tactics mapped`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={6}
          className="stroke-[#783264]/20 dark:stroke-[#783264]/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={6}
          stroke="#783264"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className="absolute text-sm font-bold text-[#783264] dark:text-on-surface">{value}</span>
    </div>
  );
}
