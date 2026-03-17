import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useAppData } from '../../../../router/AppDataContext';
import { useLibrary } from '../../../../context/LibraryContext';

const MyAssignmentsWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { detections } = useAppData();
  const { userId } = useLibrary();

  const { assigned, reviews } = useMemo(() => {
    if (!userId || detections.length === 0) return { assigned: [], reviews: [] };
    return {
      assigned: detections.filter(d => d.assigned_to === userId).slice(0, 5),
      reviews: detections.filter(d => d.review_status === 'requested' || d.reviewer_id === userId).slice(0, 5),
    };
  }, [detections, userId]);

  return (
    <div className="p-5 h-full">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">My Queue</span>
      <div className="mt-3">
        <div className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1.5">
          Assigned to me ({assigned.length})
        </div>
        {assigned.length === 0 ? (
          <p className="text-[11px] font-brand text-on-surface-variant/30 mb-3">No assignments</p>
        ) : (
          <div className="space-y-0.5 mb-3">
            {assigned.map(d => (
              <div key={d.id} onClick={() => onNavigate('detail', { id: d.id })}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors">
                <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{d.name}</span>
                <span className="text-[9px] font-brand font-bold text-primary/60 px-1.5 py-0.5 rounded bg-primary/10 flex-shrink-0">{d.status}</span>
              </div>
            ))}
          </div>
        )}
        <div className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1.5">
          Pending Reviews ({reviews.length})
        </div>
        {reviews.length === 0 ? (
          <p className="text-[11px] font-brand text-on-surface-variant/30">No pending reviews</p>
        ) : (
          <div className="space-y-0.5">
            {reviews.map(d => (
              <div key={d.id} onClick={() => onNavigate('detail', { id: d.id })}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors">
                <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{d.name}</span>
                <span className="text-[9px] font-brand font-bold text-purple-400/80 px-1.5 py-0.5 rounded bg-purple-400/10 flex-shrink-0">Review</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyAssignmentsWidget;
