import React, { useMemo } from 'react';
import { AnimatedNumber } from '../../optimus/AnimatedNumber';
import { Icon } from '../../Icon';
import type { TacticCount } from './useFeasibilityLive';

const MITRE_TACTICS = [
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command And Control',
  'Exfiltration',
  'Impact',
  'Reconnaissance',
  'Resource Development',
] as const;

interface IntelligencePanelProps {
  matchedCount: number;
  totalCount: number;
  tacticBreakdown: TacticCount[];
  loading: boolean;
  error: string | null;
  sectors: string[];
  userCountry: string | null;
  siemCount: number;
  logSourceCount: number;
  toolCount: number;
  crownJewelCount: number;
  onJumpToStep: (step: number) => void;
  variant?: 'compact' | 'full';
}

function getContextualMessage(matchedCount: number, totalCount: number, logSourceCount: number, error: string | null): string {
  if (error) return error;
  if (logSourceCount === 0) return 'Select log sources to see which detections you can run';
  const pct = totalCount > 0 ? (matchedCount / totalCount) * 100 : 0;
  if (pct >= 70) return 'Excellent coverage! Your environment matches most detections in the library.';
  if (pct >= 30) return 'Good progress. Adding more log sources will unlock more detections.';
  return 'Getting started. Each additional log source group unlocks more detections.';
}

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({
  matchedCount,
  totalCount,
  tacticBreakdown,
  loading,
  error,
  sectors,
  userCountry,
  siemCount,
  logSourceCount,
  toolCount,
  crownJewelCount,
  onJumpToStep,
  variant = 'compact',
}) => {
  const matchedPct = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0;

  const tacticSet = useMemo(() => {
    const s = new Set<string>();
    tacticBreakdown.forEach(t => s.add(t.name.toLowerCase()));
    return s;
  }, [tacticBreakdown]);

  const message = getContextualMessage(matchedCount, totalCount, logSourceCount, error);

  const sectorSummary = sectors.length > 0
    ? `${sectors.length} sector${sectors.length > 1 ? 's' : ''}`
    : 'Not configured';

  const countrySummary = userCountry || 'Not configured';

  const summaryItems = [
    { label: 'Sectors', value: sectorSummary, step: 0, configured: sectors.length > 0 },
    { label: 'Country', value: countrySummary, step: 1, configured: !!userCountry },
    { label: 'SIEMs', value: siemCount > 0 ? `${siemCount} platform${siemCount > 1 ? 's' : ''}` : 'Not configured', step: 2, configured: siemCount > 0 },
    { label: 'Log Sources', value: logSourceCount > 0 ? `${logSourceCount} group${logSourceCount > 1 ? 's' : ''}` : 'Not configured', step: 3, configured: logSourceCount > 0 },
    { label: 'Tools', value: toolCount > 0 ? `${toolCount} tool${toolCount > 1 ? 's' : ''}` : 'Not configured', step: 4, configured: toolCount > 0 },
    { label: 'Crown Jewels', value: crownJewelCount > 0 ? `${crownJewelCount} asset${crownJewelCount > 1 ? 's' : ''}` : 'Not configured', step: 5, configured: crownJewelCount > 0 },
  ];

  if (variant === 'compact') {
    return (
      <div className="lg:hidden flex items-center gap-4 p-4 rounded-xl border border-outline-variant/40 bg-surface-container-low mb-6">
        <CoverageRing pct={matchedPct} loading={loading} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <AnimatedNumber value={matchedCount} className="text-lg font-semibold text-on-surface" />
            <span className="text-xs text-on-surface-variant">of {totalCount} detections</span>
          </div>
          <p className={`text-[11px] truncate ${error ? 'text-amber-700 dark:text-amber-400' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  // Full panel — single container with hairline-divided sections so it reads as one cohesive "output" panel
  const configuredCount = summaryItems.filter(i => i.configured).length;

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low overflow-hidden">
      {/* Panel header — mirrors the "Configure" header on the left to make input/output asymmetry obvious */}
      <header className="px-5 py-3 border-b border-outline-variant/30 bg-surface-container flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-1 h-3.5 rounded-sm bg-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface">
            Profile Insights
          </span>
        </div>
        <span className="text-[11px] text-on-surface-variant tabular-nums">
          {configuredCount}/{summaryItems.length} configured
        </span>
      </header>

      {/* Hero: Coverage gauge (modelled after dashboard ReadinessBadge) */}
      <div className="px-5 pt-6 pb-5 flex flex-col items-center">
        <CoverageGauge pct={matchedPct} loading={loading} />
        <div className="mt-4 text-center">
          <div className="flex items-baseline justify-center gap-1.5">
            <AnimatedNumber
              value={matchedCount}
              className="text-2xl font-brand font-bold text-on-surface tabular-nums"
            />
            <span className="text-sm text-on-surface-variant/70">
              / {totalCount.toLocaleString()}
            </span>
          </div>
          <div className="text-[11px] font-brand font-medium text-on-surface-variant/60 uppercase tracking-[0.18em] mt-1">
            detections matched
          </div>
        </div>
      </div>

      {/* Error / Warning */}
      {error && (
        <div className="mx-5 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-2 flex items-start gap-2">
          <Icon name="alert-triangle" className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p>
        </div>
      )}

      {/* Mini MITRE Heatmap */}
      <div className="px-5 py-4 border-t border-outline-variant/20">
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
            Tactic Coverage
          </h4>
          <span className="text-[11px] font-semibold text-on-surface tabular-nums">
            {tacticBreakdown.length}<span className="text-on-surface-variant font-normal"> / 14</span>
          </span>
        </div>
        <div className="flex gap-[3px] justify-between">
          {MITRE_TACTICS.map(tactic => {
            const isCovered = tacticSet.has(tactic.toLowerCase());
            const cellCount = isCovered ? 4 + (tactic.length % 2) : 3;
            return (
              <div key={tactic} className="flex flex-col gap-[1px]" title={tactic}>
                {Array.from({ length: cellCount }, (_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-[1px] transition-all duration-500 ease-out ${
                      isCovered ? 'bg-primary' : 'bg-outline-variant/40'
                    }`}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Profile Summary — divider rows */}
      <div className="border-t border-outline-variant/20">
        <div className="px-5 py-3 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Profile Summary
          </h4>
          <span className="text-[10px] text-on-surface-variant/70">click to edit</span>
        </div>
        <div className="divide-y divide-outline-variant/15 border-t border-outline-variant/20">
          {summaryItems.map(item => (
            <button
              key={item.label}
              onClick={() => onJumpToStep(item.step)}
              className="w-full flex items-center justify-between text-left hover:bg-surface-container/40 px-5 py-2.5 transition-colors"
            >
              <span className="text-sm text-on-surface-variant">{item.label}</span>
              <span className={`text-sm font-medium ${item.configured ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                {item.value}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Contextual Message footer */}
      {!error && (
        <div className="px-5 py-3 border-t border-outline-variant/20 bg-surface-container/40">
          <p className="text-xs text-on-surface-variant leading-relaxed">{message}</p>
        </div>
      )}
    </div>
  );
};

interface CoverageRingProps {
  pct: number;
  loading: boolean;
}

/**
 * Compact ring used only on the mobile-bar variant.
 */
const CoverageRing: React.FC<CoverageRingProps> = ({ pct, loading }) => {
  const size = 56;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90 overflow-visible">
        <circle
          className="text-outline-variant/40"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="text-primary transition-all duration-700 ease-out"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold text-on-surface tabular-nums leading-none">{pct}%</span>
      </div>
      {loading && (
        <div className="absolute -bottom-1 right-0 animate-spin w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full" />
      )}
    </div>
  );
};

/**
 * Hero gauge — mirrors the dashboard ReadinessBadge style:
 * - Inner-tinted disc behind the ring
 * - Soft track (~15% primary) + saturated filled stroke with drop-shadow glow
 * - Centred large brand-typeface number with tiny uppercase label
 */
const CoverageGauge: React.FC<CoverageRingProps> = ({ pct, loading }) => {
  const SIZE = 140;
  const STROKE = 10;
  const R = (SIZE - STROKE) / 2 - 6;
  const C = R * 2 * Math.PI;
  const filled = loading ? 0 : (pct / 100) * C;

  return (
    <div
      className="relative flex-shrink-0 rounded-full"
      style={{
        width: SIZE,
        height: SIZE,
        backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.06)',
      }}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          style={{ stroke: 'rgb(var(--md-sys-color-primary) / 0.15)' }}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          className="stroke-primary"
          strokeWidth={STROKE}
          strokeLinecap="round"
          style={{
            strokeDasharray: `${filled} ${C}`,
            transition: 'stroke-dasharray 1.4s cubic-bezier(0.05, 0.7, 0.1, 1.0)',
            filter: 'drop-shadow(0 0 8px rgb(var(--md-sys-color-primary) / 0.35))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {loading ? (
          <div className="w-12 h-7 bg-primary/10 rounded animate-pulse" />
        ) : (
          <>
            <div className="flex items-baseline">
              <AnimatedNumber
                value={pct}
                duration={1400}
                className="text-4xl font-brand font-bold text-on-surface tabular-nums leading-none"
              />
              <span className="text-base font-brand font-bold text-on-surface-variant/60 ml-0.5">%</span>
            </div>
            <span className="text-[9px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-[0.25em] mt-1.5">
              Coverage
            </span>
          </>
        )}
      </div>
    </div>
  );
};
