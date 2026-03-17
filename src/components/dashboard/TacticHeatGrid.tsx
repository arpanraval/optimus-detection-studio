import React from 'react';

interface TacticHeatGridProps {
  tactics: { id: string; name: string; shortname: string; count: number }[];
  maxCount: number;
  onTacticClick: (tacticName: string) => void;
}

export const TacticHeatGrid: React.FC<TacticHeatGridProps> = ({
  tactics,
  maxCount,
  onTacticClick,
}) => {
  // Abbreviate tactic names for compact display
  const abbreviate = (name: string): string => {
    const abbrevMap: Record<string, string> = {
      'Reconnaissance': 'RECON',
      'Resource Dev': 'RES DEV',
      'Initial Access': 'INIT ACC',
      'Execution': 'EXEC',
      'Persistence': 'PERSIST',
      'Priv Escalation': 'PRIV ESC',
      'Defense Evasion': 'DEF EVA',
      'Credential Access': 'CRED ACC',
      'Discovery': 'DISCOV',
      'Lateral Movement': 'LAT MOV',
      'Collection': 'COLLECT',
      'C2': 'C2',
      'Exfiltration': 'EXFIL',
      'Impact': 'IMPACT',
    };
    return abbrevMap[name] || name.toUpperCase().slice(0, 7);
  };

  const getIntensity = (count: number): number => {
    if (maxCount === 0 || count === 0) return 0;
    return 0.08 + (count / maxCount) * 0.25; // 0.08 to 0.33
  };

  const isHighCoverage = (count: number): boolean => {
    return maxCount > 0 && count / maxCount > 0.6;
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {tactics.map((tactic, idx) => {
        const intensity = getIntensity(tactic.count);
        const highCov = isHighCoverage(tactic.count);

        return (
          <div
            key={tactic.id}
            onClick={() => onTacticClick(tactic.name)}
            className="relative cursor-pointer rounded-lg border border-outline-variant/15 p-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:border-primary/30 group"
            style={{
              backgroundColor: intensity > 0
                ? `rgb(var(--md-sys-color-primary) / ${intensity})`
                : 'rgb(var(--md-sys-color-surface-container) / 0.5)',
              boxShadow: highCov ? '0 0 12px rgb(var(--md-sys-color-primary) / 0.15)' : 'none',
              opacity: 0,
              animation: `slideUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1.0) ${idx * 40}ms forwards`,
            }}
          >
            <span className="font-brand text-[9px] text-on-surface-variant tracking-wider text-center leading-tight">
              {abbreviate(tactic.name)}
            </span>
            <span className={`text-base font-mono font-bold ${
              tactic.count > 0 ? 'text-on-surface' : 'text-on-surface-variant/40'
            }`}>
              {tactic.count}
            </span>

            {/* Hover tooltip */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="bg-inverse-surface text-inverse-on-surface text-[10px] px-2 py-1 rounded whitespace-nowrap">
                {tactic.name}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
