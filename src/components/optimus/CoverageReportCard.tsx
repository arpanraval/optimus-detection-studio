/**
 * Coverage Report Card
 * Donut hero + tier breakdown tiles. Pure data UI; prose lives outside.
 */

import React, { useState, useEffect } from 'react';
import { OptimusAction, CoverageReportData, TierData, TechniqueGap } from '../../types/optimus';

interface Props {
  summary: string;
  data: CoverageReportData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

const AnimatedValue: React.FC<{ value: number; delay?: number }> = ({ value, delay = 0 }) => {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 700;
      const steps = 30;
      const increment = value / steps;
      let current = 0;

      const interval = setInterval(() => {
        current += increment;
        if (current >= value) {
          setDisplayed(value);
          clearInterval(interval);
        } else {
          setDisplayed(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return <span>{displayed}</span>;
};

interface DonutProps {
  productionPct: number;
  developmentPct: number;
  size?: number;
  mounted: boolean;
}

const CoverageDonut: React.FC<DonutProps> = ({ productionPct, developmentPct, size = 168, mounted }) => {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const prodLen = (productionPct / 100) * circ;
  const devLen = (developmentPct / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-container-high"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${mounted ? prodLen + devLen : 0} ${circ}`}
          className="stroke-secondary transition-[stroke-dasharray] duration-1000 ease-out delay-150"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${mounted ? prodLen : 0} ${circ}`}
          className="stroke-primary transition-[stroke-dasharray] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] leading-none font-bold text-on-surface tabular-nums tracking-tight">
          <AnimatedValue value={productionPct} delay={150} />%
        </span>
        <span className="text-[9px] font-semibold text-on-surface-variant/70 uppercase tracking-[0.18em] mt-1.5">
          Protected
        </span>
      </div>
    </div>
  );
};

interface TierTileProps {
  variant: 'production' | 'library' | 'gaps';
  label: string;
  sub: string;
  count: number;
  total: number;
  percent: number;
}

const TierTile: React.FC<TierTileProps> = ({ variant, label, sub, count, total, percent }) => {
  const cfg = {
    production: { bar: 'bg-primary', accent: 'text-primary' },
    library: { bar: 'bg-secondary', accent: 'text-secondary' },
    gaps: { bar: 'bg-error', accent: 'text-error' },
  }[variant];

  return (
    <div className="flex items-stretch gap-3.5">
      <div className={`w-[3px] rounded-full ${cfg.bar} shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-semibold text-on-surface leading-tight">{label}</p>
          <span className={`text-[15px] font-bold tabular-nums ${cfg.accent}`}>
            {percent}%
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[11px] font-mono text-on-surface-variant tabular-nums">
            <span className="font-semibold text-on-surface">{count}</span>
            <span className="text-on-surface-variant/40"> of {total}</span>
          </span>
          <span className="text-[11px] text-on-surface-variant/60 truncate">· {sub}</span>
        </div>
      </div>
    </div>
  );
};

export const CoverageReportCard: React.FC<Props> = ({ data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const production = data.production || {
    count: data.overall?.covered || 0,
    percent: data.overall?.percent || 0,
    techniques: data.topCovered?.map(t => ({ id: t.id, name: t.name, detectionCount: t.detectionCount })) || []
  };

  const development = data.development || data.inLibrary || {
    count: 0,
    percent: 0,
    techniques: []
  };

  const gaps = data.gaps || {
    count: (data.overall?.total || 0) - (data.overall?.covered || 0),
    percent: 100 - (data.overall?.percent || 0),
    techniques: data.criticalGaps?.map((g: TechniqueGap) => ({
      id: g.id,
      name: g.name,
      priority: g.priority
    })) || []
  };

  const total = data.total || data.overall?.total || 0;
  const techniquesWithDetection = production.count + development.count;

  return (
    <div className={`
      bg-surface-container-highest rounded-2xl border border-outline-variant/40
      shadow-md shadow-black/[0.04] overflow-hidden
      transition-all duration-500 ease-emphasized
      ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
    `}>
      {/* Header strip */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-4 border-b border-outline-variant/15">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-on-surface-variant/70 uppercase tracking-[0.14em]">
            {data.title || 'Overall Detection Coverage'}
          </p>
          <p className="text-xs text-on-surface-variant/70 mt-1 tabular-nums">
            {techniquesWithDetection} of {total} techniques have a detection
          </p>
        </div>
        <span className="text-[10px] font-mono text-on-surface-variant/50 px-2 py-1 rounded bg-surface-container border border-outline-variant/30 shrink-0">
          MITRE ATT&CK
        </span>
      </div>

      {/* Hero: donut + tier tiles */}
      <div className="px-6 py-7">
        <div className="flex items-center gap-8 flex-wrap sm:flex-nowrap">
          <div className="shrink-0 mx-auto sm:mx-0">
            <CoverageDonut
              productionPct={production.percent}
              developmentPct={development.percent}
              mounted={mounted}
            />
          </div>

          <div className="flex-1 min-w-[240px] space-y-5">
            <TierTile
              variant="production"
              label="Production Coverage"
              sub="actively deployed"
              count={production.count}
              total={total}
              percent={production.percent}
            />
            <TierTile
              variant="library"
              label="Development Coverage"
              sub={development.count > 0 ? 'promotable to production' : 'no dev-tier detections'}
              count={development.count}
              total={total}
              percent={development.percent}
            />
            <TierTile
              variant="gaps"
              label="Coverage Gaps"
              sub="no detection at any tier"
              count={gaps.count}
              total={total}
              percent={gaps.percent}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-6 py-4 border-t border-outline-variant/20 bg-surface-container/40">
          <div className="flex flex-wrap gap-2.5">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => onAction(action)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
                  ${i === 0
                    ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm'
                    : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high border border-outline-variant/50'
                  }
                `}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CoverageReportCard;
