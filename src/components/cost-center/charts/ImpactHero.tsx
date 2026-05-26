// src/components/cost-center/charts/ImpactHero.tsx
// Headline value strip for the AI Cost Center.
// Renders the cost → time-saved → ROI multiple narrative as one composed
// card so admins see "what we got" alongside "what we spent" at a glance.

import React from 'react';
import { Icon } from '../../Icon';
import { useCountUp } from '../../../hooks/useCountUp';
import { hoursSavedToUsd, DEFAULT_ENGINEER_HOURLY_USD } from '../../../lib/ai/featureImpact';

interface Props {
  costUsd: number;
  totalCalls: number;
  successfulCalls: number;
  minutesSaved: number;
  windowLabel: string;          // e.g. "Last 30 days"
  /** Override the blended hourly engineer cost used for ROI. */
  hourlyUsd?: number;
}

export const ImpactHero: React.FC<Props> = ({
  costUsd,
  totalCalls,
  successfulCalls,
  minutesSaved,
  windowLabel,
  hourlyUsd = DEFAULT_ENGINEER_HOURLY_USD,
}) => {
  const hoursSaved = minutesSaved / 60;
  const valueUsd = hoursSavedToUsd(hoursSaved, hourlyUsd);
  const roiMultiple = costUsd > 0 ? valueUsd / costUsd : 0;
  const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 1;

  const animCost = useCountUp(costUsd);
  const animHours = useCountUp(hoursSaved);
  const animValue = useCountUp(valueUsd);
  const animRoi = useCountUp(roiMultiple);

  return (
    <div
      className="
        relative overflow-hidden rounded-3xl
        bg-gradient-to-br from-primary-container/30 via-surface-container-lowest to-tertiary-container/20
        border border-outline-variant/10
        px-6 py-5
        animate-slide-up
      "
    >
      {/* Decorative mesh: cheap, no animation (subtle motion budget) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgb(var(--md-sys-color-primary)) 0, transparent 40%), ' +
            'radial-gradient(circle at 80% 80%, rgb(var(--md-sys-color-tertiary)) 0, transparent 40%)',
        }}
      />

      <div className="relative flex items-start gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/60">
          AI Value · {windowLabel}
        </span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">
          <Icon name="info" className="w-3 h-3" />
          @ ${hourlyUsd}/hr blended
        </span>
      </div>

      <div className="relative mt-3 grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
        <Pillar
          label="Spent"
          value={`$${animCost.toFixed(2)}`}
          sub={`${totalCalls.toLocaleString()} calls · ${Math.round(successRate * 100)}% success`}
          tone="muted"
        />
        <Arrow />
        <Pillar
          label="Time saved"
          value={`~${formatHours(animHours)}`}
          sub={`from ${successfulCalls.toLocaleString()} successful calls`}
          tone="hero"
        />
        <Pillar
          label="Estimated value"
          value={`$${formatThousands(animValue)}`}
          sub={roiMultiple > 0 ? `${animRoi.toFixed(roiMultiple >= 10 ? 0 : 1)}× return on AI spend` : 'No spend in window'}
          tone="accent"
        />
      </div>
    </div>
  );
};

// ---- internals ----

interface PillarProps {
  label: string;
  value: string;
  sub: string;
  tone: 'muted' | 'hero' | 'accent';
}

const Pillar: React.FC<PillarProps> = ({ label, value, sub, tone }) => {
  const valueColor =
    tone === 'hero'   ? 'text-on-surface'
  : tone === 'accent' ? 'text-primary'
  :                     'text-on-surface-variant';
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/50">
        {label}
      </span>
      <span className={`mt-1 text-3xl md:text-4xl font-brand font-bold tabular-nums leading-none ${valueColor}`}>
        {value}
      </span>
      <span className="mt-2 text-[11px] text-on-surface-variant/70">{sub}</span>
    </div>
  );
};

const Arrow: React.FC = () => (
  // Visually breaks the columns in 3 logical halves on md+ while keeping
  // a 4-column grid for alignment. Hidden on mobile.
  <div className="hidden md:flex items-center justify-center -mt-1">
    <Icon name="chevron-right" className="w-5 h-5 text-on-surface-variant/30" />
  </div>
);

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 100) return `${h.toFixed(1)} h`;
  return `${Math.round(h).toLocaleString()} h`;
}

function formatThousands(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}
