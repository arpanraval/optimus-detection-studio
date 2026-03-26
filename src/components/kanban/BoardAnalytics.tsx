import React, { useMemo } from 'react';
import { Detection, Status } from '../../types';
import { Icon } from '../Icon';

interface BoardAnalyticsProps {
  grouped: Record<string, Detection[]>;
  columns: Status[];
  onClose: () => void;
}

const STALE_7_DAYS = 7 * 24 * 60 * 60 * 1000;
const STALE_14_DAYS = 14 * 24 * 60 * 60 * 1000;

export const BoardAnalytics: React.FC<BoardAnalyticsProps> = ({ grouped, columns, onClose }) => {
  const stats = useMemo(() => {
    const allDetections = columns.flatMap(s => grouped[s] || []);
    const now = Date.now();
    let stale7 = 0;
    let stale14 = 0;
    let unassigned = 0;

    for (const d of allDetections) {
      const age = d.updatedDate ? now - new Date(d.updatedDate).getTime() : 0;
      if (age >= STALE_14_DAYS) stale14++;
      if (age >= STALE_7_DAYS) stale7++;
      if (!d.assigned_to) unassigned++;
    }

    return { stale7, stale14, unassigned, total: allDetections.length };
  }, [grouped, columns]);

  const distribution = useMemo(() => {
    const items = columns.map(status => ({
      status,
      count: (grouped[status] || []).length,
    }));
    const maxCount = Math.max(...items.map(i => i.count), 1);
    return items.map(item => ({ ...item, pct: (item.count / maxCount) * 100 }));
  }, [grouped, columns]);

  return (
    <div className="w-[280px] flex-shrink-0 bg-surface-container border-l border-outline-variant/20 p-4 overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[13px] font-semibold text-on-surface">Board Analytics</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant/50 hover:text-on-surface-variant"
        >
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>

      {/* Distribution */}
      <div className="mb-5">
        <h4 className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-wider mb-3">Distribution</h4>
        <div className="space-y-2">
          {distribution.map(item => (
            <div key={item.status}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-on-surface-variant">{item.status}</span>
                <span className="text-[11px] font-bold text-on-surface tabular-nums">{item.count}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-container-highest/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#783264]/60 transition-all duration-300"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-3">
        <h4 className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-wider mb-3">Metrics</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-container-highest/30 rounded-xl p-3">
            <div className="text-[10px] text-on-surface-variant/60 mb-1">Stale 7d+</div>
            <div className="text-[18px] font-bold text-on-surface tabular-nums">{stats.stale7}</div>
          </div>
          <div className="bg-surface-container-highest/30 rounded-xl p-3">
            <div className="text-[10px] text-on-surface-variant/60 mb-1">Stale 14d+</div>
            <div className="text-[18px] font-bold text-[#A63D40] tabular-nums">{stats.stale14}</div>
          </div>
          <div className="bg-surface-container-highest/30 rounded-xl p-3">
            <div className="text-[10px] text-on-surface-variant/60 mb-1">Unassigned</div>
            <div className="text-[18px] font-bold text-on-surface tabular-nums">{stats.unassigned}</div>
          </div>
          <div className="bg-surface-container-highest/30 rounded-xl p-3">
            <div className="text-[10px] text-on-surface-variant/60 mb-1">Total</div>
            <div className="text-[18px] font-bold text-on-surface tabular-nums">{stats.total}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
