import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const SEVERITY_CONFIG = [
  { key: 'Critical', label: 'Critical', color: 'rgb(220, 38, 38)' },
  { key: 'High', label: 'High', color: 'rgb(234, 88, 12)' },
  { key: 'Medium', label: 'Medium', color: 'rgb(202, 138, 4)' },
  { key: 'Low', label: 'Low', color: 'rgb(34, 197, 94)' },
  { key: 'Informational', label: 'Info', color: 'rgb(100, 116, 139)' },
];

const SeverityWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { detections } = useDashboardDetections();

  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    detections.forEach(d => { if (d.severity) counts[d.severity] = (counts[d.severity] || 0) + 1; });
    return counts;
  }, [detections]);

  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return <WidgetEmptyState message="No severity data" />;

  return (
    <div className="p-4 h-full">
      <div className="space-y-0.5">
        {SEVERITY_CONFIG.map(({ key, label, color }) => {
          const count = data[key] || 0;
          if (count === 0) return null;
          return (
            <div key={key} onClick={() => onNavigate('library', { severity: key })}
              className="flex items-center gap-2 py-1 px-1.5 rounded-md cursor-pointer hover:bg-surface-container-low/50 transition-colors">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[11px] font-brand font-medium text-on-surface flex-1">{label}</span>
              <div className="w-20 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: `${color}30` }}>
                <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, backgroundColor: `${color}B3` }} />
              </div>
              <span className="text-[11px] font-brand font-bold w-8 text-right flex-shrink-0" style={{ color }}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SeverityWidget;
