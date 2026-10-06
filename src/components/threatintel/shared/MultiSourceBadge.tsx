import React from 'react';

// Tier 1 (1 source): neutral. Tier 2 (2 sources): soft emerald. Tier 3+ (3+): stronger emerald with shadow.
// Used on TTP cards, IoC rows, and any surface representing "how many vendors
// reported this item." Keep the visual language consistent everywhere.
export function corroborationCardClasses(count: number): string {
  if (count >= 3) return 'bg-emerald-500/[0.08] border-emerald-500/30 shadow-[0_0_8px_rgba(77,124,111,0.08)]';
  if (count >= 2) return 'bg-emerald-500/[0.04] border-emerald-500/20';
  return 'bg-surface-container/50 border-outline-variant/10';
}

interface MultiSourceBadgeProps {
  count: number;
}

export const MultiSourceBadge: React.FC<MultiSourceBadgeProps> = ({ count }) => {
  if (count < 2) return null;
  const strong = count >= 3;
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${
        strong
          ? 'bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-500/50'
          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      }`}
      title={`Corroborated by ${count} vendors`}
    >
      {count}
    </span>
  );
};
