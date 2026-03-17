import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useAppData } from '../../../../router/AppDataContext';
import WidgetEmptyState from './WidgetEmptyState';

const TopContributorsWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections } = useAppData();

  const contributors = useMemo(() => {
    let source = detections;
    if (timeRange.startDate) {
      const rangeStart = new Date(timeRange.startDate).getTime();
      const rangeEnd = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
      source = detections.filter(d => {
        const ts = d.createdDate;
        if (!ts) return true;
        const t = new Date(ts).getTime();
        return t >= rangeStart && t <= rangeEnd;
      });
    }
    if (source.length === 0) return [];
    const byAuthor: Record<string, number> = {};
    source.forEach(d => { if (d.author) byAuthor[d.author] = (byAuthor[d.author] || 0) + 1; });
    return Object.entries(byAuthor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.maxItems ?? 5)
      .map(([name, count], i) => ({ rank: i + 1, name, count }));
  }, [detections, config.maxItems, timeRange]);

  if (contributors.length === 0) return <WidgetEmptyState message="No contributor data" />;
  const maxCount = contributors[0]?.count || 1;

  return (
    <div className="p-5 h-full">
      <div className="space-y-1">
        {contributors.map((c, i) => (
          <div key={c.name} onClick={() => onNavigate('library', { author: c.name })}
            className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
            style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 50}ms forwards` }}>
            <span className="text-[12px] font-brand font-bold text-on-surface-variant/40 w-5 flex-shrink-0">{c.rank}</span>
            <span className="text-[12px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{c.name}</span>
            <div className="w-16 h-1.5 bg-primary/15 rounded-full overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / maxCount) * 100}%` }} />
            </div>
            <span className="text-[12px] font-brand font-bold text-on-surface w-8 text-right flex-shrink-0">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopContributorsWidget;
