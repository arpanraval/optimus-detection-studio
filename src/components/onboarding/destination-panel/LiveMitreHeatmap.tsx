import React, { useMemo } from 'react';
import type { OnboardingPhase } from '../types';

interface LiveMitreHeatmapProps {
  tactics: Set<string>;
  techniques: Set<string>;
  phase: OnboardingPhase;
}

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
  'Command and Control',
  'Exfiltration',
  'Impact',
  'Reconnaissance',
  'Resource Development',
] as const;

/**
 * Determine how many cells (representing technique density) to show per tactic.
 * Covered tactics get 4-5 cells, uncovered get 3.
 */
function cellCountForTactic(tacticName: string, isCovered: boolean): number {
  // Simple deterministic variation based on name length
  const base = isCovered ? 4 : 3;
  return base + (tacticName.length % 2); // 3-4 or 4-5
}

export const LiveMitreHeatmap: React.FC<LiveMitreHeatmapProps> = ({
  tactics,
  techniques,
  phase,
}) => {
  const tacticLower = useMemo(() => {
    const s = new Set<string>();
    tactics.forEach((t) => s.add(t.toLowerCase()));
    return s;
  }, [tactics]);

  const coveredCount = useMemo(() => {
    return MITRE_TACTICS.filter((t) => tacticLower.has(t.toLowerCase())).length;
  }, [tacticLower]);

  return (
    <div className="rounded-xl p-3 bg-surface-container-lowest border border-outline-variant/20">
      {/* Columns */}
      <div className="flex gap-[3px] justify-between">
        {MITRE_TACTICS.map((tactic) => {
          const isCovered = tacticLower.has(tactic.toLowerCase());
          const cellCount = cellCountForTactic(tactic, isCovered);

          return (
            <div
              key={tactic}
              className="flex flex-col gap-[1px]"
              title={tactic}
            >
              {Array.from({ length: cellCount }, (_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-[1px] transition-all duration-500 ease-out ${
                    isCovered
                      ? 'bg-primary'
                      : 'bg-on-surface/[0.06]'
                  }`}
                  style={{
                    opacity: isCovered ? 1 : undefined,
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2 text-[11px] text-on-surface-variant">
        {coveredCount}/14 tactics &middot; {techniques.size} techniques
      </div>
    </div>
  );
};
