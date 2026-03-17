import React, { useMemo } from 'react';

interface SourceBreakdownBarProps {
  bySource: Record<string, number>;
  sourceColors: Record<string, string>; // sourceId -> hex color
}

interface Segment {
  sourceId: string;
  count: number;
  percent: number;
  color: string;
}

export const SourceBreakdownBar: React.FC<SourceBreakdownBarProps> = ({
  bySource,
  sourceColors,
}) => {
  const segments: Segment[] = useMemo(() => {
    const total = Object.values(bySource).reduce((s, v) => s + v, 0);
    if (total === 0) return [];

    return Object.entries(bySource)
      .filter(([, count]) => count > 0)
      .map(([sourceId, count]) => ({
        sourceId,
        count,
        percent: (count / total) * 100,
        color: sourceColors[sourceId] ?? '#6b7280',
      }))
      .sort((a, b) => b.count - a.count);
  }, [bySource, sourceColors]);

  if (segments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Stacked bar */}
      <div className="h-2.5 rounded-full overflow-hidden flex bg-surface-container-low">
        {segments.map((seg) => (
          <div
            key={seg.sourceId}
            className="transition-all duration-500 ease-out first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${seg.percent}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg) => (
          <span key={seg.sourceId} className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-[10px] text-on-surface-variant">
              {seg.sourceId}
            </span>
            <span className="text-[10px] text-on-surface-variant/60">
              {Math.round(seg.percent)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};
