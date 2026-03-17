import React from 'react';

interface TacticCoverageHeatmapProps {
  tacticBreakdown: Array<{ name: string; count: number }>;
  totalMatchedDetections: number;
  loading: boolean;
}

// MITRE ATT&CK kill chain order (left to right)
const TACTICS = [
  { name: 'Reconnaissance', abbr: 'Recon' },
  { name: 'Resource Development', abbr: 'Res Dev' },
  { name: 'Initial Access', abbr: 'Init Acc' },
  { name: 'Execution', abbr: 'Exec' },
  { name: 'Persistence', abbr: 'Persist' },
  { name: 'Privilege Escalation', abbr: 'Priv Esc' },
  { name: 'Defense Evasion', abbr: 'Def Eva' },
  { name: 'Credential Access', abbr: 'Cred Acc' },
  { name: 'Discovery', abbr: 'Discov' },
  { name: 'Lateral Movement', abbr: 'Lat Mov' },
  { name: 'Collection', abbr: 'Collect' },
  { name: 'Command And Control', abbr: 'C2' },
  { name: 'Exfiltration', abbr: 'Exfil' },
  { name: 'Impact', abbr: 'Impact' },
] as const;

const getCount = (name: string, breakdown: Array<{ name: string; count: number }>): number => {
  const norm = name.toLowerCase();
  return breakdown.find(t => t.name.toLowerCase() === norm)?.count ?? 0;
};

export const TacticCoverageHeatmap: React.FC<TacticCoverageHeatmapProps> = ({
  tacticBreakdown,
  totalMatchedDetections,
  loading,
}) => {
  if (loading) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <div className="h-3 w-36 bg-surface-container rounded animate-pulse mb-5" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="aspect-square bg-surface-container/50 rounded-lg animate-pulse" style={{ opacity: 1 - (i % 7) * 0.08 }} />
          ))}
        </div>
      </div>
    );
  }

  const counts = TACTICS.map(t => ({ ...t, count: getCount(t.name, tacticBreakdown) }));
  const maxCount = Math.max(...counts.map(t => t.count), 1);

  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
          MITRE ATT&CK Coverage
        </h3>
        <span className="text-[11px] text-on-surface-variant">
          <span className="font-mono font-bold text-on-surface">{totalMatchedDetections.toLocaleString()}</span> detections
        </span>
      </div>

      {/* Heatmap grid — 7 columns × 2 rows, MITRE kill chain order */}
      <div className="grid grid-cols-7 gap-1.5">
        {counts.map(tactic => {
          const hasData = tactic.count > 0;
          const ratio = tactic.count / maxCount;
          // Multi-stop gradient: low coverage = dim teal, high coverage = bright teal
          const alpha = hasData ? 0.1 + ratio * 0.4 : 0;
          const textColor = hasData
            ? ratio > 0.5 ? 'text-on-surface' : 'text-ext-teal'
            : 'text-outline-variant';

          return (
            <div
              key={tactic.name}
              className="rounded-lg p-2 flex flex-col justify-between aspect-square relative transition-all hover:scale-[1.03]"
              style={{
                backgroundColor: hasData
                  ? `rgb(var(--md-ext-color-teal) / ${alpha})`
                  : 'rgb(var(--md-sys-color-surface-container) / 0.4)',
              }}
              title={`${tactic.name}: ${tactic.count} detections`}
            >
              <span className={`text-[8px] font-bold leading-tight tracking-wide uppercase ${
                hasData ? 'text-ext-teal' : 'text-outline-variant'
              }`}>
                {tactic.abbr}
              </span>
              <span className={`text-base font-brand font-bold leading-none ${textColor}`}>
                {hasData ? tactic.count.toLocaleString() : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Color scale legend */}
      <div className="flex items-center justify-end gap-2 mt-3">
        <span className="text-[9px] text-outline">Low</span>
        <div className="flex gap-0.5">
          {[0.1, 0.2, 0.3, 0.4, 0.5].map((a) => (
            <div
              key={a}
              className="w-4 h-2 rounded-sm"
              style={{ backgroundColor: `rgb(var(--md-ext-color-teal) / ${a})` }}
            />
          ))}
        </div>
        <span className="text-[9px] text-outline">High</span>
      </div>
    </div>
  );
};
