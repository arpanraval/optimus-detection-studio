import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Detection, Status } from '../../types';
import { STATUS_COLORS } from '../../constants';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  status: Status;
  detections: Detection[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  detections,
  selectedIds,
  onToggleSelect,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status },
  });

  const avgQuality = detections.length > 0
    ? Math.round(detections.reduce((sum, d) => sum + (d.qualityScore || 0), 0) / detections.length)
    : 0;

  const colorClass = STATUS_COLORS[status] || '';
  const bgColorClass = colorClass.split(' ').find(c => c.startsWith('bg-')) || 'bg-gray-500/20';

  const detectionIds = detections.map(d => d.id);

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${bgColorClass.replace('/20', '')}`} />
          <h3 className="text-sm font-medium text-on-surface">{status}</h3>
          <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-container text-on-surface-variant">
            {detections.length}
          </span>
        </div>
        {detections.length > 0 && (
          <span className="text-xs text-on-surface-variant" title="Average quality score">
            avg {avgQuality}
          </span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 space-y-2 overflow-y-auto transition-colors ${
          isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : 'bg-surface-container/30'
        }`}
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        <SortableContext items={detectionIds} strategy={verticalListSortingStrategy}>
          {detections.map(detection => (
            <KanbanCard
              key={detection.id}
              detection={detection}
              isSelected={selectedIds.has(detection.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>

        {detections.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-on-surface-variant/50">
            No detections
          </div>
        )}
      </div>
    </div>
  );
};
