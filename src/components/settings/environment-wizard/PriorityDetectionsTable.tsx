// src/components/settings/environment-wizard/PriorityDetectionsTable.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { RecommendedDetection } from '../../../hooks/useProfileIntelligence';
import { routeHelpers } from '../../../router/routes';

const SEVERITY_COLORS: Record<string, string> = {
  'Critical': 'bg-red-500/20 text-red-400',
  'High': 'bg-orange-500/20 text-orange-400',
  'Medium': 'bg-yellow-500/20 text-yellow-400',
  'Low': 'bg-blue-500/20 text-blue-400',
};

interface PriorityDetectionsTableProps {
  detections: RecommendedDetection[];
  totalCount: number;
  onAddToPipeline: (detectionIds: string[]) => void;
  onViewAll: () => void;
  loading: boolean;
}

export const PriorityDetectionsTable: React.FC<PriorityDetectionsTableProps> = ({
  detections, totalCount, onAddToPipeline, onViewAll, loading,
}) => {
  const navigate = useNavigate();
  const top10 = detections.slice(0, 10);

  if (loading) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
            Priority Detections
          </span>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-surface-container-high/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
          Priority Detections
        </span>
        {totalCount > 10 && (
          <button
            onClick={onViewAll}
            className="text-[11px] font-brand font-bold text-primary hover:text-primary/70 transition-colors tracking-wide"
          >
            View all {totalCount.toLocaleString()}
          </button>
        )}
      </div>

      {/* Rows */}
      <div className="divide-y divide-outline-variant/5">
        {top10.map((d, i) => {
          const mitreId = d.mitreAttackIds[0] || d.mitreTechniques[0] || null;
          const severityClass = SEVERITY_COLORS[d.severity] || 'bg-surface-container-high/30 text-on-surface-variant';
          const groupCount = d.threatGroupNames.length;

          return (
            <div
              key={d.id}
              className="group px-4 py-3 flex items-center gap-4 hover:bg-surface-container-high/50 transition-colors"
              style={{ opacity: 0, animation: `slideUp 250ms ease ${i * 40}ms forwards` }}
            >
              {/* 1. Rank */}
              <span className="text-base font-bold text-on-surface-variant/40 w-6 text-center tabular-nums">
                {i + 1}
              </span>

              {/* 2. MITRE ID badge */}
              {mitreId ? (
                <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded shrink-0">
                  {mitreId}
                </span>
              ) : (
                <span className="font-mono text-xs text-on-surface-variant/30 px-2 py-1 w-[72px] shrink-0">
                  --
                </span>
              )}

              {/* 3. Detection name */}
              <button
                onClick={() => navigate(routeHelpers.detectionDetail(d.id))}
                className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors truncate min-w-0 flex-1 text-left"
                title={d.name}
              >
                {d.name}
              </button>

              {/* 4. Severity badge */}
              <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${severityClass}`}>
                {d.severity}
              </span>

              {/* 5. Threat group indicator */}
              <span className="shrink-0 w-24 text-right">
                {groupCount > 0 ? (
                  <span
                    className="text-xs font-medium text-red-400"
                    title={d.threatGroupNames.join(', ')}
                  >
                    {groupCount <= 1
                      ? d.threatGroupNames[0]
                      : `${d.threatGroupNames[0]} +${groupCount - 1}`}
                  </span>
                ) : (
                  <span className="text-xs text-on-surface-variant/20">--</span>
                )}
              </span>

              {/* 6. Deploy button */}
              <button
                onClick={() => onAddToPipeline([d.id])}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
              >
                Deploy
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
