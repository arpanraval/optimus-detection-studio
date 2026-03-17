import React, { useMemo } from 'react';
import { Icon } from '../../Icon';
import type { TechniqueWithGroups } from '../types';

interface Props {
  techniques: TechniqueWithGroups[];
}

const TACTIC_ORDER = [
  'Reconnaissance',
  'Resource Development',
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
];

interface CellStyle {
  label: string;
  bg: string;
}

const COVERAGE_LEVELS: { min: number; style: CellStyle }[] = [
  { min: 5, style: { label: '5+', bg: 'bg-[#004D40] text-[#E0F2F1]' } },
  { min: 3, style: { label: '3-4', bg: 'bg-[#1B5E20] text-[#E8F5E9]' } },
  { min: 1, style: { label: '1-2', bg: 'bg-[#006064] text-[#E0F7FA]' } },
  { min: 0, style: { label: '0 (gap)', bg: 'bg-red-500/15 text-red-400' } },
];

function cellStyle(detectionCount: number): string {
  const level = COVERAGE_LEVELS.find((l) => detectionCount >= l.min);
  return level?.style.bg ?? COVERAGE_LEVELS[COVERAGE_LEVELS.length - 1].style.bg;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

interface TacticColumn {
  tactic: string;
  techniques: TechniqueWithGroups[];
  coveredCount: number;
}

export const MitreHeatmapSection: React.FC<Props> = ({ techniques }) => {
  const columns = useMemo<TacticColumn[]>(() => {
    const byTactic = new Map<string, TechniqueWithGroups[]>();

    for (const tech of techniques) {
      for (const tactic of tech.tactics) {
        const list = byTactic.get(tactic) ?? [];
        list.push(tech);
        byTactic.set(tactic, list);
      }
    }

    return TACTIC_ORDER.map((tactic) => {
      const techs = byTactic.get(tactic) ?? [];
      const coveredCount = techs.filter((t) => t.detectionCount > 0).length;
      return { tactic, techniques: techs, coveredCount };
    }).filter((col) => col.techniques.length > 0);
  }, [techniques]);

  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon name="crosshairs" className="w-5 h-5 text-on-surface-variant" />
          <h2 className="text-lg font-semibold text-on-surface">MITRE ATT&CK Heat Map</h2>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {COVERAGE_LEVELS.map((level) => (
            <div key={level.style.label} className="flex items-center gap-1.5">
              <div className={`w-4 h-3 rounded-sm ${level.style.bg}`} />
              <span className="text-xs text-on-surface-variant/60">{level.style.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto -mx-6 px-6">
        <div className="flex gap-1.5" style={{ minWidth: columns.length * 140 }}>
          {columns.map((col) => (
            <div key={col.tactic} className="flex flex-col gap-1" style={{ minWidth: 130, flex: '1 1 0' }}>
              {/* Tactic Header */}
              <div className="pb-2 border-b border-outline-variant/10 mb-1">
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant truncate"
                  title={col.tactic}
                >
                  {col.tactic}
                </p>
                <p className="text-[10px] text-on-surface-variant/60 mt-0.5">
                  {col.coveredCount}/{col.techniques.length}
                </p>
              </div>

              {/* Technique Cells */}
              {col.techniques.map((tech) => (
                <div
                  key={`${col.tactic}-${tech.mitreId}`}
                  className={`rounded px-2 py-1.5 ${cellStyle(tech.detectionCount)} cursor-default`}
                  title={`${tech.mitreId} ${tech.name} \u2014 ${tech.detectionCount} detection${tech.detectionCount !== 1 ? 's' : ''}`}
                >
                  <p className="text-[10px] font-mono font-medium leading-tight">{tech.mitreId}</p>
                  <p className="text-[10px] leading-tight mt-0.5">{truncate(tech.name, 20)}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
