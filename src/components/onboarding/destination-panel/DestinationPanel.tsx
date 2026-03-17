import React, { useMemo } from 'react';
import { useOnboarding } from '../OnboardingContext';
import { OFFICIAL_SOURCES } from '../types';
import { HeroCounter } from './HeroCounter';
import { PlatformFanOut } from './PlatformFanOut';
import { LiveMitreHeatmap } from './LiveMitreHeatmap';
import { SeverityQualityCard } from './SeverityQualityCard';
import { SourceBreakdownBar } from './SourceBreakdownBar';

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-brand text-[11px] tracking-widest uppercase text-on-surface-variant">
    {children}
  </span>
);

export const DestinationPanel: React.FC = () => {
  const { phase, sources, liveStats } = useOnboarding();

  // Compute total expected from selected sources
  const totalExpected = useMemo(() => {
    return sources
      .filter((s) => s.selected)
      .reduce((sum, s) => sum + s.source.estimatedRules, 0);
  }, [sources]);

  // Build source color map keyed by vendor format (matches liveStats.bySource keys)
  const sourceColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const src of OFFICIAL_SOURCES) {
      // bySource keys are sourceFormat values like 'sigma', 'splunk_escu', etc.
      if (!map[src.vendor]) {
        map[src.vendor] = src.color;
      }
    }
    return map;
  }, []);

  return (
    <div className="overflow-y-auto scrollbar-minimal p-4 flex flex-col gap-3 h-full">
      {/* Hero counter */}
      <HeroCounter
        value={liveStats.totalImported}
        phase={phase}
        totalExpected={totalExpected}
      />

      {/* Destinations section */}
      <SectionLabel>Destinations</SectionLabel>
      <PlatformFanOut platforms={liveStats.byPlatform} phase={phase} />

      {/* Live Analytics section */}
      <SectionLabel>Live Analytics</SectionLabel>
      <LiveMitreHeatmap
        tactics={liveStats.mitreTactics}
        techniques={liveStats.mitreTechniques}
        phase={phase}
      />
      <SeverityQualityCard
        bySeverity={liveStats.bySeverity}
        avgQualityScore={liveStats.avgQualityScore}
        phase={phase}
      />
      <SourceBreakdownBar
        bySource={liveStats.bySource}
        sourceColors={sourceColors}
      />
    </div>
  );
};
