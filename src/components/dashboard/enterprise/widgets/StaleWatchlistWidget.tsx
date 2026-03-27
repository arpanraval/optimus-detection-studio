import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';

const StaleWatchlistWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections } = useDashboardDetections();

  const stale = useMemo(() => {
    const now = Date.now();
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    const excludeStatuses = ['Deprecated', 'Archived'];
    const rangeStart = timeRange.startDate ? new Date(timeRange.startDate).getTime() : 0;
    const rangeEnd = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return detections
      .filter(d => {
        if (!d.updatedDate) return false;
        if (excludeStatuses.includes(d.status)) return false;
        const ts = new Date(d.updatedDate).getTime();
        if (ts < rangeStart || ts > rangeEnd) return false;
        return (now - ts) > NINETY_DAYS;
      })
      .map(d => ({
        id: d.id, name: d.name, status: d.status,
        daysStale: Math.floor((now - new Date(d.updatedDate).getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => b.daysStale - a.daysStale)
      .slice(0, config.maxItems ?? 5);
  }, [detections, config.maxItems, timeRange]);

  return (
    <div className="p-5 h-full">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Stale Watchlist</span>
        {stale.length > 0 && (
          <button onClick={() => onNavigate('library', { status: 'Draft,Backlog,Production' })}
            className="text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide">
            VIEW ALL STALE
          </button>
        )}
      </div>
      <div className="mt-3">
        {stale.length === 0 ? (
          <p className="text-[11px] font-brand text-on-surface-variant/30 text-center mt-4">No stale detections</p>
        ) : (
          <div className="space-y-0.5">
            {stale.map((d, i) => (
              <div key={d.id} onClick={() => onNavigate('detail', { id: d.id })}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
                style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 40}ms forwards` }}>
                <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{d.name}</span>
                <span className="text-[9px] font-brand font-bold text-primary/60 px-1.5 py-0.5 rounded bg-primary/10 flex-shrink-0">{d.status}</span>
                <span className="text-[10px] font-brand font-bold text-amber-400/70 flex-shrink-0">{d.daysStale}d</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaleWatchlistWidget;
