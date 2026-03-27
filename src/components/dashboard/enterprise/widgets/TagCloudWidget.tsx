import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { withAlpha } from '../engine/colorUtils';
import WidgetEmptyState from './WidgetEmptyState';

const TagCloudWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections: allDetections } = useDashboardDetections();
  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';

  const detections = useMemo(() => {
    if (!timeRange.startDate) return allDetections;
    const start = new Date(timeRange.startDate).getTime();
    const end = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return allDetections.filter(d => {
      const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
      return ts >= start && ts <= end;
    });
  }, [allDetections, timeRange]);

  const tags = useMemo(() => {
    const counts: Record<string, number> = {};
    detections.forEach(d => {
      (d.tags || []).forEach((t: string) => { counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.maxItems ?? 30)
      .map(([name, count]) => ({ name, count }));
  }, [detections, config.maxItems]);

  if (tags.length === 0) return <WidgetEmptyState message="No tags found" />;
  const maxCount = tags[0].count;
  const minCount = tags[tags.length - 1].count;
  const range = Math.max(maxCount - minCount, 1);

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex-1 flex flex-wrap gap-1.5 content-start overflow-y-auto">
        {tags.map(tag => {
          const weight = (tag.count - minCount) / range;
          const size = 10 + weight * 4;
          const opacity = 0.5 + weight * 0.5;
          return (
            <button
              key={tag.name}
              onClick={() => onNavigate('library', { tags: tag.name })}
              className="px-2 py-0.5 rounded-md font-brand font-medium transition-all hover:scale-105 cursor-pointer"
              style={{
                fontSize: `${size}px`,
                color: accent,
                backgroundColor: withAlpha(accent, 0.08 + weight * 0.1),
                opacity,
              }}
              title={`${tag.name}: ${tag.count}`}
            >
              {tag.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TagCloudWidget;
