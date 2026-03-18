import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Detection } from '../../types';
import { SeverityBadge } from '../SeverityBadge';
import { ReviewStatusBadge } from '../rbac/ReviewStatusBadge';
import { CircularProgress } from '../CircularProgress';
import { KanbanCardMenu } from './KanbanCardMenu';
import { scoreDetection } from '../../lib/quality/scoringEngine';
import { routeHelpers } from '../../router/routes';
import { useNavigate } from 'react-router-dom';

interface KanbanCardProps {
  detection: Detection;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  overlay?: boolean;
}

const STALE_WARNING_DAYS = 7;
const STALE_CRITICAL_DAYS = 14;

function getStaleIndicator(updatedDate: string | undefined): 'none' | 'warning' | 'critical' {
  if (!updatedDate) return 'none';
  const days = Math.floor((Date.now() - new Date(updatedDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days >= STALE_CRITICAL_DAYS) return 'critical';
  if (days >= STALE_WARNING_DAYS) return 'warning';
  return 'none';
}

function getInitials(name?: string, email?: string): string {
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (email) return email[0].toUpperCase();
  return '?';
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500/20 text-emerald-400',
  B: 'bg-blue-500/20 text-blue-400',
  C: 'bg-amber-500/20 text-amber-400',
  D: 'bg-orange-500/20 text-orange-400',
  F: 'bg-red-500/20 text-red-400',
};

export const KanbanCard: React.FC<KanbanCardProps> = ({
  detection,
  isSelected = false,
  onToggleSelect,
  overlay = false,
}) => {
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: detection.id,
    data: { detection },
    disabled: overlay,
  });

  const style = overlay ? undefined : {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onToggleSelect?.(detection.id);
      return;
    }
    navigate(routeHelpers.detectionDetail(detection.id));
  };

  const firstTactic = detection.mitreTactics?.[0] || detection.mitreAttackIds?.[0];

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={`group rounded-xl border bg-surface-container-low p-3 cursor-grab active:cursor-grabbing transition-all hover:border-outline-variant/50 ${
        isSelected ? 'ring-2 ring-primary/50 border-primary/30' : 'border-outline-variant/20'
      } ${isDragging && !overlay ? 'shadow-lg' : ''}`}
      onClick={handleClick}
      {...(overlay ? {} : { ...attributes, ...listeners })}
    >
      {/* Header: name + menu */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <p className="text-sm font-medium text-on-surface line-clamp-2 flex-1">
          {detection.name}
        </p>
        <KanbanCardMenu detection={detection} />
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-2 flex-wrap">
        {detection.severity && (
          <SeverityBadge severity={detection.severity} size="xs" />
        )}
        {firstTactic && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant truncate max-w-[80px]">
            {firstTactic}
          </span>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/10">
        <div className="flex items-center gap-1.5">
          {(() => {
            const stale = getStaleIndicator(detection.updatedDate);
            if (stale === 'critical') return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Stale: >14 days" />;
            if (stale === 'warning') return <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="Stale: >7 days" />;
            return null;
          })()}
          {detection.qualityScore != null && detection.qualityScore > 0 && (
            <CircularProgress score={detection.qualityScore} size={24} strokeWidth={2} showLabel={false} />
          )}
          {(() => {
            const quality = scoreDetection(detection);
            return (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${GRADE_COLORS[quality.grade] || ''}`}>
                {quality.grade}
              </span>
            );
          })()}
          {detection.review_status && detection.review_status !== 'none' && (
            <ReviewStatusBadge status={detection.review_status} size="sm" />
          )}
        </div>
        {detection.assigned_to && (
          <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0" title={`Assigned: ${detection.assigned_to}`}>
            {getInitials(undefined, detection.assigned_to)}
          </div>
        )}
      </div>
    </div>
  );
};
