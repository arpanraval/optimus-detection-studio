// src/components/cost-center/charts/ArtifactTile.tsx
// Compact "what we produced" tile used in the AI Value row.
// Shows a big animated count, the bucket label, and a small cost-per-unit
// efficiency footer.

import React from 'react';
import { Icon } from '../../Icon';
import { useCountUp } from '../../../hooks/useCountUp';
import { withAlpha } from '../../dashboard/enterprise/engine/colorUtils';

interface Props {
  label: string;
  icon: string;
  accent: string;
  count: number;
  costUsd: number;
  /** Optional override for the per-unit caption (defaults to "$X.XX each"). */
  costCaption?: string;
  /** Optional supplementary detail line (e.g. minutes saved). */
  detail?: string;
  /** Stagger index for entrance delay (0..n). */
  index?: number;
}

export const ArtifactTile: React.FC<Props> = ({
  label,
  icon,
  accent,
  count,
  costUsd,
  costCaption,
  detail,
  index = 0,
}) => {
  const animCount = useCountUp(count);
  const perUnit = count > 0 ? costUsd / count : 0;
  const isEmpty = count === 0;

  return (
    <div
      className="
        group relative overflow-hidden rounded-2xl
        bg-surface-container-lowest border border-outline-variant/10
        p-4
        transition-all duration-300 ease-emphasized
        hover:-translate-y-0.5 hover:border-outline-variant/25 hover:shadow-lg hover:shadow-black/5
        animate-slide-up
      "
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
    >
      {/* Accent rail on the left */}
      <div
        aria-hidden
        className="absolute inset-y-3 left-0 w-0.5 rounded-full"
        style={{ backgroundColor: withAlpha(accent, isEmpty ? 0.15 : 0.85) }}
      />

      <div className="flex items-center gap-2 ml-1">
        <span
          className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
          style={{ backgroundColor: withAlpha(accent, 0.12) }}
        >
          <Icon name={icon} className="w-3.5 h-3.5" style={{ color: accent }} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 truncate">
          {label}
        </span>
      </div>

      <div className="mt-3 ml-1">
        <span
          className={`block text-3xl font-brand font-bold tabular-nums leading-none ${
            isEmpty ? 'text-on-surface-variant/30' : 'text-on-surface'
          }`}
        >
          {Math.round(animCount).toLocaleString()}
        </span>
        <div className="mt-2 flex items-baseline gap-1.5 text-[10px] text-on-surface-variant/60">
          <span>{costCaption ?? `$${perUnit.toFixed(perUnit < 0.01 ? 4 : 2)} each`}</span>
          {detail && (
            <>
              <span className="text-on-surface-variant/20">·</span>
              <span>{detail}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
