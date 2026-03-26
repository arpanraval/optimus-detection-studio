import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Detection, DetectionType } from '../../types';
import { SeverityBadge } from '../SeverityBadge';
import { ReviewStatusBadge } from '../rbac/ReviewStatusBadge';
import { Icon } from '../Icon';
import { KanbanCardMenu } from './KanbanCardMenu';
import { getScoreColor, formatRelativeDate } from '../card-utils';
import { routeHelpers } from '../../router/routes';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../../context/LibraryContext';
import { useAssignment } from '../../hooks/useAssignment';
import type { UserLookup } from './KanbanBoard';

interface KanbanCardProps {
  detection: Detection;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  overlay?: boolean;
  userLookup?: UserLookup;
  cardDensity?: 'comfortable' | 'compact';
  isFlagged?: boolean;
  onToggleFlag?: (id: string) => void;
}

// Avatar colors (same as Sidebar)
const AVATAR_COLORS = [
  { bg: 'bg-violet-500/15', text: 'text-violet-400' },
  { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  { bg: 'bg-teal-500/15', text: 'text-teal-400' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400' },
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const STALE_WARNING_DAYS = 7;
const STALE_CRITICAL_DAYS = 14;

function getStaleInfo(updatedDate: string | undefined): { level: 'none' | 'warning' | 'critical'; days: number } {
  if (!updatedDate) return { level: 'none', days: 0 };
  const days = Math.floor((Date.now() - new Date(updatedDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days >= STALE_CRITICAL_DAYS) return { level: 'critical', days };
  if (days >= STALE_WARNING_DAYS) return { level: 'warning', days };
  return { level: 'none', days };
}

// Micro quality circle for kanban cards (28px)
const QualityCircle: React.FC<{ score: number }> = ({ score }) => {
  const { hex } = getScoreColor(score);
  const size = 28;
  const radius = 10;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center rounded-full flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: `${hex}10` }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} stroke={`${hex}20`} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          strokeWidth={strokeWidth} stroke={hex} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
        />
      </svg>
      <span className="absolute text-[8px] font-bold" style={{ color: hex }}>{score}</span>
    </div>
  );
};

export const KanbanCard: React.FC<KanbanCardProps> = ({
  detection,
  isSelected = false,
  onToggleSelect,
  overlay = false,
  userLookup = {},
  cardDensity,
  isFlagged = false,
  onToggleFlag,
}) => {
  const navigate = useNavigate();
  const { userId, refreshAll } = useLibrary();
  const { assignDetection } = useAssignment({ onAssignmentChange: () => refreshAll() });
  const [assigning, setAssigning] = useState(false);
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: detection.id, data: { detection }, disabled: overlay });

  const style = overlay ? undefined : {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onToggleSelect?.(detection.id);
      return;
    }
    navigate(routeHelpers.detectionDetail(detection.id));
  };

  const qualityScore = detection.qualityScore || 0;
  const stale = getStaleInfo(detection.updatedDate);

  if (cardDensity === 'compact') {
    return (
      <div
        ref={overlay ? undefined : setNodeRef}
        style={style}
        className={`group relative rounded-xl bg-surface-container border px-3 py-1.5 cursor-grab hover:bg-surface-container-high transition-all ${
          isSelected
            ? 'border-[#783264] border-2 ring-2 ring-[#783264]/20'
            : 'border-outline-variant/30 hover:border-[#783264]/40'
        } ${isDragging && !overlay ? 'shadow-xl' : ''} ${overlay ? 'shadow-2xl border-[#783264]/40' : ''}`}
        onClick={handleClick}
        {...(overlay ? {} : { ...attributes, ...listeners })}
      >
        <div className="flex items-center gap-2">
          <SeverityBadge severity={detection.severity} size="xs" />
          <p className="text-[11px] text-on-surface truncate flex-1">{detection.name}</p>
          {isFlagged && <Icon name="flag" className="w-3 h-3 text-[#A63D40] flex-shrink-0" />}
          <QualityCircle score={qualityScore} />
        </div>
      </div>
    );
  }

  const daysInColumn = detection.updatedDate
    ? Math.floor((Date.now() - new Date(detection.updatedDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const agingLevel = daysInColumn >= 14 ? 3 : daysInColumn >= 7 ? 2 : daysInColumn >= 3 ? 1 : 0;

  // Due date
  const dueDateRaw = (detection as any).due_date as string | undefined;
  const isDueSoon = dueDateRaw ? (() => {
    const due = new Date(dueDateRaw);
    const daysUntilDue = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { daysUntilDue, isOverdue: daysUntilDue < 0, isUrgent: daysUntilDue >= 0 && daysUntilDue <= 3 };
  })() : null;

  // MITRE data
  const tactics = detection.mitreTactics || [];
  const techniques = detection.mitreAttackIds || [];

  // Query languages
  const queryLanguages = detection.queries?.length > 0
    ? [...new Set(detection.queries.map(q => q.language))]
    : [detection.queryLanguage].filter(Boolean);

  // Detection type short label
  const typeLabel = detection.detectionType === DetectionType.Hunting ? 'Hunt'
    : detection.detectionType === DetectionType.Correlation ? 'Corr'
    : detection.detectionType === DetectionType.Anomaly ? 'Anom'
    : null;

  // Log sources
  const logSources = detection.logSources?.length ? detection.logSources : (detection.logSource ? [detection.logSource] : []);

  const isAssignedToMe = detection.assigned_to === userId;

  const handleAssignToMe = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!userId || assigning) return;
    setAssigning(true);
    await assignDetection(detection, userId);
    setAssigning(false);
  };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={`
        group relative rounded-2xl p-4 transition-all duration-200
        cursor-grab active:cursor-grabbing
        bg-surface-container border
        hover:bg-surface-container-high hover:shadow-md hover:scale-[1.01]
        ${isSelected
          ? 'border-[#783264] border-2 ring-2 ring-[#783264]/20'
          : 'border-outline-variant/30 hover:border-[#783264]/40'
        }
        ${isDragging && !overlay ? 'shadow-xl' : ''}
        ${overlay ? 'shadow-2xl border-[#783264]/40' : ''}
      `}
      onClick={handleClick}
      {...(overlay ? {} : { ...attributes, ...listeners })}
    >
      {/* Row 1: Title + Menu */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-on-surface leading-snug line-clamp-2 group-hover:text-[#783264] transition-colors">
            {detection.name}
          </p>
        </div>
        <KanbanCardMenu detection={detection} isFlagged={isFlagged} onToggleFlag={onToggleFlag} />
      </div>
      {isFlagged && (
        <div className="absolute top-2 right-10 w-5 h-5 rounded-md bg-[#A63D40]/15 flex items-center justify-center" title="Flagged as blocked">
          <Icon name="flag" className="w-3 h-3 text-[#A63D40]" />
        </div>
      )}

      {/* Row 2: Description snippet */}
      {detection.description && (
        <p className="text-[11px] text-on-surface-variant/70 line-clamp-2 leading-relaxed mb-2.5">
          {detection.description}
        </p>
      )}

      {/* Row 3: MITRE Mapping */}
      {(tactics.length > 0 || techniques.length > 0) && (
        <div className="bg-surface-container-highest/40 rounded-xl p-2 mb-2.5 space-y-1">
          {tactics.length > 0 && (
            <div className="flex items-center gap-1 overflow-hidden">
              <Icon name="target" className="w-2.5 h-2.5 text-[#783264] flex-shrink-0" />
              {tactics.slice(0, 2).map(t => (
                <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[#783264]/10 text-[#783264] border border-[#783264]/15 truncate max-w-[90px]">
                  {t}
                </span>
              ))}
              {tactics.length > 2 && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant">
                  +{tactics.length - 2}
                </span>
              )}
            </div>
          )}
          {techniques.length > 0 && (
            <div className="flex items-center gap-1 overflow-hidden">
              <Icon name="zap" className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" />
              {techniques.slice(0, 2).map(t => (
                <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/15 truncate max-w-[90px] font-mono">
                  {t}
                </span>
              ))}
              {techniques.length > 2 && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant">
                  +{techniques.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Row 4: Metadata badges */}
      <div className="flex items-center gap-1 flex-wrap mb-2.5">
        <SeverityBadge severity={detection.severity} size="xs" />
        {typeLabel && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant border border-outline-variant/20">
            {typeLabel}
          </span>
        )}
        {queryLanguages.slice(0, 1).map(lang => (
          <span key={lang} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant border border-outline-variant/20">
            {lang}
          </span>
        ))}
        {logSources.slice(0, 1).map(src => (
          <span key={src} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/15 truncate max-w-[80px]">
            {src}
          </span>
        ))}
        {detection.review_status && detection.review_status !== 'none' && (
          <ReviewStatusBadge status={detection.review_status} size="sm" />
        )}
      </div>

      {/* Row 4.5: Linked items + investigation progress */}
      {(() => {
        const linkedCount = (detection.linkedGroups?.length || 0) + (detection.linkedSoftware?.length || 0) + (detection.linkedCampaigns?.length || 0);
        const investigationTotal = detection.investigationSteps?.length || 0;
        const hasLinks = linkedCount > 0;
        const hasSteps = investigationTotal > 0;

        if (!hasLinks && !hasSteps) return null;

        return (
          <div className="flex items-center gap-2 mb-2.5">
            {hasLinks && (
              <span className="text-[9px] flex items-center gap-1 text-on-surface-variant/50" title={`${linkedCount} linked threat intel items`}>
                <Icon name="link" className="w-2.5 h-2.5" />
                {linkedCount} linked
              </span>
            )}
            {hasSteps && (
              <span className="text-[9px] flex items-center gap-1 text-on-surface-variant/50" title={`${investigationTotal} investigation steps`}>
                <Icon name="clipboard-check" className="w-2.5 h-2.5" />
                {investigationTotal} steps
              </span>
            )}
          </div>
        );
      })()}

      {/* Row 5: Footer - Quality Score + Updated + Assignee */}
      <div className="flex items-center justify-between pt-2.5 border-t border-outline-variant/15">
        <div className="flex items-center gap-2">
          <QualityCircle score={qualityScore} />
          {detection.updatedDate && (
            <span className={`text-[9px] flex items-center gap-1 ${
              stale.level === 'critical' ? 'text-[#A63D40]'
              : stale.level === 'warning' ? 'text-yellow-500'
              : 'text-on-surface-variant/50'
            }`}>
              {stale.level !== 'none' && <Icon name="clock" className="w-2.5 h-2.5" />}
              {formatRelativeDate(detection.updatedDate)}
            </span>
          )}
          {agingLevel > 0 && (
            <div className="flex items-center gap-0.5 ml-1" title={`${daysInColumn} days in ${detection.status}`}>
              {Array.from({ length: agingLevel }).map((_, i) => (
                <div key={i} className={`w-1 h-1 rounded-full ${
                  agingLevel >= 3 ? 'bg-[#A63D40]' : agingLevel >= 2 ? 'bg-yellow-500' : 'bg-on-surface-variant/30'
                }`} />
              ))}
            </div>
          )}
          {isDueSoon && (
            <span className={`text-[9px] flex items-center gap-0.5 ${
              isDueSoon.isOverdue ? 'text-[#A63D40]' : isDueSoon.isUrgent ? 'text-yellow-500' : 'text-on-surface-variant/50'
            }`} title={`Due: ${new Date(dueDateRaw!).toLocaleDateString()}`}>
              <Icon name="calendar" className="w-2.5 h-2.5" />
              {isDueSoon.isOverdue
                ? `${Math.abs(isDueSoon.daysUntilDue)}d overdue`
                : isDueSoon.daysUntilDue === 0 ? 'Due today'
                : `${isDueSoon.daysUntilDue}d left`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {detection.review_notes && (
            <span className="text-on-surface-variant/40" title="Has review notes">
              <Icon name="message-square" className="w-3 h-3" />
            </span>
          )}
          {detection.testedAndValidated && (
            <span className="text-[#4D7C6F]/60" title="Tested & Validated">
              <Icon name="check-check" className="w-3 h-3" />
            </span>
          )}
          {detection.assigned_to ? (() => {
            const user = userLookup[detection.assigned_to];
            const displayName = user?.name || '?';
            const initials = getInitials(displayName);
            const color = getAvatarColor(user?.email || detection.assigned_to);
            return (
              <div
                className={`w-6 h-6 rounded-lg text-[9px] font-semibold flex items-center justify-center flex-shrink-0 ${color.bg} ${color.text}`}
                title={displayName}
              >
                {initials}
              </div>
            );
          })() : (
            <button
              onClick={handleAssignToMe}
              disabled={assigning}
              title="Assign to me"
              className="w-6 h-6 rounded-lg bg-surface-container-highest/60 text-on-surface-variant/50 flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 hover:bg-[#783264]/15 hover:text-[#783264] transition-all"
            >
              {assigning ? (
                <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon name="user-plus" className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
