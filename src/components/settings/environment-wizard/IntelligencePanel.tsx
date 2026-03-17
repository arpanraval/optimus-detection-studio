import React, { useMemo } from 'react';
import { CircularProgress } from '../../CircularProgress';
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
      <div className="lg:hidden flex items-center gap-4 p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low mb-6">
        <CircularProgress score={matchedPct} size={48} strokeWidth={4} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <AnimatedNumber value={matchedCount} className="text-lg font-semibold text-on-surface" />
            <span className="text-xs text-on-surface-variant">of {totalCount} detections</span>
          </div>
          <p className={`text-[11px] truncate ${error ? 'text-amber-400' : 'text-on-surface-variant/70'}`}>{message}</p>
        </div>
        {loading && (
          <div className="ml-auto animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full flex-shrink-0" />
        )}
      </div>
    );
  }

  // Full panel
  return (
    <div className="lg:sticky lg:top-8 lg:self-start space-y-5">
      {/* Detection Match Ring */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-6 flex flex-col items-center">
        <CircularProgress score={matchedPct} size={120} strokeWidth={6} />
        <span className="font-brand text-[10px] uppercase tracking-wider text-on-surface-variant mt-3">
          Library Coverage
        </span>
        {loading && (
          <div className="mt-2 animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
        )}
      </div>

      {/* Detection Counter */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5 text-center">
        <AnimatedNumber
          value={matchedCount}
          className="text-3xl font-semibold text-on-surface"
        />
        <div className="text-xs text-on-surface-variant mt-1">
          of {totalCount} detections matched
        </div>
      </div>

      {/* Error / Warning */}
      {error && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-start gap-2">
          <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400">{error}</p>
        </div>
      )}

      {/* Mini MITRE Heatmap */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
        <h4 className="font-brand text-[10px] uppercase tracking-wider text-on-surface-variant mb-3">
          Tactic Coverage
        </h4>
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
                      isCovered ? 'bg-primary' : 'bg-on-surface/[0.06]'
                    }`}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-on-surface-variant">
          {tacticBreakdown.length}/14 tactics covered
        </div>
      </div>

      {/* Selection Summary */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
        <h4 className="font-brand text-[10px] uppercase tracking-wider text-on-surface-variant mb-3">
          Profile Summary
        </h4>
        <div className="space-y-2">
          {summaryItems.map(item => (
            <button
              key={item.label}
              onClick={() => onJumpToStep(item.step)}
              className="w-full flex items-center justify-between text-left hover:bg-surface-container/50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
            >
              <span className="text-xs text-on-surface-variant">{item.label}</span>
              <span className={`text-xs ${item.configured ? 'text-on-surface' : 'text-on-surface-variant/40'}`}>
                {item.value}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Contextual Message */}
      {!error && (
        <div className="rounded-xl bg-primary/5 border border-primary/10 px-4 py-3">
          <p className="text-xs text-primary/80">{message}</p>
        </div>
      )}
    </div>
  );
};
