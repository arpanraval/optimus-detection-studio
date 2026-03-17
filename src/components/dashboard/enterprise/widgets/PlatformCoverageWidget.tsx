import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useAppData } from '../../../../router/AppDataContext';
import WidgetEmptyState from './WidgetEmptyState';

const PlatformCoverageWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { detections } = useAppData();

  const platformData = useMemo(() => {
    if (detections.length === 0) return null;
    const platforms: Record<string, { count: number; techniques: Set<string> }> = {};
    detections.forEach(d => {
      (d.platforms || []).forEach(p => {
        if (!platforms[p]) platforms[p] = { count: 0, techniques: new Set() };
        platforms[p].count++;
        (d.mitreAttackIds || []).forEach(id => platforms[p].techniques.add(id));
      });
    });
    const allTechniques = new Set<string>();
    detections.forEach(d => (d.mitreAttackIds || []).forEach(id => allTechniques.add(id)));
    const totalTech = Math.max(allTechniques.size, 1);
    return Object.entries(platforms).map(([name, data]) => ({
      name, count: data.count, techniques: data.techniques.size, coveragePct: Math.round((data.techniques.size / totalTech) * 100),
    })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [detections]);

  if (!platformData || platformData.length === 0) return <WidgetEmptyState message="No platform data" />;
  const maxCount = Math.max(...platformData.map(p => p.count), 1);

  return (
    <div className="p-5 h-full">
      <div className="space-y-1">
        {platformData.map((p, i) => (
          <div key={p.name} onClick={() => onNavigate('library', { platform: p.name })}
            className="flex items-center gap-3 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
            style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 40}ms forwards` }}>
            <span className="text-[11px] font-brand font-medium text-on-surface w-20 truncate flex-shrink-0">{p.name}</span>
            <div className="flex-1 h-4 bg-primary/20 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(p.count / maxCount) * 100}%` }} />
            </div>
            <span className="text-[11px] font-brand font-bold text-on-surface w-10 text-right flex-shrink-0">{p.count}</span>
            <span className="text-[10px] font-brand font-medium text-on-surface-variant w-14 text-right flex-shrink-0">{p.techniques} TTPs</span>
            <span className="text-[10px] font-brand font-bold text-on-surface w-10 text-right flex-shrink-0">{p.coveragePct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlatformCoverageWidget;
