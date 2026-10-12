import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useActivityLog } from '../../../../hooks/useActivityLog';

const ACTION_DOT_COLORS: Record<string, string> = {
  detection_created: 'bg-green-400', detection_updated: 'bg-blue-400', detection_deleted: 'bg-red-400',
  detection_status_changed: 'bg-amber-400', review_approved: 'bg-emerald-400', review_rejected: 'bg-red-400',
  review_requested: 'bg-purple-400', comment_added: 'bg-sky-400', detection_published: 'bg-teal-400',
};
const ACTION_LABELS: Record<string, string> = {
  detection_created: 'Created', detection_updated: 'Updated', detection_deleted: 'Deleted',
  detection_status_changed: 'Status changed', detection_assigned: 'Assigned', detection_self_assigned: 'Self-assigned',
  review_requested: 'Review requested', review_started: 'Review started', review_approved: 'Approved',
  review_rejected: 'Changes requested', comment_added: 'Commented', detection_published: 'Published', detection_copied: 'Copied',
};
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const RecentActivityWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections } = useDashboardDetections();
  const limit = config.maxItems ?? 8;
  const { activities, isLoading } = useActivityLog({ limit, autoFetch: true });

  const items = useMemo(() => {
    const rangeStart = timeRange.startDate ? new Date(timeRange.startDate).getTime() : 0;
    const rangeEnd = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    const inRange = (ts: string) => {
      if (!timeRange.startDate) return true;
      const t = new Date(ts).getTime();
      return t >= rangeStart && t <= rangeEnd;
    };

    if (activities.length > 0) {
      return activities
        .filter(a => inRange(a.created_at))
        .slice(0, limit)
        .map(a => ({
          action: a.action, name: a.details?.detection_name || a.details?.name || '', entityId: a.entity_id, timestamp: a.created_at,
        }));
    }
    const events: { action: string; name: string; entityId: string; timestamp: string }[] = [];
    for (const d of detections) {
      if (d.updatedDate && d.updatedDate !== d.createdDate) events.push({ action: 'detection_updated', name: d.name, entityId: d.id, timestamp: d.updatedDate });
      if (d.createdDate) events.push({ action: 'detection_created', name: d.name, entityId: d.id, timestamp: d.createdDate });
    }
    return events.filter(e => e.timestamp && inRange(e.timestamp)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  }, [activities, detections, limit, timeRange]);

  if (isLoading) {
    return (
      <div className="p-5 h-full">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Recent Activity</span>
        <div className="mt-3 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-4 bg-surface-container rounded loading-placeholder" />)}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-5 h-full">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Recent Activity</span>
        <p className="text-[12px] font-brand text-on-surface-variant/40 mt-4 text-center">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="p-5 h-full">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Recent Activity</span>
      <div className="mt-3 space-y-0.5">
        {items.map((a, i) => {
          const label = ACTION_LABELS[a.action] || a.action.replace(/_/g, ' ');
          const dotColor = ACTION_DOT_COLORS[a.action] || 'bg-on-surface-variant/30';
          return (
            <div key={`${a.entityId}-${a.action}-${i}`} onClick={() => a.entityId && onNavigate('detail', { id: a.entityId })}
              className="flex items-center gap-2.5 py-2 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
              style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 40}ms forwards` }}>
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
              <div className="flex-1 min-w-0 truncate">
                <span className="text-[12px] font-brand font-medium text-on-surface-variant/70">{label}</span>
                {a.name && <span className="text-[12px] font-brand font-medium text-on-surface ml-1.5">"{a.name}"</span>}
              </div>
              <span className="text-[10px] font-brand text-on-surface-variant/30 flex-shrink-0">{relativeTime(a.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecentActivityWidget;
